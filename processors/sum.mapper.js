//	@sum
//
//	Processor to sum the values in a column.
//
//	TODO: handle non-numeric datatypes.
//

//	On the first run output will be undefined
//
if(output === void 0) {
	output = 0;
}

//	Add input to output.
//
output += +(input === void 0 ? 0 : input);

return output;