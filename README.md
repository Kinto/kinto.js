# Kinto.js

[![Greenkeeper badge](https://badges.greenkeeper.io/Kinto/kinto.js.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/Kinto/kinto.js.svg?branch=main)](https://travis-ci.org/Kinto/kinto.js) [![Coverage Status](https://coveralls.io/repos/Kinto/kinto.js/badge.svg?branch=main&service=github)](https://coveralls.io/github/Kinto/kinto.js?branch=main) [![](https://readthedocs.org/projects/kintojs/badge/?version=latest)](http://kintojs.readthedocs.io/)

An [Offline-First](http://offlinefirst.org/) JavaScript client for [Kinto](https://kinto.readthedocs.io/).

> Note: This library also includes a pure JS HTTP client for Kinto. You can learn more in [the docs](https://kintojs.readthedocs.io/en/latest/http/).

The idea is to persist data locally in the browser by default, then synchronizing them with the server explicitly when connectivity is guaranteed:

```js
const kinto = new Kinto({ remote: "https://demo.kinto-storage.org/v1/" });
const posts = kinto.collection("posts");

// Create and store a new post in the browser local database
await posts.create({ title: "first post" });

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
