# Changelog

This document describes changes between each past release.

## v15.0.0 (2023-06-20)

**Breaking Changes**

- Merge kinto-http into kinto.js (#1726, #1735)
- Generate ES6/ES2015 Javascript for Gecko mozilla-central (#2050)

**Internal Changes**

- Fix some eslint checks present in mozilla-central (#2051)
- fix: remove unused typeRoots config
- update dependabot monthly (#2014)
- ci: disable ipv6 for browser tests (#2001)
- upgrade to fake-indexeddb v4 (#1995)
- upgrade to rollup v3 (#1994)
- update dependencies to latest in current semver range (#1993)
- Pin Node version used in browser tests (#1990)
- Update `ChromeUtils` module imports
- Replace deprecated substr method with substring method (#1822)
- Use the official demo URL (#1629)
- Upgrade to GitHub-native Dependabot (#1495)
- run browser tests on Linux (#1467)
- Make omitKeys more type-safe (#1456)

## v14.0.2 (2020-12-10)

You can now import the following from the module:

- `Collection`: The class representing a Kinto collection
- `CollectionSyncOptions`: The options provided to the `Collection.sync` method
- `Conflict`: The API response representing a conflict that occurs during a sync operation

## v14.0.1 (2020-12-04)

This version exports some types and useful utilities designed to make the adapter development experience a bit easier. You can now import the following from the module:

- `KintoBase`: The base class from which all Kinto instances are derived
- `BaseAdapter`: The base class from which all storage adapters are derived
- `AbstractBaseAdapter`: An abstract class used during development to trigger warnings on unimplemented methods
- `getDeepKey`: A function to get deeply-nested object properties using dot notation (`key1.key2.key3`)
- `StorageProxy`: A TypeScript type describing the methods required for storage proxies
- `RecordStatus`: A TypeScript type representing the various states of the `_status` property on records
- `KintoBaseOptions`: A TypeScript type representing the configuration options of the `KintoBase` class

## v14.0.0 (2020-06-18)

This version is the first version to ship with our official TypeScript types! If you run into any issues using the library in your TypeScript project, please open an issue.

**Breaking changes**

- We've removed the automatically-included EventEmitter polyfill, making the `events` option for `Kinto` optional. You'll now need to bring your own emitter if you want to subscribe to events (which is not necessary for the vast majority of functionality). We suggest [mitt](https://github.com/developit/mitt), but anything that conforms to the `EventEmitter` interface will do.
- Both our CommonJS and bundled browser versions are now using ES2017 features. If you need to support older browsers, please ensure you're using something like Babel to transpile ES2017 to your desired target.

**Bug fixes**

- Fixed an issue where the emitted browser bundle referenced `global.process`, which only exists in Node environments. (#1352)

## v13.0.0 (2020-05-09)

This release is the culmination of almost ten months of work to migrate [kinto-http.js](https://github.com/Kinto/kinto-http.js) and [kinto.js](https://github.com/Kinto/kinto.js) to TypeScript! In the process, we've modernized the build system for both libraries. For more information on what this means for you, checkout the [migration guide](https://github.com/Kinto/kinto.js/blob/main/docs/upgrading.md#12x-to-13x).

**Breaking changes**

- Full rewrite in TypeScript (Thanks @dstaley!)

**Internal changes**

- Improve error wrapping of IndexedDB errors (#1205)
- Update build scripts to support Windows (#1120)
- removed unused variables (#1094)
- Update documentation examples with arrow functions and const (#1084)
- Remove timestamp from IDB instead storing null (#1082)
- Rewrite examples with promises to async/await (#1075)
- Replace Browserify and Babel with TypeScript and Rollup (#1061)
- Updates api.md to have more concise code examples (#1073)

## v12.7.0 (2019-08-28)

- Fix #1043: Reject when transaction is aborted (#1044)
- Fix #1041: load kinto-http lazily (#1042)

## v12.4.3 (2019-06-12)

### Bug fixes

- Respect localFields when deciding whether or not to mark a record as "updated" (#990).

## v12.4.2 (2019-05-16)

- Fix pullMetadata really (#977)

## v12.4.1 (2019-05-16)

- `pullMetadata` now passes `headers`. This should fix failures in syncing where authentication appeared to "go missing" in the middle of syncing, for example https://bugzilla.mozilla.org/show_bug.cgi?id=1551952.

## v12.4.0 (2019-05-06)

- Fix header in Gecko export (#972)
- Sub-Object Filtering (#816)
- Provide key-value store id schema (#558)
- Support sync of collection metadata (#971)

## v12.2.1 (2018-11-05)

- Gecko: use lazy imports' (#873)
- Ref #870: better bulk insert for IDB loadDump() (#871)

## v12.2.0 (2018-10-18)

- IDB: remove redundant index on `id` field (#868)
- Fix #862: Use getAll() in IDB if no filter is set (#865, #866)
- Rewrite README snippet with async/await

## v12.1.1 (2018-10-09)

- Fix #859: Add support for expectedTimestamp to sync() and pullChanges()
- Ref #817: Rewrite api.md with async/await (#858)

**Internal changes**

- Another cheap fix to try to get the builds to stop breaking (#856)

## v12.0.2 (2018-09-18)

### Bug fixes

- Explicitly depend on @babel/runtime (#850)

## v12.0.1 (2018-09-17)

**Bug fixes**

- Add safety check for legacy DB detection (#846)
- Improve data migration (#840)

**Internal changes**

- Update babelify to the latest version 🚀 (#844)
- chore(package): update babel-loader to version 8.0.0 (#843)
- chore(package): update babel-eslint to version 9.0.0 (#842)
- Switch to `sinon.createSandbox()`

## v12.0.0 (2018-08-16)

### Breaking changes

:warning: Check [upgrade notes](https://kintojs.readthedocs.io/en/latest/upgrading/) :warning:

- kinto.js now stores all collections in one unique database (#831)

### Bug fixes

- Fix #833: filter multiple values with other filters (#835)

## v11.2.2 (2018-07-12)

- (Gecko) Fix Gecko build after #826 (#828)
- (Gecko) Load fetch and indexdb lazily (#827)

## v11.2.1 (2018-07-11)

- Relax record id validation according to server (fixes #824) (#826)

## v11.2.0 (2018-06-25)

- Add DBName option to IndexedDB adapter (ref #820) (#823)
- chore(package): update sinon to version 6.0.0 (#821)
- Convert all esdoc dependencies to major version ranges (#815)
- Update SRI hashes
- chore(package): update esdoc-type-inference-plugin to version 1.0.2 (#814)
- chore(package): update uglifyify to version 5.0.0 (#811)

## v11.1.2 (2018-04-23)

### Internal changes

- Clean up SyncResultObject#add based on feedback from Florian Quèze (#809).

## v11.1.1 (2018-04-20)

### Bug fixes

- Fix SyncResultObject#add to be more performant. Previously it had quadratic behavior. Now we use a Map to track IDs we've already seen (#807).

## v11.1.0 (2018-03-20)

### New features

- Add IndexedDB support in Firefox export (fixes #731) (#733)
- Pull every pages during sync (fixes #355) (#801)
- Add support for deleteAll method (#799) (thanks @agawish)

## v11.0.0 (2018-02-16)

### Breaking changes

- Remove object-rest-spread transpilation for Firefox (#796).
- Remove IDB#resetSyncStatus (#774).

### New features

- Allow passing `localFields` when creating new collection (#785).

### Bug fixes

- Fix esdoc generation (thanks @zakaluka) (#773).
- Documentation updates (thanks @zakaluka @francois2metz) (#775, #778, #789).

## v10.0.0 (2017-10-12)

### Breaking changes

- Remove async/await transpilation for Firefox (#732)

### New features

- Add IDB#resetSyncStatus (#767).
- Allow ID schemae to use the record itself when generating its ID (#727).

### Bug fixes

- Update requirements and dependencies: Sinon is now 4.0.0 or greater (#760, #748, #709), ESLint is now `^4.7.2` (#759, #757, #756, #753, #749, #746, #745, #739, #734, #721), Mocha is now 4.0.0 or greater (#768), Coveralls is now 3.0.0 or greater (#766), Prettier is now 1.7.2 (#765, #762, #751, #725, #714), esdoc-importpath-plugin is now 1.0.1 (#754, #742, #722), babel-eslint is now 8.0.0 or greater (#755), esdoc itself is now 1.0.1 or greater (#741), kinto-node-test-server is now a range dependency of `^1.0.0` (#736), uglifyify is now 4.0.1 or greater (#717), chai is 4.0.1 or greater (#712) and chai-as-promised is now 7.0.0 or greater (#715).
- Move off of husky and lint-staged to pre-commit, because it works better on partial commits (see https://github.com/Kinto/kinto-admin/issues/419) (#737, #720, #719).
- docs: update docs to match explicit requirement on Node v6 or greater (#716, #730), add some information about use with WebSockets (#728), and note that we use Greenkeeper (#706).
- Fix strange test failures around 2017-10-10 (#770).
- Expose Kinto tracebacks when they occur, as we do in kinto-http (#729).
- Add a test for Firefox bug 1376618 (#726).
- Alphabetize a couple of object keys (#711).

## v9.0.2 (2017-05-11)

Bug fixes:

- Fix EventEmitter typo (#699).

## v9.0.1 (2017-05-11)

Bug fixes:

- No need to push "deleted" resolution (#696).

Dependency updates:

- Update to current location of EventEmitter (#697).
- Update gh-pages to 1.0.0 (#693).

## v9.0.0 (2017-05-10)

- Update oodles of dependencies -- eslint to 3.19.0 (#639, #644, #654, #655, #658, #665, #667), fake-indexeddb to 2.0.3 (#645, #646, #647, #685, #695), kinto-http to 4.3.3 (#651, #667, #673, #686), esdoc-importpath-plugin to 0.1.1 (#653), babel-istanbul to version 0.12.2 (#656), kinto-node-test-server to version 1.0.0 (#661), sinon to version 2.0.0 (#663), babel-eslint to version 7.2.2 (#672), babel-loader to version 7.0.0 (#683), esdoc-importpath-plugin to version 0.1.2 (#684), http-server to version 0.10.0 (#689)
- Adopt Prettier (#659, #675, #682)
- esdoc: remove esdoc-es7-plugin (#660)
- Suppress lint warnings. (#662)
- Fix remote delete (#692). This breaks API compatibility for the `SyncResultObject.resolved` field. Details are in the updating.md file.

## v8.0.0 (2017-05-10)

This release:

- updates a bunch of dependencies (#625, #626, #627, #628, #629, #630, #633, #634, #635, #636)
- refactors some internals of the sync() method to allow users to transform local deletes into remote keeps (#640)

This is a major version because it changes one aspect of how remote transformers work. Previously, a remote transformer could return anything for a deleted record, and that record would still be deleted. Now, if a transformer changes a record's \_status, it will be respected.

## v7.1.0 (2017-01-17)

- Override client options from collection (#622)

## v7.0.0 (2017-01-17)

**Breaking changes**

- Remove open() and close() methods from BaseAdapter (#599)

**New features**

- Add sync events (#620)
- Retry requests once by default (#621)

## v6.0.0 (2016-11-15)

This merges #562, which is a major version change because it removes the
Firefox storage adapter. This code is specific to Gecko and will move to
that repository.

## v5.1.0 (2016-11-04)

This release:

- Accept a new sqliteHandle in adapterOptions in FirefoxStorage, and expose \_init to let it be used sanely (#589).
- Update a bunch of dependencies (#579, #580, #586).
- Constrain dependency on underlying kinto when running tests (#584).

## v5.0.0 (2016-10-07)

This release:

- Massive refactor of most methods from manually-handled promises to async/await (#538).
- Updates the documentation with a "NOP" schema example for use when you don't really need an `idSchema` (#533).
- Optimize `collection#list` by doing filtering before putting documents in a list rather than after (#543).
- Upgrades tests to Kinto 4.3 (#573).
- Fix for a puzzling bug involving IndexedDB use on Safari (#549).
- Fixes yet another bug in conflict resolution during CLIENT_WINS when using transformers (#570).
- Add a `FirefoxAdapter#resetSyncStatus` that resets sync status across all collections, rather than the one you happen to have gotten your hands on (#571). This is not possible as yet in IndexedDB, so it's only in FirefoxAdapter for now.

This might be the last release before we take FirefoxStorage out of this repo and move it to Gecko.

## v4.0.5 (2016-09-19)

**Bug fixes**

- Fix safari issue on IDB cursor with empty values (#549, thanks @magopian!)

## v4.0.4 (2016-09-06)

This release fixes a bug in the handling of `lastModified` during a certain kind of conflict when using the `SERVER_WINS` conflict resolution strategy.

## v4.0.3 (2016-09-06)

This addresses a bug where conflicts weren't being resolved as "equal" in certain runtime environments (i.e. Gecko). See #529 for details.

## v4.0.2 (2016-09-06)

This release fixes a couple of bugs having to do with conflicts.

- Decode conflicts (#525). Otherwise you'd get remotely-transformed versions of records in your local database.
- Fix conflict handling with published deletions (#522). This prevented conflict handling from working correctly when the conflict involved a record that was deleted locally.

## v4.0.1 (2016-09-06)

I made a mistake in releasing 4.0.0 and published something wrong to NPM. This release is just a rebuild of 4.0.0, which shouldn't be used.

## v4.0.0 (2016-08-18)

This release causes remote transformers to be invoked even on deleted records, and thereby allows you to write a remote transformer that mutates record IDs (#510). It is a backwards-incompatible change because now a remote transformer must handle deleted records, which are missing all the normal fields you would expect from your records.

There are also some fixes to documentation errors (#515, #514) and updates of dependencies (#508, #512, #509, #502).

## v3.1.1 (2016-07-06)

This release fixes a bug in the FirefoxAdapter part (#488) of the Kinto client and updates a few dependencies.

## v3.1.0 (2016-06-29)

This release introduces a bunch of new functionality:

- There are now new Collection methods `getAny`, `deleteAny`, and `upsert` (#455, #480), which might be useful if you want to implement key-value sorts of operations on Kinto.
- Lots of work to make all Collection methods reentrant. (#460)
- There is now a `Collection#execute` method, which is used to run a transaction at the collection level. It works very similarly to `BaseAdapter#execute`, but with Collection methods. (#477)
- It's possible to `sync` to a different collection remotely than the one you have locally. (#462)
- The `FirefoxAdapter` now accepts an argument specifying the filename of its Sqlite database. (#481)

## v3.0.0 (2016-05-20)

- Add notion of local fields (fixes #173) (#423)
- Avoid redownloading our own changes (fixes #144) (#424)
- Previous version of record in sync result (fixes #335) (#421)
- Do not publish resolved conflicts with remote version (fixes #422)

### cleanRecord()

The `cleanRecord()` function from the collection module was dropped. Since local fields can be defined at the collection level, a [`cleanLocalFields()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-cleanLocalFields) method was introduced instead.

### SyncResultObject

The format of updates and deletions in the `SyncResultObject` has changed.

- The `updated` list now contains a list of objects with `old` and `new` attributes
- The `deleted` list now contains the full old record instead of just a stripped object containing `id`

Before with 2.X:

```js
{
  ok: true,
  lastModified: 1434270764485,
  conflicts: [],
  errors:    [],
  created:   [],
  updated:   [{
    id: "08d5ae32-7f73-46bb-a8a6-c2bd80b15705",
    title: "blog post",
    _status: "synced",
    last_modified: 1434270764485
  }],
  skipped:   [],
  published: [],
  resolved:  [],
  deleted:   [{
    id: "131a100d-0732-494e-aa3c-e4a15e23eb77"
  }],
}
```

Now with 3.X:

```js
{
  ok: true,
  lastModified: 1434270764485,
  conflicts: [],
  errors:    [],
  created:   [],
  updated:   [{
    old: {
      id: "08d5ae32-7f73-46bb-a8a6-c2bd80b15705",
      title: "draft",
      _status: "synced",
      last_modified: 1434243221112
    },
    new: {
      id: "08d5ae32-7f73-46bb-a8a6-c2bd80b15705",
      title: "blog post",
      _status: "synced",
      last_modified: 1434270764485
    }
  }],
  skipped:   [],
  published: [],
  resolved:  [],
  deleted:   [{
    id: "131a100d-0732-494e-aa3c-e4a15e23eb77",
    _status: "synced",
    last_modified: 1434223456788
  }],
}
```

## v2.0.4 (2016-05-06)

- Merged #417: Ensure manually resolved conflicts are always published to the server.

## v2.0.3 (2016-05-02)

- Fixed #399: Fixed incoming error object formatting. (#404)
- Fixed #402: Removed dependency to `deeper`, now replaced by a simple object comparison function (#406)
- Added Python 3.5 to Travis CI build matrix (#405)

## 2.0.0 (2016-04-11)

#### Breaking changes

- The `Kinto.adapters.LocalStorage` adapter was removed.
- The `BaseAdapter` interface for custom adapters has been updated.
- The HTTP Error messages format has been slightly updated.

##### `LocalStorage` adapter removal

Since support for transactions has been introduced in this release, and as `localStorage` doesn't support any kind of transactions natively, we've decided to drop support for it in Kinto.js. Please swith to using IndexedDB (which is the default adapter), or create your own if you target another persistence implementation.

##### The `BaseAdapter` interface has been updated

Since adapters now support transactions, the `BaseAdapter` interface now expect an `execute()` method to be implemented for custom adapters. The [Extending section](http://kintojs.readthedocs.org/en/latest/extending/#supporting-transactions) has been updated accordingly.

##### HTTP error messages format

The string message format for these now contains the HTTP status code description:

- Before: `HTTP 410; Service deprecated`
- After: `HTTP 410 Gone: Service deprecated`

#### New features

##### Incoming changes hooks

Hooks can be called to extend the behaviour of Kinto. So far it is only possible to hook when incoming changes are to be applied.

- `incoming-changes` hooks are called just after new changes are retrieved, and before these changes are reflected locally.

To install a hook, you need to pass it to the collection:

```js
function doSomething(payload, collection) {
  // Do something with the payload here.
  const {lastModified, changes} = payload;
  const ids = changes.map((record) => record.id);
  ...
};

let collection = db.collection(collectionName, {
  "hooks": {
    "incoming-changes": [doSomething]
  }
});
```

#### Other improvements

##### Internal use of transactions

The IndexedDB adapter now allow batching write operations within a single transaction, and the synchronization flow implementation leverages this feature in many areas.

##### Performance improvements

Leveraging IndexedDB transactions, general performances of the synchronization flow have been vastly improved.

##### Switch to external dependency `kinto-client.js`

In 1.x all the HTTP operations were performed in the `api.js` module, which has been promoted to its own independent [`kinto-client` package](https://www.npmjs.com/package/kinto-client) and is now a dependency of Kinto.js.

## v1.2.2 (2016-04-05)

- Fixed `babel-polyfill` should be a dependency, not a dev one.

## v1.2.1 (2016-04-05)

- Merged #379: Ensure a single instance of babel-polyfill is imported.

## v1.2.0 (2016-01-14)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.1.2...v1.2.0)

**Implemented enhancements:**

- Allowing to define the remote endpoint in `#sync()` [#257](https://github.com/Kinto/kinto.js/issues/257)
- Lightweight dist files for modern browsers [#249](https://github.com/Kinto/kinto.js/issues/249)

**Fixed bugs:**

- Broken links in the doc [#293](https://github.com/Kinto/kinto.js/issues/293)
- Fix JSM compatibility for Firefox adapter [#274](https://github.com/Kinto/kinto.js/pull/274) ([leplatrem](https://github.com/leplatrem))
- Fix parsing of ES7 code in esdoc [#294](https://github.com/Kinto/kinto.js/pull/294) ([leplatrem](https://github.com/leplatrem))

## v1.1.2 (2015-12-16)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.1.1...v.1.1.2)

**Release enhancements:**

- Add a minimalist dist file without polyfills [#291](https://github.com/Kinto/kinto.js/issues/291)

**Fixed bugs:**

- Records not deleted locally when already deleted on server (404 on delete) [#284](https://github.com/Kinto/kinto.js/issues/284)
- Handle network request timeouts. [#263](https://github.com/Kinto/kinto.js/issues/263)

## v1.1.1 (2015-11-24)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.1.0...v1.1.1)

- Relaxed UUID validation. [#269](https://github.com/Kinto/kinto.js/pull/269) ([n1k0](https://github.com/n1k0))
- Update to Kinto 1.9.0 [#267](https://github.com/Kinto/kinto.js/pull/267) ([Natim](https://github.com/Natim))
- Change demo/demo.js to use a bucket [#233](https://github.com/Kinto/kinto.js/issues/233)

## v1.1.0 (2015-11-05)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.0.0...v1.1.0)

**Implemented enhancements:**

- Preserve old files in gh-pages branch, so older assets versions aren't overriden [#241](https://github.com/Kinto/kinto.js/issues/241)
- Hosted dist files should contain the version number in their filename [#228](https://github.com/Kinto/kinto.js/issues/228)
- Updated dist command to add current version to asset names. [#230](https://github.com/Kinto/kinto.js/pull/230) ([n1k0](https://github.com/n1k0))

**Fixed bugs:**

- Handle the case of a flushed server in the demo. [#231](https://github.com/Kinto/kinto.js/issues/231)
- Fixes #231: Updated demo to handle flushed server. [#232](https://github.com/Kinto/kinto.js/pull/232) ([n1k0](https://github.com/n1k0))

**Merged pull requests:**

- Updated dist and publish commands to support versioned assets. [#248](https://github.com/Kinto/kinto.js/pull/248) ([n1k0](https://github.com/n1k0))
- Update babelify to version 7.0.1 🚀 [#239](https://github.com/Kinto/kinto.js/pull/239) ([greenkeeperio-bot](https://github.com/greenkeeperio-bot))
- Update gh-pages to version 0.5.0 🚀 [#237](https://github.com/Kinto/kinto.js/pull/237) ([greenkeeperio-bot](https://github.com/greenkeeperio-bot))
- Updated travis configuration to install Kinto 1.7.0. [#229](https://github.com/Kinto/kinto.js/pull/229) ([n1k0](https://github.com/n1k0))
- Exposed open() and close() methods to the BaseAdapter interface. [#227](https://github.com/Kinto/kinto.js/pull/227) ([n1k0](https://github.com/n1k0))
- 212 firefox entry point [#219](https://github.com/Kinto/kinto.js/pull/219) ([mozmark](https://github.com/mozmark))

## v1.0.0 (2015-10-27)

### Change Log

**Implemented enhancements:**

- Don't version dist files, publish & host them. [#203](https://github.com/Kinto/kinto.js/issues/203)
- Add a publish-demo command to deploy demo assets to gh-pages [#202](https://github.com/Kinto/kinto.js/issues/202)
- Investigate how to allow importing kinto public modules from other packages [#193](https://github.com/Kinto/kinto.js/issues/193)
- Remove unneeded external dependencies [#190](https://github.com/Kinto/kinto.js/issues/190)
- How does Kinto.js detect server was flushed and reupload the local database. [#178](https://github.com/Kinto/kinto.js/issues/178)
- Consistent reported errors formatting in sync result object [#176](https://github.com/Kinto/kinto.js/issues/176)
- Fixes #176: Consistent sync result error reporting. [#220](https://github.com/Kinto/kinto.js/pull/220) ([n1k0](https://github.com/n1k0))
- Fixes #203: Removed dist files. [#217](https://github.com/Kinto/kinto.js/pull/217) ([n1k0](https://github.com/n1k0))
- Flushed server handling. [#214](https://github.com/Kinto/kinto.js/pull/214) ([n1k0](https://github.com/n1k0))
- Inject dependencies [#199](https://github.com/Kinto/kinto.js/pull/199) ([mozmark](https://github.com/mozmark))

**Fixed bugs:**

- Installing 1.0.0-rc.5 through npm and using it from the node command triggers an error [#208](https://github.com/Kinto/kinto.js/issues/208)
- Fixes #114: Drop collection metas on #clear(). [#221](https://github.com/Kinto/kinto.js/pull/221) ([n1k0](https://github.com/n1k0))

**Closed issues:**

- Investigate how to link to foreign symbols from within esdoc [#215](https://github.com/Kinto/kinto.js/issues/215)
- reject instead of throw if item not found in Collection#get [#200](https://github.com/Kinto/kinto.js/issues/200)
- Update tutorial to use the /v1 version of the public moz test kinto server [#188](https://github.com/Kinto/kinto.js/issues/188)
- Investigate Travis failure [#182](https://github.com/Kinto/kinto.js/issues/182)
- Avoid typing and extending classes for transformers [#155](https://github.com/Kinto/kinto.js/issues/155)
- Add an Authentication section to the docs [#99](https://github.com/Kinto/kinto.js/issues/99)

**Merged pull requests:**

- Update browserify to version 12.0.0 🚀 [#224](https://github.com/Kinto/kinto.js/pull/224) ([greenkeeperio-bot](https://github.com/greenkeeperio-bot))
- Fixes #99: Added docs for authorization. [#223](https://github.com/Kinto/kinto.js/pull/223) ([n1k0](https://github.com/n1k0))
- Update to Kinto 1.6.2 [#222](https://github.com/Kinto/kinto.js/pull/222) ([Natim](https://github.com/Natim))
- Fixes #215: Added internal links to esdoc. [#218](https://github.com/Kinto/kinto.js/pull/218) ([n1k0](https://github.com/n1k0))
- Fixes #202: Added publish-demo command. [#216](https://github.com/Kinto/kinto.js/pull/216) ([n1k0](https://github.com/n1k0))
- Fixes #190: Avoid exporting Buffer to dist files. [#211](https://github.com/Kinto/kinto.js/pull/211) ([n1k0](https://github.com/n1k0))
- Fix snippet doc index (create instead of add) [#207](https://github.com/Kinto/kinto.js/pull/207) ([leplatrem](https://github.com/leplatrem))
- Fix details in documentation [#205](https://github.com/Kinto/kinto.js/pull/205) ([leplatrem](https://github.com/leplatrem))
- Fix import path in esdoc [#204](https://github.com/Kinto/kinto.js/pull/204) ([leplatrem](https://github.com/leplatrem))
- Moved fake indexedDB symbol imports to test logic. [#201](https://github.com/Kinto/kinto.js/pull/201) ([n1k0](https://github.com/n1k0))
- Update to Kinto 1.5.1 [#195](https://github.com/Kinto/kinto.js/pull/195) ([Natim](https://github.com/Natim))
- Documentation improvements. [#194](https://github.com/Kinto/kinto.js/pull/194) ([n1k0](https://github.com/n1k0))
- Adds esdoc support. [#192](https://github.com/Kinto/kinto.js/pull/192) ([n1k0](https://github.com/n1k0))

### [v1.0.0-rc.5](https://github.com/Kinto/kinto.js/tree/v1.0.0-rc.5) (2015-09-30)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.0.0-rc.4...v1.0.0-rc.5)

**Merged pull requests:**

- 1.0.0-rc.5 [#189](https://github.com/Kinto/kinto.js/pull/189) ([n1k0](https://github.com/n1k0))
- Bump 1.0.0-rc.4. [#187](https://github.com/Kinto/kinto.js/pull/187) ([n1k0](https://github.com/n1k0))

### [v1.0.0-rc.4](https://github.com/Kinto/kinto.js/tree/v1.0.0-rc.4) (2015-09-29)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/1.0.0-rc.3...v1.0.0-rc.4)

**Implemented enhancements:**

- Add server logging to integration tests, ensure process doesn't die. [#185](https://github.com/Kinto/kinto.js/issues/185)
- Handling errors during the this.create step of \_importChange [#165](https://github.com/Kinto/kinto.js/issues/165)
- Raise an error when an id is passed to Collection#create but not necessary [#158](https://github.com/Kinto/kinto.js/issues/158)
- Pluggable ID schema's [#138](https://github.com/Kinto/kinto.js/issues/138)
- Avoid running coverage twice now that isparta is fixed [#133](https://github.com/Kinto/kinto.js/issues/133)
- Expose Collection.strategy.\* [#113](https://github.com/Kinto/kinto.js/issues/113)
- Add lint/style check in Travis [#5](https://github.com/Kinto/kinto.js/issues/5)
- Fixes #122 - Added Kinto.createRemoteTransformer(). [#139](https://github.com/Kinto/kinto.js/pull/139) ([n1k0](https://github.com/n1k0))

**Fixed bugs:**

- Improve consistency of conflict resolution strategies [#150](https://github.com/Kinto/kinto.js/issues/150)
- Why is Content-Length header required on Kinto server responses? [#125](https://github.com/Kinto/kinto.js/issues/125)
- Document `bucket` option [#120](https://github.com/Kinto/kinto.js/issues/120)
- Error when server returns 400 error response [#110](https://github.com/Kinto/kinto.js/issues/110)

**Closed issues:**

- Can we avoid OPTIONS preflights on (some) GET requests? [#170](https://github.com/Kinto/kinto.js/issues/170)
- Avoid checking the server settings for each collection [#169](https://github.com/Kinto/kinto.js/issues/169)
- Ensure lastModified value isn't updated if errors are encountered [#163](https://github.com/Kinto/kinto.js/issues/163)
- Cache headers [#162](https://github.com/Kinto/kinto.js/issues/162)
- Non-empty syncResults.updated when syncing to an empty remote collection [#160](https://github.com/Kinto/kinto.js/issues/160)
- Move `Collection\#use` to optional second argument of `Kinto\#collection` [#148](https://github.com/Kinto/kinto.js/issues/148)
- Always brace single-line controlled statements [#141](https://github.com/Kinto/kinto.js/issues/141)
- Investigate offline support feature [#140](https://github.com/Kinto/kinto.js/issues/140)
- Freeze the versions of the compilers [#131](https://github.com/Kinto/kinto.js/issues/131)
- Coverage badge is broken [#127](https://github.com/Kinto/kinto.js/issues/127)
- Unhandled promise rejection if server response has no 'data' field [#126](https://github.com/Kinto/kinto.js/issues/126)
- Report http errors in a meaningful way [#124](https://github.com/Kinto/kinto.js/issues/124)
- Is mutating the [[Prototype]] of an object slow? [#123](https://github.com/Kinto/kinto.js/issues/123)
- Using Transformers with prototypal inheritance [#122](https://github.com/Kinto/kinto.js/issues/122)
- Maybe add fetch-only / push-only option in Collection#sync() [#116](https://github.com/Kinto/kinto.js/issues/116)
- Accept Syncto base64 record_ids [#115](https://github.com/Kinto/kinto.js/issues/115)

**Merged pull requests:**

- Fixes #185: detailed server error logging in case start fails. [#186](https://github.com/Kinto/kinto.js/pull/186) ([n1k0](https://github.com/n1k0))
- Upgraded Kinto to 1.5.0. [#184](https://github.com/Kinto/kinto.js/pull/184) ([n1k0](https://github.com/n1k0))
- 'git co' -> 'git clone' in install instructions [#179](https://github.com/Kinto/kinto.js/pull/179) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #169 - Instantiate Api only once [#175](https://github.com/Kinto/kinto.js/pull/175) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #165: Expose per-record import errors. [#174](https://github.com/Kinto/kinto.js/pull/174) ([n1k0](https://github.com/n1k0))
- Fixes 155: Drop use of classes for transformers and IdSchema. [#171](https://github.com/Kinto/kinto.js/pull/171) ([n1k0](https://github.com/n1k0))
- Fixes #158 - Collection#create Id requirements validation. [#168](https://github.com/Kinto/kinto.js/pull/168) ([n1k0](https://github.com/n1k0))
- Upgraded Kinto to 1.4.0. [#167](https://github.com/Kinto/kinto.js/pull/167) ([n1k0](https://github.com/n1k0))
- Correct code comment for `Collection\#pullChanges` [#166](https://github.com/Kinto/kinto.js/pull/166) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #163: Ensure lastModified isn't saved on import errors encountered [#164](https://github.com/Kinto/kinto.js/pull/164) ([n1k0](https://github.com/n1k0))
- Refs #160: Sync flow and result object format optimizations. [#161](https://github.com/Kinto/kinto.js/pull/161) ([n1k0](https://github.com/n1k0))
- Section label resolving-conflicts -> resolving-conflicts-manually [#159](https://github.com/Kinto/kinto.js/pull/159) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #150 — Consistent conflicts resolution strategies. [#152](https://github.com/Kinto/kinto.js/pull/152) ([n1k0](https://github.com/n1k0))
- Fixes #113 - Expose synchronization strategy constants. [#151](https://github.com/Kinto/kinto.js/pull/151) ([n1k0](https://github.com/n1k0))
- Fixes #148 - Extra arg on Kinto#collection to replace Collection#use. [#149](https://github.com/Kinto/kinto.js/pull/149) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #125, fixes #110: Drop reliance on Content-Length header. [#146](https://github.com/Kinto/kinto.js/pull/146) ([n1k0](https://github.com/n1k0))
- Fixes #120 - Documented bucket option. [#145](https://github.com/Kinto/kinto.js/pull/145) ([n1k0](https://github.com/n1k0))
- Fixes #138 - Implement custom id schema's [#143](https://github.com/Kinto/kinto.js/pull/143) ([michielbdejong](https://github.com/michielbdejong))
- Fix db transactions on safari. [#142](https://github.com/Kinto/kinto.js/pull/142) ([n1k0](https://github.com/n1k0))
- Fix test failing when KINTO_PSERVE_EXECUTABLE is not set in the env. [#132](https://github.com/Kinto/kinto.js/pull/132) ([QuentinRoy](https://github.com/QuentinRoy))
- Add instructions on how to run functional tests. [#130](https://github.com/Kinto/kinto.js/pull/130) ([ametaireau](https://github.com/ametaireau))
- Hint at http error reporting in docs example, fix #124 [#128](https://github.com/Kinto/kinto.js/pull/128) ([michielbdejong](https://github.com/michielbdejong))
- Add ESLint on TravisCI (fixes #5) [#121](https://github.com/Kinto/kinto.js/pull/121) ([leplatrem](https://github.com/leplatrem))
- Remove mentions of Cliquet [#118](https://github.com/Kinto/kinto.js/pull/118) ([leplatrem](https://github.com/leplatrem))
- Document list sorting and filtering [#117](https://github.com/Kinto/kinto.js/pull/117) ([leplatrem](https://github.com/leplatrem))
- Introduce local DB prefix [#111](https://github.com/Kinto/kinto.js/pull/111) ([leplatrem](https://github.com/leplatrem))
- Nits in backoff and alert header docs [#109](https://github.com/Kinto/kinto.js/pull/109) ([leplatrem](https://github.com/leplatrem))
- Clarify docs about having to resolve incoming conflicts [#108](https://github.com/Kinto/kinto.js/pull/108) ([leplatrem](https://github.com/leplatrem))
- Skip last pull if nothing to push [#107](https://github.com/Kinto/kinto.js/pull/107) ([leplatrem](https://github.com/leplatrem))
- [Ready for Review] Initial implementation of transformers. [#106](https://github.com/Kinto/kinto.js/pull/106) ([n1k0](https://github.com/n1k0))
- Fixes #103 - Updated links to public static assets. [#104](https://github.com/Kinto/kinto.js/pull/104) ([n1k0](https://github.com/n1k0))
- Remove the Backoff header handling exclusion for 304 responses [#86](https://github.com/Kinto/kinto.js/pull/86) ([n1k0](https://github.com/n1k0))
- Change the license [#2](https://github.com/Kinto/kinto.js/pull/2) ([ametaireau](https://github.com/ametaireau))

### [1.0.0-rc.3](https://github.com/Kinto/kinto.js/tree/1.0.0-rc.3) (2015-07-31)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/1.0.0-rc.2...1.0.0-rc.3)

### [1.0.0-rc.2](https://github.com/Kinto/kinto.js/tree/1.0.0-rc.2) (2015-07-31)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/1.0.0-rc.1...1.0.0-rc.2)

**Closed issues:**

- Host static assets on a CDN [#103](https://github.com/Kinto/kinto.js/issues/103)

**Merged pull requests:**

- Fixed npm published package. [#105](https://github.com/Kinto/kinto.js/pull/105) ([n1k0](https://github.com/n1k0))

### [1.0.0-rc.1](https://github.com/Kinto/kinto.js/tree/1.0.0-rc.1) (2015-07-31)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/0.2...1.0.0-rc.1)

**Implemented enhancements:**

- Add integration test for deprecation headers [#85](https://github.com/Kinto/kinto.js/issues/85)
- Handle deprecation headers [#69](https://github.com/Kinto/kinto.js/issues/69)
- Handle backoff indicators [#68](https://github.com/Kinto/kinto.js/issues/68)
- Support unlimited batch requests [#64](https://github.com/Kinto/kinto.js/issues/64)

**Fixed bugs:**

- Error on synchronization with a HTTP 304 on the collection from the server [#71](https://github.com/Kinto/kinto.js/issues/71)

**Closed issues:**

- Sync flow should stop when pushing changes fails [#96](https://github.com/Kinto/kinto.js/issues/96)
- Create a localStorage adapter. [#94](https://github.com/Kinto/kinto.js/issues/94)
- Cached Kinto collections instances are not uniquely identified [#89](https://github.com/Kinto/kinto.js/issues/89)
- Expose events for server backoff [#84](https://github.com/Kinto/kinto.js/issues/84)
- Provide a hook to interecept deprecation warnings. [#81](https://github.com/Kinto/kinto.js/issues/81)
- Builds are marked green even if failures occured. [#74](https://github.com/Kinto/kinto.js/issues/74)
- Add a simple functional test suite for the demo, using jsdom. [#70](https://github.com/Kinto/kinto.js/issues/70)
- Refactor generic HTTP error handling. [#57](https://github.com/Kinto/kinto.js/issues/57)
- Expose conflicting record details on BATCH 412 responses [#56](https://github.com/Kinto/kinto.js/issues/56)
- Demo is broken. [#54](https://github.com/Kinto/kinto.js/issues/54)
- Don't mention Cliquet in the repo description [#47](https://github.com/Kinto/kinto.js/issues/47)
- Fetch remote server settings. [#41](https://github.com/Kinto/kinto.js/issues/41)
- Add checks for unsupported Cliquet protocol version. [#40](https://github.com/Kinto/kinto.js/issues/40)
- Host a demo instance on Github pages [#38](https://github.com/Kinto/kinto.js/issues/38)
- Remote URL should have a trailing slash. [#33](https://github.com/Kinto/kinto.js/issues/33)
- Validate passed uuids [#28](https://github.com/Kinto/kinto.js/issues/28)
- Reflect record ids sent to BATCH in result object [#15](https://github.com/Kinto/kinto.js/issues/15)
- Handle BATCH 409 responses [#14](https://github.com/Kinto/kinto.js/issues/14)
- Handle BATCH request limit [#13](https://github.com/Kinto/kinto.js/issues/13)
- Improve error reporting when fetching changes failed. [#12](https://github.com/Kinto/kinto.js/issues/12)
- Implement local list filtering [#6](https://github.com/Kinto/kinto.js/issues/6)

**Merged pull requests:**

- Update after Kinto organization move. [#102](https://github.com/Kinto/kinto.js/pull/102) ([Natim](https://github.com/Natim))
- Prepare 1.0.0-rc.1 [#101](https://github.com/Kinto/kinto.js/pull/101) ([n1k0](https://github.com/n1k0))
- Added synchronization flow diagram. [#100](https://github.com/Kinto/kinto.js/pull/100) ([n1k0](https://github.com/n1k0))
- Fixes #91 - Added corsMode option. [#98](https://github.com/Kinto/kinto.js/pull/98) ([n1k0](https://github.com/n1k0))
- Fixes #96 - Sync flow should stop when pushing changes fails. [#97](https://github.com/Kinto/kinto.js/pull/97) ([n1k0](https://github.com/n1k0))
- [Landed] Added LocalStorage adapter. [#95](https://github.com/Kinto/kinto.js/pull/95) ([n1k0](https://github.com/n1k0))
- Local storage adapters. [#92](https://github.com/Kinto/kinto.js/pull/92) ([n1k0](https://github.com/n1k0))
- Documented current known limitations. [#90](https://github.com/Kinto/kinto.js/pull/90) ([n1k0](https://github.com/n1k0))
- Refs #81, #84 - Add support for backoff and deprecated public events. [#88](https://github.com/Kinto/kinto.js/pull/88) ([n1k0](https://github.com/n1k0))
- Fixes #85 - Added integration test for deprecation headers. [#87](https://github.com/Kinto/kinto.js/pull/87) ([n1k0](https://github.com/n1k0))
- Fixes #68 - Handle Backoff header. [#82](https://github.com/Kinto/kinto.js/pull/82) ([n1k0](https://github.com/n1k0))
- No sudo for travis [#80](https://github.com/Kinto/kinto.js/pull/80) ([magopian](https://github.com/magopian))
- Fixes #69 - Handle deprecation header. [#79](https://github.com/Kinto/kinto.js/pull/79) ([n1k0](https://github.com/n1k0))
- Reintegrated coverage using a two-passes strategy. [#77](https://github.com/Kinto/kinto.js/pull/77) ([n1k0](https://github.com/n1k0))
- Refs #74 - Removed coverage from continuous integration. [#76](https://github.com/Kinto/kinto.js/pull/76) ([n1k0](https://github.com/n1k0))
- Upgrade to Kinto 1.3.1. [#73](https://github.com/Kinto/kinto.js/pull/73) ([n1k0](https://github.com/n1k0))
- Fixes #71 - Simplified empty HTTP response handling. [#72](https://github.com/Kinto/kinto.js/pull/72) ([n1k0](https://github.com/n1k0))
- Add safety check if batch limit setting is falsy (fixes #64) [#65](https://github.com/Kinto/kinto.js/pull/65) ([leplatrem](https://github.com/leplatrem))
- Automatically drop the trailing slash from passed remote url. [#63](https://github.com/Kinto/kinto.js/pull/63) ([n1k0](https://github.com/n1k0))
- Fixes #54 - Upgrade to Kinto server v1.3. [#62](https://github.com/Kinto/kinto.js/pull/62) ([n1k0](https://github.com/n1k0))
- Fixes #28 - Validate uuids [#61](https://github.com/Kinto/kinto.js/pull/61) ([n1k0](https://github.com/n1k0))
- Fixes #13 - Batch requests chunking. [#60](https://github.com/Kinto/kinto.js/pull/60) ([n1k0](https://github.com/n1k0))
- Fixes #57 - Better HTTP error handling. [#58](https://github.com/Kinto/kinto.js/pull/58) ([n1k0](https://github.com/n1k0))
- Fixes #41 - Added Api#fetchServerSettings. [#55](https://github.com/Kinto/kinto.js/pull/55) ([n1k0](https://github.com/n1k0))
- Refs #40 - Added checks for supported protocol version. [#53](https://github.com/Kinto/kinto.js/pull/53) ([n1k0](https://github.com/n1k0))
- Closes #6 - Local collection data ordering & filtering. [#52](https://github.com/Kinto/kinto.js/pull/52) ([n1k0](https://github.com/n1k0))
- Fixes #12 - Improved Api#fetchChangesSince error messages. [#51](https://github.com/Kinto/kinto.js/pull/51) ([n1k0](https://github.com/n1k0))
- Added full integration test suite. [#50](https://github.com/Kinto/kinto.js/pull/50) ([n1k0](https://github.com/n1k0))
- Adding the documentation badge in the readme. [#49](https://github.com/Kinto/kinto.js/pull/49) ([n1k0](https://github.com/n1k0))
- "ReferenceError: render is not defined" and a few typos in tutorial [#46](https://github.com/Kinto/kinto.js/pull/46) ([ferjm](https://github.com/ferjm))
- Update index.md [#43](https://github.com/Kinto/kinto.js/pull/43) ([ametaireau](https://github.com/ametaireau))
- Don't mention cliquet in the readme. [#42](https://github.com/Kinto/kinto.js/pull/42) ([ametaireau](https://github.com/ametaireau))
- Rename project to kinto.js [#37](https://github.com/Kinto/kinto.js/pull/37) ([n1k0](https://github.com/n1k0))
- Kinto setup script. [#32](https://github.com/Kinto/kinto.js/pull/32) ([n1k0](https://github.com/n1k0))

### [0.2](https://github.com/Kinto/kinto.js/tree/0.2) (2015-06-30)

**Closed issues:**

- Support opening different cliquetis instances in browser normal vs private modes [#35](https://github.com/Kinto/kinto.js/issues/35)
- Implement conflict resolution helper [#25](https://github.com/Kinto/kinto.js/issues/25)
- Don't store collection last_modified on sync() when conflicts have been encountered [#23](https://github.com/Kinto/kinto.js/issues/23)
- Support passing default auth headers to Cliquetis constructor [#20](https://github.com/Kinto/kinto.js/issues/20)
- Move docs to RTD [#10](https://github.com/Kinto/kinto.js/issues/10)
- Persist per-collection lastModified value [#9](https://github.com/Kinto/kinto.js/issues/9)

**Merged pull requests:**

- Closes #20 - Added support for request headers option to Cliquetis constructor. [#36](https://github.com/Kinto/kinto.js/pull/36) ([n1k0](https://github.com/n1k0))
- Replace #18 - Demo local server script. [#31](https://github.com/Kinto/kinto.js/pull/31) ([n1k0](https://github.com/n1k0))
- Fixes #25 - Conflict resolution helper. [#27](https://github.com/Kinto/kinto.js/pull/27) ([n1k0](https://github.com/n1k0))
- Fixes #23 - Don't bump local collection last_modified on conflicts. [#24](https://github.com/Kinto/kinto.js/pull/24) ([n1k0](https://github.com/n1k0))
- Switch to ETags instead of IMS-IUMS [#22](https://github.com/Kinto/kinto.js/pull/22) ([leplatrem](https://github.com/leplatrem))
- Better docs, including tutorial [#21](https://github.com/Kinto/kinto.js/pull/21) ([n1k0](https://github.com/n1k0))
- Port Cliquetis for Kinto 1.0 [#19](https://github.com/Kinto/kinto.js/pull/19) ([Natim](https://github.com/Natim))
- Versionned dist file to ease sharing. [#17](https://github.com/Kinto/kinto.js/pull/17) ([n1k0](https://github.com/n1k0))
- Added support for code coverage & coveralls service. [#8](https://github.com/Kinto/kinto.js/pull/8) ([n1k0](https://github.com/n1k0))
- [Ready for Review] First sync() implementation. [#7](https://github.com/Kinto/kinto.js/pull/7) ([n1k0](https://github.com/n1k0))
- Simplified Collection API. [#4](https://github.com/Kinto/kinto.js/pull/4) ([n1k0](https://github.com/n1k0))
- First implementation of local CRUD operations. [#3](https://github.com/Kinto/kinto.js/pull/3) ([n1k0](https://github.com/n1k0))

## v1.0.0-rc.5 (2015-09-30)

### Changelog

- Fixed broken npm package.

## v1.0.0-rc.4 (2015-09-29)

### Change Log

### [v1.0.0-rc.4](https://github.com/Kinto/kinto.js/tree/v1.0.0-rc.4) (2015-09-29)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/1.0.0-rc.3...v1.0.0-rc.4)

**Implemented enhancements:**

- Add server logging to integration tests, ensure process doesn't die. [#185](https://github.com/Kinto/kinto.js/issues/185)
- Handling errors during the this.create step of \_importChange [#165](https://github.com/Kinto/kinto.js/issues/165)
- Raise an error when an id is passed to Collection#create but not necessary [#158](https://github.com/Kinto/kinto.js/issues/158)
- Pluggable ID schema's [#138](https://github.com/Kinto/kinto.js/issues/138)
- Avoid running coverage twice now that isparta is fixed [#133](https://github.com/Kinto/kinto.js/issues/133)
- Expose Collection.strategy.\* [#113](https://github.com/Kinto/kinto.js/issues/113)
- Add lint/style check in Travis [#5](https://github.com/Kinto/kinto.js/issues/5)

**Fixed bugs:**

- Improve consistency of conflict resolution strategies [#150](https://github.com/Kinto/kinto.js/issues/150)
- Why is Content-Length header required on Kinto server responses? [#125](https://github.com/Kinto/kinto.js/issues/125)
- Document `bucket` option [#120](https://github.com/Kinto/kinto.js/issues/120)
- Error when server returns 400 error response [#110](https://github.com/Kinto/kinto.js/issues/110)

**Closed issues:**

- Can we avoid OPTIONS preflights on (some) GET requests? [#170](https://github.com/Kinto/kinto.js/issues/170)
- Avoid checking the server settings for each collection [#169](https://github.com/Kinto/kinto.js/issues/169)
- Ensure lastModified value isn't updated if errors are encountered [#163](https://github.com/Kinto/kinto.js/issues/163)
- Cache headers [#162](https://github.com/Kinto/kinto.js/issues/162)
- Non-empty syncResults.updated when syncing to an empty remote collection [#160](https://github.com/Kinto/kinto.js/issues/160)
- Move `Collection\#use` to optional second argument of `Kinto\#collection` [#148](https://github.com/Kinto/kinto.js/issues/148)
- Always brace single-line controlled statements [#141](https://github.com/Kinto/kinto.js/issues/141)
- Investigate offline support feature [#140](https://github.com/Kinto/kinto.js/issues/140)
- Freeze the versions of the compilers [#131](https://github.com/Kinto/kinto.js/issues/131)
- Coverage badge is broken [#127](https://github.com/Kinto/kinto.js/issues/127)
- Unhandled promise rejection if server response has no 'data' field [#126](https://github.com/Kinto/kinto.js/issues/126)
- Report http errors in a meaningful way [#124](https://github.com/Kinto/kinto.js/issues/124)
- Is mutating the [[Prototype]] of an object slow? [#123](https://github.com/Kinto/kinto.js/issues/123)
- Using Transformers with prototypal inheritance [#122](https://github.com/Kinto/kinto.js/issues/122)
- Maybe add fetch-only / push-only option in Collection#sync() [#116](https://github.com/Kinto/kinto.js/issues/116)
- Accept Syncto base64 record_ids [#115](https://github.com/Kinto/kinto.js/issues/115)

**Merged pull requests:**

- Fixes #185: detailed server error logging in case start fails. [#186](https://github.com/Kinto/kinto.js/pull/186) ([n1k0](https://github.com/n1k0))
- Upgraded Kinto to 1.5.0. [#184](https://github.com/Kinto/kinto.js/pull/184) ([n1k0](https://github.com/n1k0))
- 'git co' -> 'git clone' in install instructions [#179](https://github.com/Kinto/kinto.js/pull/179) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #169 - Instantiate Api only once [#175](https://github.com/Kinto/kinto.js/pull/175) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #165: Expose per-record import errors. [#174](https://github.com/Kinto/kinto.js/pull/174) ([n1k0](https://github.com/n1k0))
- Fixes 155: Drop use of classes for transformers and IdSchema. [#171](https://github.com/Kinto/kinto.js/pull/171) ([n1k0](https://github.com/n1k0))
- Fixes #158 - Collection#create Id requirements validation. [#168](https://github.com/Kinto/kinto.js/pull/168) ([n1k0](https://github.com/n1k0))
- Upgraded Kinto to 1.4.0. [#167](https://github.com/Kinto/kinto.js/pull/167) ([n1k0](https://github.com/n1k0))
- Correct code comment for `Collection\#pullChanges` [#166](https://github.com/Kinto/kinto.js/pull/166) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #163: Ensure lastModified isn't saved on import errors encountered [#164](https://github.com/Kinto/kinto.js/pull/164) ([n1k0](https://github.com/n1k0))
- Refs #160: Sync flow and result object format optimizations. [#161](https://github.com/Kinto/kinto.js/pull/161) ([n1k0](https://github.com/n1k0))
- Section label resolving-conflicts -> resolving-conflicts-manually [#159](https://github.com/Kinto/kinto.js/pull/159) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #150 — Consistent conflicts resolution strategies. [#152](https://github.com/Kinto/kinto.js/pull/152) ([n1k0](https://github.com/n1k0))
- Fixes #113 - Expose synchronization strategy constants. [#151](https://github.com/Kinto/kinto.js/pull/151) ([n1k0](https://github.com/n1k0))
- Fixes #148 - Extra arg on Kinto#collection to replace Collection#use. [#149](https://github.com/Kinto/kinto.js/pull/149) ([michielbdejong](https://github.com/michielbdejong))
- Fixes #125, fixes #110: Drop reliance on Content-Length header. [#146](https://github.com/Kinto/kinto.js/pull/146) ([n1k0](https://github.com/n1k0))
- Fixes #120 - Documented bucket option. [#145](https://github.com/Kinto/kinto.js/pull/145) ([n1k0](https://github.com/n1k0))
- Fixes #138 - Implement custom id schema's [#143](https://github.com/Kinto/kinto.js/pull/143) ([michielbdejong](https://github.com/michielbdejong))
- Fix db transactions on safari. [#142](https://github.com/Kinto/kinto.js/pull/142) ([n1k0](https://github.com/n1k0))
- Fixes #122 - Added Kinto.createRemoteTransformer(). [#139](https://github.com/Kinto/kinto.js/pull/139) ([n1k0](https://github.com/n1k0))
- Fix test failing when KINTO_PSERVE_EXECUTABLE is not set in the env. [#132](https://github.com/Kinto/kinto.js/pull/132) ([QuentinRoy](https://github.com/QuentinRoy))
- Add instructions on how to run functional tests. [#130](https://github.com/Kinto/kinto.js/pull/130) ([ametaireau](https://github.com/ametaireau))
- Hint at http error reporting in docs example, fix #124 [#128](https://github.com/Kinto/kinto.js/pull/128) ([michielbdejong](https://github.com/michielbdejong))
- Add ESLint on TravisCI (fixes #5) [#121](https://github.com/Kinto/kinto.js/pull/121) ([leplatrem](https://github.com/leplatrem))
- Remove mentions of Cliquet [#118](https://github.com/Kinto/kinto.js/pull/118) ([leplatrem](https://github.com/leplatrem))
- Document list sorting and filtering [#117](https://github.com/Kinto/kinto.js/pull/117) ([leplatrem](https://github.com/leplatrem))
- Introduce local DB prefix [#111](https://github.com/Kinto/kinto.js/pull/111) ([leplatrem](https://github.com/leplatrem))
- Nits in backoff and alert header docs [#109](https://github.com/Kinto/kinto.js/pull/109) ([leplatrem](https://github.com/leplatrem))
- Clarify docs about having to resolve incoming conflicts [#108](https://github.com/Kinto/kinto.js/pull/108) ([leplatrem](https://github.com/leplatrem))
- Skip last pull if nothing to push [#107](https://github.com/Kinto/kinto.js/pull/107) ([leplatrem](https://github.com/leplatrem))
- [Ready for Review] Initial implementation of transformers. [#106](https://github.com/Kinto/kinto.js/pull/106) ([n1k0](https://github.com/n1k0))
- Fixes #103 - Updated links to public static assets. [#104](https://github.com/Kinto/kinto.js/pull/104) ([n1k0](https://github.com/n1k0))
- Remove the Backoff header handling exclusion for 304 responses [#86](https://github.com/Kinto/kinto.js/pull/86) ([n1k0](https://github.com/n1k0))
- Change the license [#2](https://github.com/Kinto/kinto.js/pull/2) ([ametaireau](https://github.com/ametaireau))

## 1.0.0-rc.3 (2015-07-31)

Utra minor fixes regarding npm package publication.

## 1.0.0-rc.1 (2015-07-31)

### Change Log

### [1.0.0-rc.1](https://github.com/Kinto/kinto.js/tree/1.0.0-rc.1)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/0.2...1.0.0-rc.1)

**Implemented enhancements:**

- Add integration test for deprecation headers [#85](https://github.com/Kinto/kinto.js/issues/85)
- Handle deprecation headers [#69](https://github.com/Kinto/kinto.js/issues/69)
- Handle backoff indicators [#68](https://github.com/Kinto/kinto.js/issues/68)
- Support unlimited batch requests [#64](https://github.com/Kinto/kinto.js/issues/64)

**Fixed bugs:**

- Error on synchronization with a HTTP 304 on the collection from the server [#71](https://github.com/Kinto/kinto.js/issues/71)

**Closed issues:**

- Sync flow should stop when pushing changes fails [#96](https://github.com/Kinto/kinto.js/issues/96)
- Create a localStorage adapter. [#94](https://github.com/Kinto/kinto.js/issues/94)
- Cached Kinto collections instances are not uniquely identified [#89](https://github.com/Kinto/kinto.js/issues/89)
- Expose events for server backoff [#84](https://github.com/Kinto/kinto.js/issues/84)
- Provide a hook to interecept deprecation warnings. [#81](https://github.com/Kinto/kinto.js/issues/81)
- Builds are marked green even if failures occured. [#74](https://github.com/Kinto/kinto.js/issues/74)
- Add a simple functional test suite for the demo, using jsdom. [#70](https://github.com/Kinto/kinto.js/issues/70)
- Refactor generic HTTP error handling. [#57](https://github.com/Kinto/kinto.js/issues/57)
- Expose conflicting record details on BATCH 412 responses [#56](https://github.com/Kinto/kinto.js/issues/56)
- Demo is broken. [#54](https://github.com/Kinto/kinto.js/issues/54)
- Don't mention Cliquet in the repo description [#47](https://github.com/Kinto/kinto.js/issues/47)
- Fetch remote server settings. [#41](https://github.com/Kinto/kinto.js/issues/41)
- Add checks for unsupported Cliquet protocol version. [#40](https://github.com/Kinto/kinto.js/issues/40)
- Host a demo instance on Github pages [#38](https://github.com/Kinto/kinto.js/issues/38)
- Remote URL should have a trailing slash. [#33](https://github.com/Kinto/kinto.js/issues/33)
- Validate passed uuids [#28](https://github.com/Kinto/kinto.js/issues/28)
- Reflect record ids sent to BATCH in result object [#15](https://github.com/Kinto/kinto.js/issues/15)
- Handle BATCH 409 responses [#14](https://github.com/Kinto/kinto.js/issues/14)
- Handle BATCH request limit [#13](https://github.com/Kinto/kinto.js/issues/13)
- Improve error reporting when fetching changes failed. [#12](https://github.com/Kinto/kinto.js/issues/12)
- Implement local list filtering [#6](https://github.com/Kinto/kinto.js/issues/6)

**Merged pull requests:**

- Update after Kinto organization move. [#102](https://github.com/Kinto/kinto.js/pull/102) ([Natim](https://github.com/Natim))
- Added synchronization flow diagram. [#100](https://github.com/Kinto/kinto.js/pull/100) ([n1k0](https://github.com/n1k0))
- Fixes #91 - Added corsMode option. [#98](https://github.com/Kinto/kinto.js/pull/98) ([n1k0](https://github.com/n1k0))
- Fixes #96 - Sync flow should stop when pushing changes fails. [#97](https://github.com/Kinto/kinto.js/pull/97) ([n1k0](https://github.com/n1k0))
- [Landed] Added LocalStorage adapter. [#95](https://github.com/Kinto/kinto.js/pull/95) ([n1k0](https://github.com/n1k0))
- Local storage adapters. [#92](https://github.com/Kinto/kinto.js/pull/92) ([n1k0](https://github.com/n1k0))
- Documented current known limitations. [#90](https://github.com/Kinto/kinto.js/pull/90) ([n1k0](https://github.com/n1k0))
- Refs #81, #84 - Add support for backoff and deprecated public events. [#88](https://github.com/Kinto/kinto.js/pull/88) ([n1k0](https://github.com/n1k0))
- Fixes #85 - Added integration test for deprecation headers. [#87](https://github.com/Kinto/kinto.js/pull/87) ([n1k0](https://github.com/n1k0))
- Fixes #68 - Handle Backoff header. [#82](https://github.com/Kinto/kinto.js/pull/82) ([n1k0](https://github.com/n1k0))
- No sudo for travis [#80](https://github.com/Kinto/kinto.js/pull/80) ([magopian](https://github.com/magopian))
- Fixes #69 - Handle deprecation header. [#79](https://github.com/Kinto/kinto.js/pull/79) ([n1k0](https://github.com/n1k0))
- Reintegrated coverage using a two-passes strategy. [#77](https://github.com/Kinto/kinto.js/pull/77) ([n1k0](https://github.com/n1k0))
- Refs #74 - Removed coverage from continuous integration. [#76](https://github.com/Kinto/kinto.js/pull/76) ([n1k0](https://github.com/n1k0))
- Upgrade to Kinto 1.3.1. [#73](https://github.com/Kinto/kinto.js/pull/73) ([n1k0](https://github.com/n1k0))
- Fixes #71 - Simplified empty HTTP response handling. [#72](https://github.com/Kinto/kinto.js/pull/72) ([n1k0](https://github.com/n1k0))
- Add safety check if batch limit setting is falsy (fixes #64) [#65](https://github.com/Kinto/kinto.js/pull/65) ([leplatrem](https://github.com/leplatrem))
- Automatically drop the trailing slash from passed remote url. [#63](https://github.com/Kinto/kinto.js/pull/63) ([n1k0](https://github.com/n1k0))
- Fixes #54 - Upgrade to Kinto server v1.3. [#62](https://github.com/Kinto/kinto.js/pull/62) ([n1k0](https://github.com/n1k0))
- Fixes #13 - Batch requests chunking. [#60](https://github.com/Kinto/kinto.js/pull/60) ([n1k0](https://github.com/n1k0))
- Fixes #57 - Better HTTP error handling. [#58](https://github.com/Kinto/kinto.js/pull/58) ([n1k0](https://github.com/n1k0))
- Fixes #41 - Added Api#fetchServerSettings. [#55](https://github.com/Kinto/kinto.js/pull/55) ([n1k0](https://github.com/n1k0))
- Closes #6 - Local collection data ordering & filtering. [#52](https://github.com/Kinto/kinto.js/pull/52) ([n1k0](https://github.com/n1k0))

### [0.2](https://github.com/Kinto/kinto.js/tree/0.2) (2015-06-30)

**Closed issues:**

- Support opening different cliquetis instances in browser normal vs private modes [#35](https://github.com/Kinto/kinto.js/issues/35)
- Implement conflict resolution helper [#25](https://github.com/Kinto/kinto.js/issues/25)
- Don't store collection last_modified on sync() when conflicts have been encountered [#23](https://github.com/Kinto/kinto.js/issues/23)
- Support passing default auth headers to Cliquetis constructor [#20](https://github.com/Kinto/kinto.js/issues/20)
- Move docs to RTD [#10](https://github.com/Kinto/kinto.js/issues/10)
- Persist per-collection lastModified value [#9](https://github.com/Kinto/kinto.js/issues/9)

\* _This Change Log was automatically generated by [github_changelog_generator](https://github.com/skywinder/Github-Changelog-Generator)_
