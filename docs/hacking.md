# Hacking on Kinto.js

Hacking on Kinto.js requires to setup a [NodeJS v0.12x environment](https://nodejs.org/download/).

## Installation

Code is [hosted on Github](https://github.com/mozilla-services/kinto.js).

    $ git co https://github.com/mozilla-services/kinto.js
    $ cd kinto.js
    $ npm install

## Tests

    $ npm test

This will also run code coverage and send the report to [Coveralls](http://coveralls.io/). Alternatives:

    $ npm run test-nocover    # runs tests skipping code coverage
    $ npm run test-cover      # runs tests, code coverage; doesn't send results
    $ npm run test-cover-html # runs tests, code coverage and opens a fancy html report

Note that code coverage reports are also [browseable on Coveralls](https://coveralls.io/r/mozilla-services/kinto.js).

### TDD mode

This command will watch for changes on the js source files then rerun the tests:

    $ npm run tdd

Note that it won't perform code coverage analysis.

You can also grep to run a subset of tests that way:

    $ npm run tdd -- -g Api # only runs Api-related tests

## Generating dist files

    $ npm run dist

This should have created the following assets:

-  `dist/kinto.dev.js`: Developement version, unminified, embedding source maps;
-  `dist/kinto.min.js`: Production version, minified, no source maps.

## Updating docs

Docs are written in [Markdown](http://daringfireball.net/projects/markdown/syntax) using [mkdocs](http://www.mkdocs.org/), and are hosted on [readthedocs](https://readthedocs.org/).

Document sources are versionned in the Kinto.js repository, under the [docs/ directory](https://github.com/mozilla-services/kinto.js/tree/master/docs). Updates are automatically deployed when pushed to `origin/master`. That means the docs site is automatically updated everytime a PR lands.

To build docs locally, ensure mkdocs is [properly installed](http://www.mkdocs.org/#installation), then run:

    $ mkdocs build --clean

To serve them over http locally so you can see your modifications in real time:

    $ mkdocs serve

## Publishing to npm

    $ npm run publish
