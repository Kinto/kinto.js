## How to package and release Kinto.js

In order to prepare and publish a new release, the following steps are required.

### Start a release branch

    $ git co -b prepare-1.1.0

### Updating `package.json`

* Bump the `version`;
* Update the list of contributors if needed (`git shortlog -sne` gives a list of project contributors from the commit history);
* Open a pull-request with the changes;
* Draft release notes in the PR description;
* Wait for the tests to pass on [TravisCI](http://travis-ci.org/Kinto/kinto.js).

### Merge the release branch, and push the tag

    $ git checkout master
    $ git rebase prepare-X.Y.Z
    $ git tag vX.Y.Z
    $ git push origin master
    $ git push origin vX.Y.Z

### Publish on NPM

    $ npm run build
    $ npm run dist

Ensure NPM package content is ready and valid. The `dist/` folder should contain browersified assets and `lib/` the babelized ES5 files.

    $ npm login
    $ npm publish

Checklist:

* unpkg should serve the new version of the assets at `https://unpkg.com/kinto@X.Y.Z/dist/kinto.js`;
* `npm install kinto` should pull the new version, and `require("kinto")` should work as expected.

### Edit and publish the release on Github

Update [Github release page](https://github.com/Kinto/kinto.js/releases) for this new tag (watchers will be notified).

Update and publish the `gh-pages` branch containing the demo with:

    $ npm run publish-demo

Check that the demo has been [published](http://kinto.github.io/kinto.js/) and works as expected.

### Update docs

Obtain the new sub-resource integrity hashes with:

    $ npm run compute-sri

Update the table in `docs/installation.md`.

### Publish updated esdoc

Submit new version of the js api docs at [doc.esdoc.org](https://doc.esdoc.org/-/generate.html), providing the git repo URL: `git@github.com:Kinto/kinto.js.git`.

### Check that the new tag is active on readthedocs

Ensure the new version of the docs is available, eg. http://kintojs.readthedocs.io/en/vX.Y.Z/

### Post-release

Tweet or blog about it!
