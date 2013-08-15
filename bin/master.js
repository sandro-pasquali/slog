//	Logs are a time series. This system works with CSV rows, arranged sequentially.
//	The first two columns of a logged row *MUST* be <timestamp>,<value>.
//	Any number of other columns may be added. A #columnProcessor must be defined for these
//	rows if their data is to be analyzed. If no #columnProcessor is defined, these additional
//	columns are ignored.
//
// 	node bin/master.js -f ./long.log -rmin 0 -rmax 20 -cp 1:processors/sum 2:processors/distribution
// 	slog -f ./long.log -rmin 0 -rmax 20 -cp 1:processors/sum 2:processors/distribution
//
var clio = require('clio')({
	useLines	: false,
	options	    : {
		"-f --file"		: "The log file to parse.",
		"-rmin"			: "The minimum range value.",
		"-rmax"			: "The maximum range value.",
		"-cp --colProc"	: "Establish column processors",
		"-v --verbose"  : "Whether to export results"
	}
});
clio.parse();

var fs 		= require('fs');
var util	= require('util');
var path	= require('path');
var moment 	= require("moment");
var rmdir	= require("rimraf");
var child 	= require('child_process');
var async	= require('./async.js');

//	Note that no checking is done. Format:
//	> node logparser targetlog
//
var filename	= clio.get("-f");
var rmin		= clio.get("-rmin");
var rmax		= clio.get("-rmax");
var fileout		= clio.get("-o");

