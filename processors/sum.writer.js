//	This is for prettifying, not necessary.
//
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

string += "+ Sum:\t" + padRight(" ", 10, columnData) + "@@`";

return string;