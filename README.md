# Kinto.js

[![Greenkeeper badge](https://badges.greenkeeper.io/Kinto/kinto.js.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/Kinto/kinto.js.svg?branch=master)](https://travis-ci.org/Kinto/kinto.js) [![Coverage Status](https://coveralls.io/repos/Kinto/kinto.js/badge.svg?branch=master&service=github)](https://coveralls.io/github/Kinto/kinto.js?branch=master) [![](https://readthedocs.org/projects/kintojs/badge/?version=latest)](http://kintojs.readthedocs.io/)

An [Offline-First](http://offlinefirst.org/) JavaScript client for [Kinto](https://kinto.readthedocs.io/).

> Note: If you're looking for a pure HTTP js client for Kinto, check out [kinto-http.js](https://github.com/Kinto/kinto-http.js).

The idea is to persist data locally in the browser by default, then synchronizing them with the server explicitly when connectivity is guaranteed:

```js
const kinto = new Kinto({remote: "https://kinto.dev.mozaws.net/v1/"});
const posts = kinto.collection("posts");

// Create and store a new post in the browser local database
await posts.create({title: "first post"});

// Publish all local data to the server, import remote changes
await posts.sync();
```


## Documentation

- [Installation](https://kintojs.readthedocs.io/en/latest/installation/)
- [Tutorial](https://kintojs.readthedocs.io/en/latest/tutorial/)
- [Api documentation](https://kintojs.readthedocs.io/en/latest/api/)
- [Extending Kinto.js](https://kintojs.readthedocs.io/en/latest/extending/)
- [Upgrading Kinto.js](https://kintojs.readthedocs.io/en/latest/upgrading/)
- [Known limitations](https://kintojs.readthedocs.io/en/latest/limitations/)
- [Contributing](https://kintojs.readthedocs.io/en/latest/contributing/)
