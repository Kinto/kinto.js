# Extending Kinto.js

## Custom database adapters

By default, Kinto.js performs all local persistence operations using [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API); though if you want to create and use your own, that's definitely possible if you conform to the expected interface.

Simply create a class extending [`Kinto.adapters.BaseAdapter`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/adapters/base.js~BaseAdapter.html), which acts as an abstract class:

```js
class MyAdapter extends Kinto.adapters.BaseAdapter {
  constructor(dbname, options={}) {
    super();
    this.dbname = dbname;
    this.options = options;
  }

  open() {
    // open a database connection
    return super.open();
  }

  close() {
    // close a database connection
    return super.close();
  }

  execute(callback, options={preload: []}) {
    // performs a transaction
  }

  get(id) {
    // retrieve a single record by its id
  }

  list() {
    retrieve the list of records
  }
  …
}
```

Note that `#open()` and `#close()` are implemented and are simply resolving by default.

Then create the Kinto object passing a reference to your adapter class:

```
const kinto = new Kinto({adapter: MyAdapter});
```

Read the `BaseAdapter` class [source code](https://github.com/Kinto/kinto.js/blob/master/src/adapters/base.js) to figure out what needs to be implemented exactly. The [IDB](https://github.com/Kinto/kinto.js/blob/master/src/adapters/IDB.js) adapter is also worth a read if you need guidance writing your own.

The `options` argument to the adapter constructor is taken from the `adapterOptions` given to the Kinto constructor. For example, if your adapter recognizes a `style` option:

```
const kinto = new Kinto({adapter: MyAdapter, adapterOptions: {style: "traditional"}});
```

## Supporting transactions

A Kinto.js db adapter **must** implement an `execute()` method to support transactions. It should accept a callback, and a `preload` options:

### The `callback` argument

The callback will be passed an object which must implement the following synchronous CRUD operation methods:

- `create(record)`
- `update(record)`
- `delete(id)`
- `get(id)`

These are transaction operation descriptors and **must work synchronously**.

### The `preload` option

Because of limitations in IndexedDB implementations, there can't be any asynchronous calls within an opened transaction, or it will be silentely auto-commited. To circumvent this limitation, the `preload` option accepts a list of preloaded records so the `get()` method can work synchronously. All adapters need to conform to this rule as well.

By default, the list of preloaded records is empty.

### Example

The typical target usage flow is a follow:

```js
db.list()
  .then(preload => {
    return db.execute(transaction => {
      const existing = transaction.get(1);
      if (!existing) {
        throw new Error("Missing record #1");
      }
      transaction.update({...existing, foo: "bar"});
    }, {preload});
  });
```

## Hooks

Hooks can be called to extend the behaviour of Kinto. So far it is only possible to hook when incoming changes are to be applied.

- `incoming-changes` hooks are called just after new changes are retrieved, and
  before these changes are reflected locally.

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
    "incoming-changes": doSomething
  }
});
```
