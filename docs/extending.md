# Extending Kinto.js

## Custom database adapters

By default, Kinto.js performs all local persistence operations using [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API); though if you want to create and use your own, that's definitely possible if you conform to the expected interface.

Simply create a class extending [`Kinto.adapters.BaseAdapter`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/adapters/base.js~BaseAdapter.html), which acts as an abstract class:

```js
class MyAdapter extends Kinto.adapters.BaseAdapter {
  constructor(storeName, options={}) {
    super();
    this.storeName = storeName;
    this.options = options;
  }

  execute(callback, options={preload: []}) {
    // performs a transaction
  }

  get(id) {
    // retrieve a single record by its id
  }

  list() {
    // retrieve the list of records
  }
  …
}
```

Then create the Kinto object passing a reference to your adapter class:

```
const kinto = new Kinto({adapter: MyAdapter});
```

Each call to `kinto.collection(...)` will then instantiate a new `MyAdapter`.

Read the `BaseAdapter` class [source code](https://github.com/Kinto/kinto.js/blob/master/src/adapters/base.js) to figure out what needs to be implemented exactly. The [IDB](https://github.com/Kinto/kinto.js/blob/master/src/adapters/IDB.js) adapter is also worth a read if you need guidance writing your own.

The `options` argument to the adapter constructor is taken from the `adapterOptions` given to the Kinto constructor. For example, if your adapter recognizes a `style` option:

```
const kinto = new Kinto({adapter: MyAdapter, adapterOptions: {style: "traditional"}});
```

The given `adapterOptions` will be the second argument to the `MyAdapter` constructor. If you need to share state across the per-collection `MyAdapter`s, you can track it using `adapterOptions`.

## Opening and closing

It's very common for adapters to want to maintain a "handle" to some other resource (where actual storage happens). This "handle" may have its own lifetime which needs to be explicitly managed, i.e. you may want to open or close the handle. It's therefore common for adapters to define their own `open()` and `close()` methods.

These methods are not part of the Adapter contract and do not have kinto.js-specific semantics. It seems that the lifetime of that "handle" can vary according to the application, so kinto.js doesn't make any assumptions about any `open()` or `close()` methods. Non-adapter code will never call these methods.

In short, you can define `open()` and `close()` methods if you like, and call them yourself however you like. The `IDB` adapter provided with kinto.js does exactly this -- it opens and closes its adapter every time it uses it. You can also define an adapter that has to be explicitly `open()`ed from "outside" before it can be used.

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
const preload = await db.list();
await db.execute(transaction => {
  const existing = transaction.get(1);
  if (!existing) {
    throw new Error("Missing record #1");
  }
  transaction.update({...existing, foo: "bar"});
}, {preload});
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
