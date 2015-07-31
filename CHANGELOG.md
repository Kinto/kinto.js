# Change Log

## [Unreleased](https://github.com/Kinto/kinto.js/tree/HEAD)

[Full Changelog](https://github.com/Kinto/kinto.js/compare/0.2...HEAD)

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
- Fixes \#13 - Batch requests chunking. [\#60](https://github.com/Kinto/kinto.js/pull/60) ([n1k0](https://github.com/n1k0))
- Fixes \#57 - Better HTTP error handling. [\#58](https://github.com/Kinto/kinto.js/pull/58) ([n1k0](https://github.com/n1k0))
- Fixes \#41 - Added Api\#fetchServerSettings. [\#55](https://github.com/Kinto/kinto.js/pull/55) ([n1k0](https://github.com/n1k0))
- Closes \#6 - Local collection data ordering & filtering. [\#52](https://github.com/Kinto/kinto.js/pull/52) ([n1k0](https://github.com/n1k0))

## [0.2](https://github.com/Kinto/kinto.js/tree/0.2) (2015-06-30)
**Closed issues:**

- Support opening different cliquetis instances in browser normal vs private modes [\#35](https://github.com/Kinto/kinto.js/issues/35)
- Implement conflict resolution helper [\#25](https://github.com/Kinto/kinto.js/issues/25)
- Don't store collection last\_modified on sync\(\) when conflicts have been encountered [\#23](https://github.com/Kinto/kinto.js/issues/23)
- Support passing default auth headers to Cliquetis constructor [\#20](https://github.com/Kinto/kinto.js/issues/20)
- Move docs to RTD [\#10](https://github.com/Kinto/kinto.js/issues/10)
- Persist per-collection lastModified value [\#9](https://github.com/Kinto/kinto.js/issues/9)



\* *This Change Log was automatically generated by [github_changelog_generator](https://github.com/skywinder/Github-Changelog-Generator)*