var normalizedFilename  = filename.replace(/\//g, "_").replace(/[^_\w]/g, "");

var fileChunkLength	= 1e6;
var fileLength;

//	Custom column processors will write to this. See below.
//
var columnProcessors = [];

//	Column processors write to this array, indexed by the column the processor worked against.
//
var columnData = [];

var functionInstance = function(fbody) {
    return Function(
        "with(this) { return (function(){" + fbody + "})(); };"
    )
};

var pad = function(d, padstr, len, sub) {

	var s = new String(sub);

	while(s.length < len) {
		s = d === "r" ? s + padstr : padstr + s;
	}

	return s;
};

//	##padRight
//
var padRight = function(p, l, s) {
	return pad("r", p, l, s);
}

var parseStart = new Date().getTime();

var writeResults = function(data, out) {

    var timeFormat	= "MMMM Do YYYY, h:mm:ss a";
    var i;
    var seconds 	= (data.end - data.start) / 1000;
    var str         = "";

  	//	Show results... eventually write to a data file and/or create an html page.
  	//
	str += "\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`\
+ FILE: @blue" + filename + "@@\tCPUS: @red" + require('os').cpus().length + "@@ +`\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`\
+++++++++++++++++++++++++++++++++++++@yellow@_blackStats@@++++++++++++++++++++++++++++++++++++++`\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`\
@greenOperation took: " + ((new Date().getTime() - parseStart)/1000) + " seconds`\
Log start: " + moment(data.start).format(timeFormat) + "`\
Log end: " + moment(data.end).format(timeFormat) + "`\
Total Seconds: " + seconds + "`\
Total Datapoints: " + data.totalPoints + "`\
Throughput: " + (data.totalPoints / seconds).toFixed(3) + "/second`\
Outliers under (" + rmin + "): " + data.outliers.under + " (%" + (data.outliers.under / data.totalPoints * 100).toFixed(3) + ")`\
Outliers over (" + rmax + "): " + data.outliers.over + " (%" + (data.outliers.over / data.totalPoints * 100).toFixed(3) + ")`\
@@++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`\
++++++++++++++++++++++@yellow@_blackDistribution (Milliseconds : Count)@@+++++++++++++++++++++++`\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`";

	for(i=rmin; i <= rmax; i++) {
		str += "+ " + i + " :\t" + padRight(" ", 10, data.range[i]) + "\t@black@_cyan(%" + (100/data.totalPoints*data.range[i]).toFixed(3) + ")@@`";
	}

	str += "\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`\
+++++++++++++++++++++++++++++++++@yellow@_blackPercentiles@@++++++++++++++++++++++++++++++++++++`\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`";

	for(i=rmin; i <= rmax; i++) {
		str += "+ " + i + " :\t" + padRight(" ", 10, data.percentiles[i]) + "\t@black@_cyan(" + (100.000 - data.percentiles[i]).toFixed(3) + ")@@`";
	}

	columnProcessors.forEach(function(cp) {
		if(cp.writer) {
			str += cp.writer.call({
				columnIndex : cp.colIdx,
				columnData	: columnData[cp.colIdx]
			});
		}
	});

	str += "++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`";

	if(fileLength !== data.totalPoints) {
		str += "+ @white@_red WARNING Count mismatch > file row count " + fileLength + " > data points " + data.totalPoints + " @@`";
		str += "++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`";
	}

	if(out) {
		str = clio.detokenize(str);
	}

	(out || clio).write(str);
};

child.exec("wc -l " + filename, function(e, fL) {

	fileLength = parseInt(fL.replace(filename, ""));
	
	var fileRanges = [];
	var oStart = 1;
	var oEnd = fileChunkLength;

	while(oStart < fileLength) {
		fileRanges.push({
			offsetStart	: oStart,
			offsetEnd	: oEnd
		})
		oStart = oEnd + 1;
		oEnd = Math.min(oStart + fileChunkLength, fileLength);
	} 

	//	Build column processor collection, if any
	//
	var colProc	= clio.get("-cp");
	(colProc ? util.isArray(colProc) ? colProc : [colProc] : []).forEach(function(f) {
	
		var cs 	= f.split(":");
	
		var v	= {
			colIdx	: cs[0],
			mapFile	: cs[1] + ".mapper.js"
		}
	
		//	Reducers and writers are optional.
		//
		try {
			v.reducer = fs.readFileSync(cs[1] + ".reducer.js");
		} catch(e) {
			throw new Error("Unable to load reducer. Got: " + cs[1] + " prefix");
		}
	
		v.reducer = v.reducer ? functionInstance(v.reducer) : void 0;
	
		try {
			v.writer = fs.readFileSync(cs[1] + ".writer.js");
		} catch(e) {
			throw new Error("Unable to load writer. Got: " + cs[1] + " prefix");
		}
	
		v.writer = v.writer ? functionInstance(v.writer) : void 0;
		
		columnProcessors.push(v);
	});

	//	For each file create a worker, send that worker the file to work on, when
	//	worker is finished pass along results, aggregate, analyze.
	//
	async.parallel(function(range, idx, res, next) {
	
		var w = child.fork('bin/worker');
	
		w.send({
			file				: filename,
			offsetStart			: range.offsetStart,
			offsetEnd			: range.offsetEnd,
			rmin        		: rmin,
			rmax        		: rmax,
			columnProcessors	: columnProcessors
		});
	
		w.on('message', function(m) {
			next(null, m, idx);
		});
	
	}, function(rs) {

		var data 		= rs.stack;
		
		var range       = [];
		var outliers    = {
			over    : 0,
			under   : 0
		};
		var percentiles	= [];
		var start       = Infinity;
		var end         = -Infinity;
		var r           = data.length;
		var pc          = 0;
		var x           = rmax;
		var totalPoints = 0;
		var rr;
		var oo;
		var aa;
		var i;
		var rv;

		//	Initialize final #range with zeros(0)
		//
		do {
			range[x] = 0;
			--x;
		} while(x >= rmin);

		//  Run through each worker result, ending up with data set start time, end time,
		//
		while(r--) {

			rr  = data[r].range;
			oo  = data[r].outliers;
			aa 	= data[r].accumulatedColumns || [];

			outliers.over   += oo.over;
			outliers.under  += oo.under;

			start   = Math.min(start, data[r].start);
			end     = Math.max(end, data[r].end);

			for(i=rmin; i <= rmax; i++) {
				range[i]    += rr[i];
				totalPoints += rr[i];
			}

			//	For each of the columns which have a processor, send the column
			//	reducer the current column value, and set #columnData to the result.
			//
			columnProcessors.forEach(function(m) {
				if(m.reducer) {
					columnData[m.colIdx] = columnData[m.colIdx] || void 0;
					columnData[m.colIdx] = m.reducer.call({
						input	: aa[m.colIdx],
						output  : columnData[m.colIdx]
					});
				} else {
					columnData[m.colIdx] = columnData[m.colIdx] || [];
					columnData[m.colIdx].push(aa[m.colIdx]);
				}
			});
		}

		//  Outliers form part of total datapoint set.
		//
		totalPoints += outliers.over + outliers.under;

		//	Calculate percentile rank.
		//
		//	((scores lower than candidate) + (scores the same as candidate) / (total scores) * 100;
		//
		for(i=rmin; i <= rmax; i++) {
			rv = range[i] === void 0 ? 0 : parseInt(range[i]);
			percentiles[i] = ((pc + rv) / totalPoints * 100).toFixed(3);
			pc += rv;
		};

		writeResults({
			range   	: range,
			percentiles : percentiles,
			outliers    : outliers,
			totalPoints : totalPoints,
			start       : start,
			end         : end
		}, fileout)

	}, fileRanges);
});










