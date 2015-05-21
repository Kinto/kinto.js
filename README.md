Cliquetis
=========

[![Build Status](https://travis-ci.org/mozilla-services/cliquetis.svg?branch=master)](https://travis-ci.org/mozilla-services/cliquetis)

A JavaScript client for [Cliquet](https://github.com/mozilla-services/cliquet/).

Installation
------------

    $ npm install

Build
-----

    $ npm run dist

Usage
-----

**Caution: everything in this section is still pure fiction.**

* Every operation is performed locally;
* Synchronization with server shall be ran explicitly.

### Collection

```js

  import Cliquetis from "cliquet";

  var db = new Cliquetis();
  var articles = db.collection('articles');

```

The collection object has the following attributes:

* **last_modified**: last synchronization timestamp, ``undefined`` if never sync'ed.

> Synchronization timestamps are persisted in the device local storage.


### List records

```js

  articles.all().then(result => {
    {
      data: [
        {
          id: "705b17be-e957-4c14-8f4c-86f8eaac29c0",
          title: "foo"
        },
        {
          id: "68e63131-3859-40cc-a4f7-b237ca179329",
          last_modified: 1432222889336,
          title: "Web page"
        },
      ]
    }
  });

```

> Records with ``last_modified`` attribute were sync'ed on a server.


### Create records

```js

  articles.save({title: "foo"}).then(result => {
    data: {
      id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
      title: "foo",
    }
  });

```

> Records identifiers are generated locally using UUID4.


### Update records

```js

  var existing = {
    id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
    title: "bar"
  };

  articles.save(existing).then(result => {
    data: {
      id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
      title: "bar",
    }
  });

```

### Delete records

```js

articles.delete({
    selector: {
      age: {'$min': 42}
    }
  }).
  then(result => {
    data: [
      {
        id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
        deleted: true,
      }
    ]
  });

```

A shortcut for ``articles.delete({id: {'$eq': id}})`` is available at ``articles.delete(id)``.



### Filter records

```js

articles.all({
    selector: {
      title: {'$eq': 'foo'}
    }
  }).
  then(result => {
    data: [
      …
    ]
  });

```

A shortcut for ``articles.all({id: {'$eq': id}})`` is available at ``articles.get(id)``.


**Sorting**

```js

articles.all({
    sort: [{added_on: 'desc'}]
  }).
  then(result => {
    data: [
      …
    ]
  });

```


### Fetch and publish changes

```js

var options = {
  remote: "https://server/v1/{}/records",
  headers: {
    "Authorization": "Basic bWF0Og=="
  },
  mode: Cliquet.SAFE,
};

articles.sync(options).then(result => {
    {
      ok: true,
      created: [],  // missing locally.
      updated: [],  // changed since last sync.
      deleted: [],  // deleted since last sync.
      conflicts: []  // changed both sides.
    }
});

```

> If ``ok`` is ``false``, the list of conflicting records will be provided in
> ``conflicts`` attribute.
>
> Conflicts must be resolved locally and ``sync()`` called again.


**Options**

* **remote**: Server URI with placeholder for collection name
* **headers**: HTTP headers (*authentication*)
* **mode**: ``Cliquet.SAFE`` (*server wins*), ``Cliquet.FORCE`` (*client wins*)

**Synchronization strategy**

# Fetch changes since last synchronization using ``?_since``;
# Detect conflicts and apply changes if not any;
# Publish deletions of records;
# Publish creations records.

**Notes**

> During synchronization, records created locally are published on the server
> using ``PUT`` and the ``If-None-Match: *`` request header to prevent overwriting.

> Since fetching changes is paginated, it should be performed using ``If-None-Match``
> header to prevent race-conditions.
> If a ``412 Precondition failed`` is received, synchronization is stopped,
> and nothing is performed.
> Another request with ``?_since`` will have to sent in order to fetch information about
> changes that occured since pagination was initiated.
> ­­→ Not acceptable: whole sync is cancelled if another device creates a record
> meanwhile. Find something better (Think of a blamk device that should sync the
> whole collection).

> ``404 Not Found`` errors are ignored on ``DELETE``.

> After a synchronization, the collection timestamp is updated.


Tests
-----

    $ npm run test

TDD mode:

    $ npm run tdd

License
-------

MPL.
