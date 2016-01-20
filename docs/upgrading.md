# Upgrading

This page lists the breaking API changes between major versions of Kinto.js, as well as upgrade tips.

## 1.x to 2.x

Kinto.js 2.x introduces general usage of transactions in database adapters. This change doesn't impact the `Collection` API, so most users shouldn't be impacted by this change.

As *localStorage* doesn't support transactions, its support has been entirely dropped. If you were using it in a Kinto.js 1.x project, please switch to using the default IndexedDB one when upgrading to Kinto.js 2.x.

The `BaseAdapter` interface has been updated to reflect the now mandatory reliance on transactions:

- The `Adapter#create()`, `#update()` and `#delete()` methods are now gone;
- The `Adapter#execute()` method is now to be used whenever you want to write to the database.

Any code directly invoking adapter methods should be updated to reflect this change, by calling `#execute()` instead of atomic operations; so instead of writing:

```js
db.create({id: 1, title: "foo"})
  .then(_ => db.create({id: 2, title: "bar"}));
```

You now need to write:

```js
db.execute(transaction => {
  transaction.create({id: 1, title: "foo"});
  transaction.create({id: 2, title: "bar"});
})
```

> #### Note
>
> *Once again, you usually don't have to worry about this change if you're only relying on the `Collection` public API, where `Collection#create()` and friends are still available.*
