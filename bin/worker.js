// node bin/master.js -f ./long.log -rmin 0 -rmax 20 -v -cp 1:processors/sum 2:processors/distributio

const fs 	= require('fs');

var functionInstance = function(fbody) {
    return Function(
        "with(this) { return (function(){" + fbody + "})(); };"
    )
};

//	Will receive an object #m with attributes:
//
//	#filename			The file which this worker will write to.
//	#columnProcessors	An array of column processors, which this file might fetch the #mapFile of.
//	#rmin				The minimum range value.
//	#rmax				The maximum range value.
//

process.on('message', function(m) {

    const filename	= m.filename;
    const rmin		= m.rmin;
    const rmax		= m.rmax;

	//	The accumulated results, indexed by column, returned by column processors.
	//
	var accumulatedColumns	= [];

	//	A collection of column processor functions.
	//
	var columnProcessors	= [];

	//	Run through the column processors and redefine them as function instances.
	//	Initialize the #accumulatedColumns array.
	//
	m.columnProcessors.forEach(function(cp) {

		var file 	= cp.mapFile;
		var idx		= cp.colIdx;

		try {
			columnProcessors[idx] 		= functionInstance(fs.readFileSync(file));
			accumulatedColumns[idx] 	= void 0;
		} catch(e) {
			throw "Error while creating column processor: " + file + " : " + e;
		}
	});

    fs.readFile(filename, function(err, data) {

        if(err) {
            throw err;
        }

        data = data.toString().split("\n");

        var range 		= [];
        var outliers	= {
            under	: 0,
            over	: 0
        };

        var i		= data.length;
        var x		= rmax;
        var n;
        var start;
        var end;
        var row;
        var context;

        //	Initialize #range with zeros(0)
        //
        do {
            range[x] = 0;
            --x;
        } while(x >= rmin);

        //	Fetching each row, splitting on comma(,) grab timestamp and execution time,
        //	fill #range with exec time values, keying on exec time (note that this may mean a
        //	sparse array), and storing any exec times rmin <> rmax in #outliers[under || over].
        //
        while(i--) {

            row = data[i].split(",");

            n = parseInt(row[1]);

			//	May have headers (strings)
			//
            if(!isNaN(parseFloat(n)) && isFinite(n)) {

                if(!end) {
                    end =  parseInt(row[0]);
                }

                if(range[n] !== void 0) {
                    range[n]++
                } else {
                    if(n < rmin) {
                        outliers.under++;
                    } else {
                        outliers.over++;
                    }
                }
            }

			//	For each column index check if we have a processor, and if so accumulate
			//  results from column processor.
			//
            for(x=0; x < row.length; x++) {
				if(columnProcessors[x]) {
					//	#input	: 	value of column.
					//	#output	: 	current accumulated value of column.
					//	#row	: 	a *copy* of this row; can be altered/used by processor
					//				without side effects.
					//
					accumulatedColumns[x] = columnProcessors[x].call({
						input	: row[x],
						output	: accumulatedColumns[x],
						row		: row.slice(0)
					});
				}
            }
        }

        start	= parseInt(row[0]);

        //  Note that we're unlinking the data chunk we just worked on.
        //
        fs.unlink(filename, function(err) {
            if(err) {
                throw err;
            }

            process.send({
                range       		: range,
                outliers    		: outliers,
                start       		: start,
                end         		: end,
				accumulatedColumns	: accumulatedColumns
            });

            process.exit();
        });
    });
});



