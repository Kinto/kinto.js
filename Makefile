tests:
	babel-node node_modules/.bin/isparta cover --report text $npm_package_config_ISPARTA_OPTS node_modules/.bin/_mocha
	./node_modules/coveralls/bin/coveralls.js < ./coverage/lcov.info
