# Kinto.js [![](https://travis-ci.org/Kinto/kinto.js.svg?branch=master)](https://travis-ci.org/Kinto/kinto.js) [![](https://coveralls.io/repos/Kinto/kinto.js/badge.svg?branch=master)](https://coveralls.io/r/Kinto/kinto.js?branch=master) [![](https://readthedocs.org/projects/kintojs/badge/?version=latest)](http://kintojs.readthedocs.io/) [![](https://doc.esdoc.org/github.com/Kinto/kinto.js/badge.svg)](https://doc.esdoc.org/github.com/Kinto/kinto.js)

*An offline-first JavaScript client leveraging the [Kinto API](http://kinto.readthedocs.io/).*

```js
const tasks = new Kinto({
  remote: "https://kinto.dev.mozaws.net/v1"
}).collection("tasks");

await tasks.create({label: "First item", done: false});
await tasks.sync();
```

## Key concepts

* Offline first: every operation is performed locally into IndexedDB by default;
* Synchronization with server shall be ran explicitly.

Take the [tutorial](tutorial.md) to get you started, then read about [API usage](api.md) and eventually browse the [detailed API docs](https://doc.esdoc.org/github.com/Kinto/kinto.js/).

If you want you can have a look at some [advanced](advanced.md) usages.

## Community & Support

* [Code repository](https://github.com/Kinto/kinto.js)
* [Issue tracker](https://github.com/Kinto/kinto.js/issues)
* [Mailing list](https://mail.mozilla.org/listinfo/kinto)
* IRC: [irc.freenode.org#kinto](https://kiwiirc.com/client/irc.freenode.net/?#kinto)

## License

[Mozilla Public License v2](https://www.mozilla.org/MPL/2.0/)
