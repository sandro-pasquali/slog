//	@distribution
//
//	Counts the occurrences of distinct values in a column.
//

//	The first time this is called output will be undefined
//
output = output || {};

//	Ensure we have initialized the slot for the datapoint
//
if(output[input] === void 0) {
	output[input] = 0;
}

output[input]++;

return output;

