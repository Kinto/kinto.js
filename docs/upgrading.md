# Upgrading

This page lists the breaking API changes between major versions of Kinto.js, as well as upgrade tips.

## 11.x to 12.x

* The `dbPrefix` option in the `Kinto` and `Collection` constructors was dropped in favor of the `dbName` field in the `adapterOptions`.

**Database Schema Change**

This version introduces a **major change**: instead of having one IndexedDB database per collection (named `{bucket}/{collection}`), we now have only one database (called `KintoDB` by default) which stores records indexed by collection.

If you are upgrading and want your data to be automatically migrated, set the `adapterOptions.migrateOldData` to `true` in the `Kinto()` constructor, or `false` otherwise. Note that the old database will also be deleted.

```js
const db = new Kinto({
  adapterOptions: {
    migrateOldData: true,
  }
});
const tasks = db.collection("tasks");
```

#### New Database Schema

The database (named `KintoDB` by default) will have two stores `records` and `timestamps`.

The ``records`` store now looks like this:

```
+-----------------------------------------------------------+-----------------------------------------------------------------------------------------------------------+
|                        Primary Key                        |                                                   Data                                                    |
+-----------------------------------------------------------+-----------------------------------------------------------------------------------------------------------+
| ["blog/articles", "df85ec54-87aa-405d-bfc5-bcc96adef7ae"] | {_cid: "blog/articles", id: "df85ec54-87aa-405d-bfc5-bcc96adef7ae", _status: "created"}                   |
| ["blog/articles", "161c26be-6f84-49e6-973c-533a5950223d"] | {_cid: "blog/articles", id: "161c26be-6f84-49e6-973c-533a5950223d", _status: "deleted"}                   |
| ["default/tasks", "29db6353-276a-4c77-82ef-be937fbbcfa3"] | {_cid: "default/tasks", id: "29db6353-276a-4c77-82ef-be937fbbcfa3", _status: "sync", last_modified: 1346} |
| ["default/tasks", "c91dcef8-062c-481a-8c06-bfa344f2837d"] | {_cid: "default/tasks", id: "c91dcef8-062c-481a-8c06-bfa344f2837d", _status: "sync", last_modified: 1142} |
+-----------------------------------------------------------+-----------------------------------------------------------------------------------------------------------+
```

The ``timestamps`` store now looks like this:

```
+-----------------+--------------------------------------------+
|   Primary Key   |                    Data                    |
+-----------------+--------------------------------------------+
| "blog/articles" | {cid: "blog/articles", value: 12958536703} |
| "default/tasks" | {cid: "default/tasks", value: 14896689683} |
+-----------------+--------------------------------------------+
```

## 8.x to 9.x

* When fixing #691, the types of values in SyncResultObject.resolved were changed. Previously, they were just the resolution for a given record; now, they are {accepted, rejected}, with accepted being the new value. Any code using elements of this list (e.g. `SyncResultObject.resolved[i]`) should now use the accepted property of that element (e.g. `SyncResultObject.resolved[i].accepted`).

## 7.x to 8.x

* As part of #640, some of the expectations of remote transformers were changed. Previously, a remote transformer could return anything for a deleted record, and that record would still be deleted. Now, if a transformer changes a record's `_status`, it will be respected.

## 6.x to 7.x

* The open() and close() methods were removed from BaseAdapter (#599). These were never called by Kinto code. You can continue to define these methods and invoke them as you like.

## 5.x to 6.x

* The Firefox storage adapter was removed (#562). Development on this module has been moved to the Firefox Mercurial repository.

## 4.x to 5.x

* The helper `utils/reduceRecords` was removed (#543)
* `collection.sync()` now rejects asynchronously when the specified remote is invalid (#540)
* `incoming-changes` hook now receives decoded records
* Remote deletion conflicts are now resolved with decoded records
* Last pull step in sync() only retrieves what was changed remotely while pushing local changes
* `importChanges()` method was changed and now accepts a list of records and a strategy string
* `pushChanges()` method was changed and now accepts a list of records
* the database is not scanned anymore when pushing conflicts resolutions

## 3.x to 4.x

* Deleted records are now decoded/encoded (#510)

## 2.x to 3.x

### cleanRecord()

The `cleanRecord()` function from the collection module was dropped. Since local fields can be defined at the collection level, a [`cleanLocalFields()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-cleanLocalFields) method was introduced instead.


### SyncResultObject

The format of updates and deletions in the `SyncResultObject` has changed.

* The `updated` list now contains a list of objects with `old` and `new` attributes
* The `deleted` list now contains the full old record instead of just a stripped object containing `id`

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
