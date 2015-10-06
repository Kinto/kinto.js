# Extending Kinto.js

## Custom database adapters

By default, Kinto.js performs all local persistence operations using IndexedDB; though if you want to create and use you own, that's definitely possible.

Simply create a class extending from [`Kinto.adapters.BaseAdapter`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/adapters/base.js~BaseAdapter.html), which rather acts as an interface than anything else here:

```js
class MyAdapter extends Kinto.adapters.BaseAdapter {
  constructor(dbname) {
    super();
    this.dbname = dbname;
  }

  create(record) {
    …
  }

  update(record) {
    …
  }

  …
}
```

Then create the Kinto object passing a reference to your adapter class:

```
const kinto = new Kinto({adapter: MyAdapter});
```

Read the `BaseAdapter` class [source code](https://github.com/mozilla-services/kinto.js/blob/master/src/adapters/base.js) to figure out what needs to be implemented exactly. [IDB](https://github.com/mozilla-services/kinto.js/blob/master/src/adapters/IDB.js) and [LocalStorage](https://github.com/mozilla-services/kinto.js/blob/master/src/adapters/localStorage.js) adapters are also worth a read if you need guidance writing your own.
