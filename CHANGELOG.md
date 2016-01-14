# Change Log

## [v1.2.0](https://github.com/Kinto/kinto.js/tree/v1.2.0)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.1.2...v1.2.0)

**Implemented enhancements:**

- Allowing defining the remote endpoint in `#sync()`. [\#257](https://github.com/Kinto/kinto.js/issues/257)
- Lightweight dist files for modern browsers  [\#249](https://github.com/Kinto/kinto.js/issues/249)

**Fixed bugs:**

- Broken links in the doc [\#293](https://github.com/Kinto/kinto.js/issues/293)
- Fix JSM compatibility for Firefox adapter [\#274](https://github.com/Kinto/kinto.js/pull/274) ([leplatrem](https://github.com/leplatrem))
- Fix parsing of ES7 code in esdoc [\#294](https://github.com/Kinto/kinto.js/pull/294) ([leplatrem](https://github.com/leplatrem))

## [v1.1.2](https://github.com/Kinto/kinto.js/tree/v1.1.2) (2015-12-16)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.1.1...v1.1.2)

**Implemented enhancements:**

- Fixes \#263: Handle network request timeouts. r=@leplatrem [\#273](https://github.com/Kinto/kinto.js/pull/273) ([michielbdejong](https://github.com/michielbdejong))
- Add support for db.import [\#265](https://github.com/Kinto/kinto.js/pull/265) ([mozmark](https://github.com/mozmark))

**Fixed bugs:**

- Records not deleted locally when already deleted on server \(404 on delete\) [\#284](https://github.com/Kinto/kinto.js/issues/284)
- Delete records locally when already deleted remotely \(fixes \#284\) [\#285](https://github.com/Kinto/kinto.js/pull/285) ([leplatrem](https://github.com/leplatrem))

**Merged pull requests:**

- Prepare 1.1.2 [\#292](https://github.com/Kinto/kinto.js/pull/292) ([leplatrem](https://github.com/leplatrem))
- Add dist with minimalist version, without polyfills [\#291](https://github.com/Kinto/kinto.js/pull/291) ([leplatrem](https://github.com/leplatrem))
- Update gh-pages to version 0.6.0 🚀 [\#275](https://github.com/Kinto/kinto.js/pull/275) ([greenkeeperio-bot](https://github.com/greenkeeperio-bot))

## [v1.1.1](https://github.com/Kinto/kinto.js/tree/v1.1.1) (2015-11-24)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.1.0...v1.1.1)

**Implemented enhancements:**

- Use let/const instead of var? [\#253](https://github.com/Kinto/kinto.js/issues/253)
- Change demo/demo.js to use a bucket [\#233](https://github.com/Kinto/kinto.js/issues/233)
- Relaxed UUID validation. [\#269](https://github.com/Kinto/kinto.js/pull/269) ([n1k0](https://github.com/n1k0))
- Update to Kinto 1.9.0 [\#267](https://github.com/Kinto/kinto.js/pull/267) ([Natim](https://github.com/Natim))
- let/const is the new var [\#255](https://github.com/Kinto/kinto.js/pull/255) ([pdehaan](https://github.com/pdehaan))
- Add mocha env to .eslintrc [\#252](https://github.com/Kinto/kinto.js/pull/252) ([pdehaan](https://github.com/pdehaan))

**Fixed bugs:**

- Handle network request timeouts. [\#263](https://github.com/Kinto/kinto.js/issues/263)

**Closed issues:**

- Kinto.js currently forces IDs to be UUID4 [\#261](https://github.com/Kinto/kinto.js/issues/261)

**Merged pull requests:**

- Added docs for packaging and releasing Kinto.js. [\#251](https://github.com/Kinto/kinto.js/pull/251) ([n1k0](https://github.com/n1k0))

## [v1.1.0](https://github.com/Kinto/kinto.js/tree/v1.1.0) (2015-11-05)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.0.0...v1.1.0)

**Implemented enhancements:**

- Preserve old files in gh-pages branch, so older assets versions aren't overriden [\#241](https://github.com/Kinto/kinto.js/issues/241)
- Hosted dist files should contain the version number in their filename [\#228](https://github.com/Kinto/kinto.js/issues/228)
- Updated dist command to add current version to asset names. [\#230](https://github.com/Kinto/kinto.js/pull/230) ([n1k0](https://github.com/n1k0))

**Fixed bugs:**

- Handle the case of a flushed server in the demo. [\#231](https://github.com/Kinto/kinto.js/issues/231)
- Fixes \#231: Updated demo to handle flushed server. [\#232](https://github.com/Kinto/kinto.js/pull/232) ([n1k0](https://github.com/n1k0))

**Merged pull requests:**

- Updated dist and publish commands to support versioned assets. [\#248](https://github.com/Kinto/kinto.js/pull/248) ([n1k0](https://github.com/n1k0))
- Update babelify to version 7.0.1 🚀 [\#239](https://github.com/Kinto/kinto.js/pull/239) ([greenkeeperio-bot](https://github.com/greenkeeperio-bot))
- Update gh-pages to version 0.5.0 🚀 [\#237](https://github.com/Kinto/kinto.js/pull/237) ([greenkeeperio-bot](https://github.com/greenkeeperio-bot))
- Updated travis configuration to install Kinto 1.7.0. [\#229](https://github.com/Kinto/kinto.js/pull/229) ([n1k0](https://github.com/n1k0))
- Exposed open\(\) and close\(\) methods to the BaseAdapter interface. [\#227](https://github.com/Kinto/kinto.js/pull/227) ([n1k0](https://github.com/n1k0))
- 212 firefox entry point [\#219](https://github.com/Kinto/kinto.js/pull/219) ([mozmark](https://github.com/mozmark))

## [v1.0.0](https://github.com/Kinto/kinto.js/tree/v1.0.0) (2015-10-27)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.0.0-rc.5...v1.0.0)

**Implemented enhancements:**

- Don't version dist files, publish & host them. [\#203](https://github.com/Kinto/kinto.js/issues/203)
- Add a publish-demo command to deploy demo assets to gh-pages [\#202](https://github.com/Kinto/kinto.js/issues/202)
- Investigate how to allow importing kinto public modules from other packages [\#193](https://github.com/Kinto/kinto.js/issues/193)
- Remove unneeded external dependencies [\#190](https://github.com/Kinto/kinto.js/issues/190)
- How does Kinto.js detect server was flushed and reupload the local database. [\#178](https://github.com/Kinto/kinto.js/issues/178)
- Consistent reported errors formatting in sync result object [\#176](https://github.com/Kinto/kinto.js/issues/176)
- Fixes \#176: Consistent sync result error reporting. [\#220](https://github.com/Kinto/kinto.js/pull/220) ([n1k0](https://github.com/n1k0))
- Fixes \#203: Removed dist files. [\#217](https://github.com/Kinto/kinto.js/pull/217) ([n1k0](https://github.com/n1k0))
- Flushed server handling. [\#214](https://github.com/Kinto/kinto.js/pull/214) ([n1k0](https://github.com/n1k0))
- Inject dependencies [\#199](https://github.com/Kinto/kinto.js/pull/199) ([mozmark](https://github.com/mozmark))

**Fixed bugs:**

- Installing 1.0.0-rc.5 through npm and using it from the node command triggers an error [\#208](https://github.com/Kinto/kinto.js/issues/208)
- Fixes \#114: Drop collection metas on \#clear\(\). [\#221](https://github.com/Kinto/kinto.js/pull/221) ([n1k0](https://github.com/n1k0))

**Closed issues:**

- Investigate how to link to foreign symbols from within esdoc [\#215](https://github.com/Kinto/kinto.js/issues/215)
- reject instead of throw if item not found in Collection\#get [\#200](https://github.com/Kinto/kinto.js/issues/200)
- Update tutorial to use the /v1 version of the public moz test kinto server [\#188](https://github.com/Kinto/kinto.js/issues/188)
- Investigate Travis failure [\#182](https://github.com/Kinto/kinto.js/issues/182)
- Avoid typing and extending classes for transformers [\#155](https://github.com/Kinto/kinto.js/issues/155)
- Add an Authentication section to the docs [\#99](https://github.com/Kinto/kinto.js/issues/99)

**Merged pull requests:**

- Update browserify to version 12.0.0 🚀 [\#224](https://github.com/Kinto/kinto.js/pull/224) ([greenkeeperio-bot](https://github.com/greenkeeperio-bot))
- Fixes \#99: Added docs for authorization. [\#223](https://github.com/Kinto/kinto.js/pull/223) ([n1k0](https://github.com/n1k0))
- Update to Kinto 1.6.2 [\#222](https://github.com/Kinto/kinto.js/pull/222) ([Natim](https://github.com/Natim))
- Fixes \#215: Added internal links to esdoc. [\#218](https://github.com/Kinto/kinto.js/pull/218) ([n1k0](https://github.com/n1k0))
- Fixes \#202: Added publish-demo command. [\#216](https://github.com/Kinto/kinto.js/pull/216) ([n1k0](https://github.com/n1k0))
- Fixes \#190: Avoid exporting Buffer to dist files. [\#211](https://github.com/Kinto/kinto.js/pull/211) ([n1k0](https://github.com/n1k0))
- Fix snippet doc index \(create instead of add\) [\#207](https://github.com/Kinto/kinto.js/pull/207) ([leplatrem](https://github.com/leplatrem))
- Fix details in documentation [\#205](https://github.com/Kinto/kinto.js/pull/205) ([leplatrem](https://github.com/leplatrem))
- Fix import path in esdoc [\#204](https://github.com/Kinto/kinto.js/pull/204) ([leplatrem](https://github.com/leplatrem))
- Moved fake indexedDB symbol imports to test logic. [\#201](https://github.com/Kinto/kinto.js/pull/201) ([n1k0](https://github.com/n1k0))
- Update to Kinto 1.5.1 [\#195](https://github.com/Kinto/kinto.js/pull/195) ([Natim](https://github.com/Natim))
- Documentation improvements. [\#194](https://github.com/Kinto/kinto.js/pull/194) ([n1k0](https://github.com/n1k0))
- Adds esdoc support. [\#192](https://github.com/Kinto/kinto.js/pull/192) ([n1k0](https://github.com/n1k0))

## [v1.0.0-rc.5](https://github.com/Kinto/kinto.js/tree/v1.0.0-rc.5) (2015-09-30)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/v1.0.0-rc.4...v1.0.0-rc.5)

**Merged pull requests:**

- 1.0.0-rc.5 [\#189](https://github.com/Kinto/kinto.js/pull/189) ([n1k0](https://github.com/n1k0))
- Bump 1.0.0-rc.4. [\#187](https://github.com/Kinto/kinto.js/pull/187) ([n1k0](https://github.com/n1k0))

## [v1.0.0-rc.4](https://github.com/Kinto/kinto.js/tree/v1.0.0-rc.4) (2015-09-29)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/1.0.0-rc.3...v1.0.0-rc.4)

**Implemented enhancements:**

- Add server logging to integration tests, ensure process doesn't die. [\#185](https://github.com/Kinto/kinto.js/issues/185)
- Handling errors during the this.create step of \_importChange [\#165](https://github.com/Kinto/kinto.js/issues/165)
- Raise an error when an id is passed to Collection\#create but not necessary [\#158](https://github.com/Kinto/kinto.js/issues/158)
- Pluggable ID schema's [\#138](https://github.com/Kinto/kinto.js/issues/138)
- Avoid running coverage twice now that isparta is fixed [\#133](https://github.com/Kinto/kinto.js/issues/133)
- Expose Collection.strategy.\* [\#113](https://github.com/Kinto/kinto.js/issues/113)
- Add lint/style check in Travis [\#5](https://github.com/Kinto/kinto.js/issues/5)
- Fixes \#122 - Added Kinto.createRemoteTransformer\(\). [\#139](https://github.com/Kinto/kinto.js/pull/139) ([n1k0](https://github.com/n1k0))

**Fixed bugs:**

- Improve consistency of conflict resolution strategies [\#150](https://github.com/Kinto/kinto.js/issues/150)
- Why is Content-Length header required on Kinto server responses? [\#125](https://github.com/Kinto/kinto.js/issues/125)
- Document `bucket` option [\#120](https://github.com/Kinto/kinto.js/issues/120)
- Error when server returns 400 error response [\#110](https://github.com/Kinto/kinto.js/issues/110)

**Closed issues:**

- Can we avoid OPTIONS preflights on \(some\) GET requests? [\#170](https://github.com/Kinto/kinto.js/issues/170)
- Avoid checking the server settings for each collection [\#169](https://github.com/Kinto/kinto.js/issues/169)
- Ensure lastModified value isn't updated if errors are encountered [\#163](https://github.com/Kinto/kinto.js/issues/163)
- Cache headers [\#162](https://github.com/Kinto/kinto.js/issues/162)
- Non-empty syncResults.updated when syncing to an empty remote collection [\#160](https://github.com/Kinto/kinto.js/issues/160)
- Move `Collection\#use` to optional second argument of `Kinto\#collection` [\#148](https://github.com/Kinto/kinto.js/issues/148)
- Always brace single-line controlled statements [\#141](https://github.com/Kinto/kinto.js/issues/141)
- Investigate offline support feature [\#140](https://github.com/Kinto/kinto.js/issues/140)
- Freeze the versions of the compilers [\#131](https://github.com/Kinto/kinto.js/issues/131)
- Coverage badge is broken [\#127](https://github.com/Kinto/kinto.js/issues/127)
- Unhandled promise rejection if server response has no 'data' field [\#126](https://github.com/Kinto/kinto.js/issues/126)
- Report http errors in a meaningful way [\#124](https://github.com/Kinto/kinto.js/issues/124)
- Is mutating the \[\[Prototype\]\] of an object slow? [\#123](https://github.com/Kinto/kinto.js/issues/123)
- Using Transformers with prototypal inheritance [\#122](https://github.com/Kinto/kinto.js/issues/122)
- Maybe add fetch-only / push-only option in Collection\#sync\(\) [\#116](https://github.com/Kinto/kinto.js/issues/116)
- Accept Syncto base64 record\_ids [\#115](https://github.com/Kinto/kinto.js/issues/115)

**Merged pull requests:**

- Fixes \#185: detailed server error logging in case start fails. [\#186](https://github.com/Kinto/kinto.js/pull/186) ([n1k0](https://github.com/n1k0))
- Upgraded Kinto to 1.5.0. [\#184](https://github.com/Kinto/kinto.js/pull/184) ([n1k0](https://github.com/n1k0))
- 'git co' -\> 'git clone' in install instructions [\#179](https://github.com/Kinto/kinto.js/pull/179) ([michielbdejong](https://github.com/michielbdejong))
- Fixes \#169 - Instantiate Api only once [\#175](https://github.com/Kinto/kinto.js/pull/175) ([michielbdejong](https://github.com/michielbdejong))
- Fixes \#165: Expose per-record import errors. [\#174](https://github.com/Kinto/kinto.js/pull/174) ([n1k0](https://github.com/n1k0))
- Fixes 155: Drop use of classes for transformers and IdSchema. [\#171](https://github.com/Kinto/kinto.js/pull/171) ([n1k0](https://github.com/n1k0))
- Fixes \#158 - Collection\#create Id requirements validation. [\#168](https://github.com/Kinto/kinto.js/pull/168) ([n1k0](https://github.com/n1k0))
- Upgraded Kinto to 1.4.0. [\#167](https://github.com/Kinto/kinto.js/pull/167) ([n1k0](https://github.com/n1k0))
- Correct code comment for `Collection\#pullChanges` [\#166](https://github.com/Kinto/kinto.js/pull/166) ([michielbdejong](https://github.com/michielbdejong))
- Fixes \#163: Ensure lastModified isn't saved on import errors encountered [\#164](https://github.com/Kinto/kinto.js/pull/164) ([n1k0](https://github.com/n1k0))
- Refs \#160: Sync flow and result object format optimizations. [\#161](https://github.com/Kinto/kinto.js/pull/161) ([n1k0](https://github.com/n1k0))
- Section label resolving-conflicts -\> resolving-conflicts-manually [\#159](https://github.com/Kinto/kinto.js/pull/159) ([michielbdejong](https://github.com/michielbdejong))
- Fixes \#150 — Consistent conflicts resolution strategies. [\#152](https://github.com/Kinto/kinto.js/pull/152) ([n1k0](https://github.com/n1k0))
- Fixes \#113 - Expose synchronization strategy constants. [\#151](https://github.com/Kinto/kinto.js/pull/151) ([n1k0](https://github.com/n1k0))
- Fixes \#148 - Extra arg on Kinto\#collection to replace Collection\#use. [\#149](https://github.com/Kinto/kinto.js/pull/149) ([michielbdejong](https://github.com/michielbdejong))
- Fixes \#125, fixes \#110: Drop reliance on Content-Length header. [\#146](https://github.com/Kinto/kinto.js/pull/146) ([n1k0](https://github.com/n1k0))
- Fixes \#120 - Documented bucket option. [\#145](https://github.com/Kinto/kinto.js/pull/145) ([n1k0](https://github.com/n1k0))
- Fixes \#138 - Implement custom id schema's [\#143](https://github.com/Kinto/kinto.js/pull/143) ([michielbdejong](https://github.com/michielbdejong))
- Fix db transactions on safari. [\#142](https://github.com/Kinto/kinto.js/pull/142) ([n1k0](https://github.com/n1k0))
- Fix test failing when KINTO\_PSERVE\_EXECUTABLE is not set in the env. [\#132](https://github.com/Kinto/kinto.js/pull/132) ([QuentinRoy](https://github.com/QuentinRoy))
- Add instructions on how to run functional tests. [\#130](https://github.com/Kinto/kinto.js/pull/130) ([almet](https://github.com/almet))
- Hint at http error reporting in docs example, fix \#124 [\#128](https://github.com/Kinto/kinto.js/pull/128) ([michielbdejong](https://github.com/michielbdejong))
- Add ESLint on TravisCI \(fixes \#5\) [\#121](https://github.com/Kinto/kinto.js/pull/121) ([leplatrem](https://github.com/leplatrem))
- Remove mentions of Cliquet [\#118](https://github.com/Kinto/kinto.js/pull/118) ([leplatrem](https://github.com/leplatrem))
- Document list sorting and filtering [\#117](https://github.com/Kinto/kinto.js/pull/117) ([leplatrem](https://github.com/leplatrem))
- Introduce local DB prefix [\#111](https://github.com/Kinto/kinto.js/pull/111) ([leplatrem](https://github.com/leplatrem))
- Nits in backoff and alert header docs [\#109](https://github.com/Kinto/kinto.js/pull/109) ([leplatrem](https://github.com/leplatrem))
- Clarify docs about having to resolve incoming conflicts [\#108](https://github.com/Kinto/kinto.js/pull/108) ([leplatrem](https://github.com/leplatrem))
- Skip last pull if nothing to push [\#107](https://github.com/Kinto/kinto.js/pull/107) ([leplatrem](https://github.com/leplatrem))
- \[Ready for Review\] Initial implementation of transformers. [\#106](https://github.com/Kinto/kinto.js/pull/106) ([n1k0](https://github.com/n1k0))
- Fixes \#103 - Updated links to public static assets. [\#104](https://github.com/Kinto/kinto.js/pull/104) ([n1k0](https://github.com/n1k0))
- Remove the Backoff header handling exclusion for 304 responses  [\#86](https://github.com/Kinto/kinto.js/pull/86) ([n1k0](https://github.com/n1k0))
- Change the license [\#2](https://github.com/Kinto/kinto.js/pull/2) ([almet](https://github.com/almet))

## [1.0.0-rc.3](https://github.com/Kinto/kinto.js/tree/1.0.0-rc.3) (2015-07-31)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/1.0.0-rc.2...1.0.0-rc.3)

## [1.0.0-rc.2](https://github.com/Kinto/kinto.js/tree/1.0.0-rc.2) (2015-07-31)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/1.0.0-rc.1...1.0.0-rc.2)

**Closed issues:**

- Host static assets on a CDN [\#103](https://github.com/Kinto/kinto.js/issues/103)

**Merged pull requests:**

- Fixed npm published package. [\#105](https://github.com/Kinto/kinto.js/pull/105) ([n1k0](https://github.com/n1k0))

## [1.0.0-rc.1](https://github.com/Kinto/kinto.js/tree/1.0.0-rc.1) (2015-07-31)
[Full Changelog](https://github.com/Kinto/kinto.js/compare/0.2...1.0.0-rc.1)

**Implemented enhancements:**

- Add integration test for deprecation headers [\#85](https://github.com/Kinto/kinto.js/issues/85)
- Handle deprecation headers [\#69](https://github.com/Kinto/kinto.js/issues/69)
- Handle backoff indicators [\#68](https://github.com/Kinto/kinto.js/issues/68)
- Support unlimited batch requests [\#64](https://github.com/Kinto/kinto.js/issues/64)

**Fixed bugs:**

- Error on synchronization with a HTTP 304 on the collection from the server [\#71](https://github.com/Kinto/kinto.js/issues/71)

**Closed issues:**

- Sync flow should stop when pushing changes fails [\#96](https://github.com/Kinto/kinto.js/issues/96)
- Create a localStorage adapter. [\#94](https://github.com/Kinto/kinto.js/issues/94)
- Cached Kinto collections instances are not uniquely identified [\#89](https://github.com/Kinto/kinto.js/issues/89)
- Expose events for server backoff  [\#84](https://github.com/Kinto/kinto.js/issues/84)
- Provide a hook to interecept deprecation warnings. [\#81](https://github.com/Kinto/kinto.js/issues/81)
- Builds are marked green even if failures occured. [\#74](https://github.com/Kinto/kinto.js/issues/74)
- Add a simple functional test suite for the demo, using jsdom. [\#70](https://github.com/Kinto/kinto.js/issues/70)
- Refactor generic HTTP error handling. [\#57](https://github.com/Kinto/kinto.js/issues/57)
- Expose conflicting record details on BATCH 412 responses [\#56](https://github.com/Kinto/kinto.js/issues/56)
- Demo is broken. [\#54](https://github.com/Kinto/kinto.js/issues/54)
- Don't mention Cliquet in the repo description [\#47](https://github.com/Kinto/kinto.js/issues/47)
- Fetch remote server settings. [\#41](https://github.com/Kinto/kinto.js/issues/41)
- Add checks for unsupported Cliquet protocol version. [\#40](https://github.com/Kinto/kinto.js/issues/40)
- Host a demo instance on Github pages [\#38](https://github.com/Kinto/kinto.js/issues/38)
- Remote URL should have a trailing slash. [\#33](https://github.com/Kinto/kinto.js/issues/33)
- Validate passed uuids [\#28](https://github.com/Kinto/kinto.js/issues/28)
- Reflect record ids sent to BATCH in result object [\#15](https://github.com/Kinto/kinto.js/issues/15)
- Handle BATCH 409 responses [\#14](https://github.com/Kinto/kinto.js/issues/14)
- Handle BATCH request limit [\#13](https://github.com/Kinto/kinto.js/issues/13)
- Improve error reporting when fetching changes failed. [\#12](https://github.com/Kinto/kinto.js/issues/12)
- Implement local list filtering  [\#6](https://github.com/Kinto/kinto.js/issues/6)

**Merged pull requests:**

- Update after Kinto organization move. [\#102](https://github.com/Kinto/kinto.js/pull/102) ([Natim](https://github.com/Natim))
- Prepare 1.0.0-rc.1 [\#101](https://github.com/Kinto/kinto.js/pull/101) ([n1k0](https://github.com/n1k0))
- Added synchronization flow diagram. [\#100](https://github.com/Kinto/kinto.js/pull/100) ([n1k0](https://github.com/n1k0))
- Fixes \#91 - Added corsMode option. [\#98](https://github.com/Kinto/kinto.js/pull/98) ([n1k0](https://github.com/n1k0))
- Fixes \#96 - Sync flow should stop when pushing changes fails. [\#97](https://github.com/Kinto/kinto.js/pull/97) ([n1k0](https://github.com/n1k0))
- \[Landed\] Added LocalStorage adapter. [\#95](https://github.com/Kinto/kinto.js/pull/95) ([n1k0](https://github.com/n1k0))
- Local storage adapters. [\#92](https://github.com/Kinto/kinto.js/pull/92) ([n1k0](https://github.com/n1k0))
- Documented current known limitations. [\#90](https://github.com/Kinto/kinto.js/pull/90) ([n1k0](https://github.com/n1k0))
- Refs \#81, \#84 - Add support for backoff and deprecated public events. [\#88](https://github.com/Kinto/kinto.js/pull/88) ([n1k0](https://github.com/n1k0))
- Fixes \#85 - Added integration test for deprecation headers. [\#87](https://github.com/Kinto/kinto.js/pull/87) ([n1k0](https://github.com/n1k0))
- Fixes \#68 - Handle Backoff header. [\#82](https://github.com/Kinto/kinto.js/pull/82) ([n1k0](https://github.com/n1k0))
- No sudo for travis [\#80](https://github.com/Kinto/kinto.js/pull/80) ([magopian](https://github.com/magopian))
- Fixes \#69 - Handle deprecation header. [\#79](https://github.com/Kinto/kinto.js/pull/79) ([n1k0](https://github.com/n1k0))
- Reintegrated coverage using a two-passes strategy. [\#77](https://github.com/Kinto/kinto.js/pull/77) ([n1k0](https://github.com/n1k0))
- Refs \#74 - Removed coverage from continuous integration. [\#76](https://github.com/Kinto/kinto.js/pull/76) ([n1k0](https://github.com/n1k0))
- Upgrade to Kinto 1.3.1. [\#73](https://github.com/Kinto/kinto.js/pull/73) ([n1k0](https://github.com/n1k0))
- Fixes \#71 - Simplified empty HTTP response handling. [\#72](https://github.com/Kinto/kinto.js/pull/72) ([n1k0](https://github.com/n1k0))
- Add safety check if batch limit setting is falsy \(fixes \#64\) [\#65](https://github.com/Kinto/kinto.js/pull/65) ([leplatrem](https://github.com/leplatrem))
- Automatically drop the trailing slash from passed remote url. [\#63](https://github.com/Kinto/kinto.js/pull/63) ([n1k0](https://github.com/n1k0))
- Fixes \#54 - Upgrade to Kinto server v1.3. [\#62](https://github.com/Kinto/kinto.js/pull/62) ([n1k0](https://github.com/n1k0))
- Fixes \#28 - Validate uuids [\#61](https://github.com/Kinto/kinto.js/pull/61) ([n1k0](https://github.com/n1k0))
- Fixes \#13 - Batch requests chunking. [\#60](https://github.com/Kinto/kinto.js/pull/60) ([n1k0](https://github.com/n1k0))
- Fixes \#57 - Better HTTP error handling. [\#58](https://github.com/Kinto/kinto.js/pull/58) ([n1k0](https://github.com/n1k0))
- Fixes \#41 - Added Api\#fetchServerSettings. [\#55](https://github.com/Kinto/kinto.js/pull/55) ([n1k0](https://github.com/n1k0))
- Refs \#40 - Added checks for supported protocol version. [\#53](https://github.com/Kinto/kinto.js/pull/53) ([n1k0](https://github.com/n1k0))
- Closes \#6 - Local collection data ordering & filtering. [\#52](https://github.com/Kinto/kinto.js/pull/52) ([n1k0](https://github.com/n1k0))
- Fixes \#12 - Improved Api\#fetchChangesSince error messages. [\#51](https://github.com/Kinto/kinto.js/pull/51) ([n1k0](https://github.com/n1k0))
- Added full integration test suite. [\#50](https://github.com/Kinto/kinto.js/pull/50) ([n1k0](https://github.com/n1k0))
- Adding the documentation badge in the readme. [\#49](https://github.com/Kinto/kinto.js/pull/49) ([n1k0](https://github.com/n1k0))
- "ReferenceError: render is not defined" and a few typos in tutorial [\#46](https://github.com/Kinto/kinto.js/pull/46) ([ferjm](https://github.com/ferjm))
- Update index.md [\#43](https://github.com/Kinto/kinto.js/pull/43) ([almet](https://github.com/almet))
- Don't mention cliquet in the readme. [\#42](https://github.com/Kinto/kinto.js/pull/42) ([almet](https://github.com/almet))
- Rename project to kinto.js [\#37](https://github.com/Kinto/kinto.js/pull/37) ([n1k0](https://github.com/n1k0))
- Kinto setup script. [\#32](https://github.com/Kinto/kinto.js/pull/32) ([n1k0](https://github.com/n1k0))

## [0.2](https://github.com/Kinto/kinto.js/tree/0.2) (2015-06-30)
**Closed issues:**

- Support opening different cliquetis instances in browser normal vs private modes [\#35](https://github.com/Kinto/kinto.js/issues/35)
- Implement conflict resolution helper [\#25](https://github.com/Kinto/kinto.js/issues/25)
- Don't store collection last\_modified on sync\(\) when conflicts have been encountered [\#23](https://github.com/Kinto/kinto.js/issues/23)
- Support passing default auth headers to Cliquetis constructor [\#20](https://github.com/Kinto/kinto.js/issues/20)
- Move docs to RTD [\#10](https://github.com/Kinto/kinto.js/issues/10)
- Persist per-collection lastModified value [\#9](https://github.com/Kinto/kinto.js/issues/9)

**Merged pull requests:**

- Closes \#20 - Added support for request headers option to Cliquetis constructor. [\#36](https://github.com/Kinto/kinto.js/pull/36) ([n1k0](https://github.com/n1k0))
- Replace \#18 - Demo local server script. [\#31](https://github.com/Kinto/kinto.js/pull/31) ([n1k0](https://github.com/n1k0))
- Fixes \#25 - Conflict resolution helper. [\#27](https://github.com/Kinto/kinto.js/pull/27) ([n1k0](https://github.com/n1k0))
- Fixes \#23 - Don't bump local collection last\_modified on conflicts. [\#24](https://github.com/Kinto/kinto.js/pull/24) ([n1k0](https://github.com/n1k0))
- Switch to ETags instead of IMS-IUMS [\#22](https://github.com/Kinto/kinto.js/pull/22) ([leplatrem](https://github.com/leplatrem))
- Better docs, including tutorial [\#21](https://github.com/Kinto/kinto.js/pull/21) ([n1k0](https://github.com/n1k0))
- Port Cliquetis for Kinto 1.0 [\#19](https://github.com/Kinto/kinto.js/pull/19) ([Natim](https://github.com/Natim))
- Versionned dist file to ease sharing. [\#17](https://github.com/Kinto/kinto.js/pull/17) ([n1k0](https://github.com/n1k0))
- Added support for code coverage & coveralls service. [\#8](https://github.com/Kinto/kinto.js/pull/8) ([n1k0](https://github.com/n1k0))
- \[Ready for Review\] First sync\(\) implementation. [\#7](https://github.com/Kinto/kinto.js/pull/7) ([n1k0](https://github.com/n1k0))
- Simplified Collection API. [\#4](https://github.com/Kinto/kinto.js/pull/4) ([n1k0](https://github.com/n1k0))
- First implementation of local CRUD operations. [\#3](https://github.com/Kinto/kinto.js/pull/3) ([n1k0](https://github.com/n1k0))
- Draft dreamcode in README [\#1](https://github.com/Kinto/kinto.js/pull/1) ([leplatrem](https://github.com/leplatrem))



\* *This Change Log was automatically generated by [github_changelog_generator](https://github.com/skywinder/Github-Changelog-Generator)*
