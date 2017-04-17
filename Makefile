serve-demo:
	cp -fr dist	demo/
	cd demo/; python -m SimpleHTTPServer 9000
