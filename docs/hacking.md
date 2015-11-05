# Hacking on Kinto.js

Hacking on Kinto.js requires a working [NodeJS v0.12x environment](https://nodejs.org/download/).

## Installation

Source code is [hosted on Github](https://github.com/Kinto/kinto.js).

    $ git clone https://github.com/Kinto/kinto.js
    $ cd kinto.js
    $ npm install

> #### Notes
>
> Tagged versions are also available from [npm](https://www.npmjs.com/package/kinto), though cloning the repository is the prefered way for hacking and contributing code.

## Tests

In order to run the tests, you'll need:

1. to have [Python](http://python.org/) available on your system;
2. to [install Kinto locally](http://kinto.readthedocs.org/en/latest/configuration/installation.html);
3. to export the location of the installed `pserve` accordingly.

The simplest way to install Kinto is to do so in a [virtual environment](http://docs.python-guide.org/en/latest/dev/virtualenvs/) and activate it:

    $ virtualenv venv
    $ ./venv/bin/pip install kinto
    $ source ./venv/bin/activate

Then you can run the tests by running:

    $ npm test

You can alternatively run the tests in a more explicit fashion by passing the `KINTO_PSERVE_EXECUTABLE` environment variable, which can be found in the virtual environment's `bin` directory:

    $ KINTO_PSERVE_EXECUTABLE="`pwd`/venv/bin/pserve" npm run test

Alternative test commands are also available:

    $ npm run test-nocover    # runs tests skipping code coverage
    $ npm run test-cover      # runs tests, code coverage; doesn't send results
    $ npm run test-cover-html # runs tests, code coverage and opens a fancy html report

> #### Notes
>
> Code coverage reports are also [browseable on Coveralls](https://coveralls.io/r/Kinto/kinto.js).

### TDD mode

This command will watch when source files change and rerun the tests each time they do:

    $ npm run tdd

Note that it won't perform code coverage analysis.

You can also run a subset of tests that way:

    $ npm run tdd -- -g Api # only runs Api-related tests

Of course, as for `npm test`, you can explictly pass the pass to the Kinto server `pserve` executable to use to execute integration tests:

    $ KINTO_PSERVE_EXECUTABLE="/path/to/venv/bin/pserve" npm run tdd

## Generating dist files

    $ npm run dist

This should have created the following assets, with the current version in the filename (for instance, `1.0.0`):

-  `dist/kinto-1.0.0.js`: Development version, unminified, embedding source maps;
-  `dist/kinto-1.0.0.min.js`: Production version, minified, no source maps;
-  `dist/moz-kinto-client.js`: Firefox internal component bundle (for Mozilla specific use).

Once a new version is packaged and [published to npm](#publishing-to-npm), the [npmcdn](https://npmcdn.com/ service) makes ready-to-use kinto.js assets available from the following urls:

- [http://npmcdn.com/kinto@1.1.0/dist/kinto-1.1.0.js](http://npmcdn.com/kinto@1.1.0/dist/kinto-1.1.0.js) for the development version;
- [http://npmcdn.com/kinto@1.1.0/dist/kinto-1.1.0.min.js](http://npmcdn.com/kinto@1.1.0/dist/kinto-1.1.0.min.js) for the production version.

## Updating docs

Docs are written in [Markdown](http://daringfireball.net/projects/markdown/syntax) using [mkdocs](http://www.mkdocs.org/), and are hosted on [readthedocs](https://readthedocs.org/).

Document sources are versionned in the Kinto.js repository, under the [docs/ directory](https://github.com/Kinto/kinto.js/tree/master/docs). Updates are automatically deployed when pushed to `origin/master`. That means the docs site is automatically updated everytime a PR lands.

To build docs locally, ensure mkdocs is [properly installed](http://www.mkdocs.org/#installation), then run:

    $ mkdocs build --clean

To serve them over http locally so you can see your modifications in real time:

    $ mkdocs serve

### Generating browsable API docs

API docs are available [online](https://doc.esdoc.org/github.com/Kinto/kinto.js/).

To generate them locally:

```
$ esdoc -c esdoc.json && open esdoc/index.html
```

Publication is done manually by submitting new versions to [doc.esdoc.org](https://doc.esdoc.org/-/generate.html).

## Publishing to npm

    $ npm run publish-package

## Publishing the demo

The demo is hosted [on Gihub pages](http://kinto.github.io/kinto.js/); to publish the current demo version:

    $ npm run publish-demo
