//	On first run output will be undefined
//
if(output === void 0) {
	output = 0;
}

//	Reduce all the worker results (a count of column values) by adding them.
//
output += +input;

return output;