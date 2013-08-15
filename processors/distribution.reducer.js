//
var x;

input 	= input 	|| {};
output	= output 	|| {};

for(x in input) {
	output[x] = output[x] || 0;
	output[x] += input[x];
}

return output;