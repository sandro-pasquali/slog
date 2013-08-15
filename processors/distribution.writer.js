var n;

var padRight = function(padstr, len, sub) {

	var s = sub;

	while(s.length < len) {
		s += padstr;
	}

	return s;
};

var string = "\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`\
+++++++++++++++++++++++++++++++++@yellow@_blackColumn #" + columnIndex + "@@++++++++++++++++++++++++++++++++++++`\
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`";

for(n in columnData) {
	string += "+ " + n + " :\t" + padRight(" ", 10, columnData[n]) + "@@`";
};

return string;