# Note: this contains a single command package.json scripts are unlikely being
# capable to achieve.
test-functional:
	npm run selenium-start &> /dev/null &
	npm run demo &> /dev/null &
	sleep 2
	mocha --compilers js:babel/register test/functional/*_test.js
