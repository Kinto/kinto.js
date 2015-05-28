# Cliquetis

[![Build Status](https://travis-ci.org/mozilla-services/cliquetis.svg?branch=master)](https://travis-ci.org/mozilla-services/cliquetis)

A JavaScript client for [Cliquet](https://github.com/mozilla-services/cliquet/).

This is work in progress, and documented API isn't fully implemented just yet. Don't use it for serious things.

## Installation

    $ npm install

## Build

    $ npm run dist

## Usage

**Caution: everything in this section is still pure fiction.**

* Every operation is performed locally;
* Synchronization with server shall be ran explicitly.

### The `Cliquetis` constructor

```js
const db = new Cliquetis(options);
```

`options` is an object defining the following option values:

- `remote`: The remote Cliquet server endpoint root URL (eg. `"https://server/v1"`);
- `headers`: The default headers to pass for every HTTP request performed to the Cliquet server (eg. `{"Authorization": "Basic bWF0Og=="}`);
- `mode`: The conflict default resolution strategy (`Cliquet.SAFE` (*server wins*), `Cliquet.FORCE` (*client wins*)).

### Collection

Selecting a collection is done by calling the `collection()` method, passing it the resource name:

```js
const articles = db.collection("articles");
```

The collection object has the following attributes:

* **lastModified**: last synchronization timestamp, ``null`` if never sync'ed.

> Synchronization timestamps are persisted in the device local storage.

All operations are asynchronous and rely on [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).

### Creating a record

```js
articles.save({title: "foo"})
  .then(console.log.bind(console));
```

Result is:

```js
// result
{
  data: {
    id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
    title: "foo",
  }
}
```

> Records identifiers are generated locally using UUID4.

### Retrieving a single record

```js
articles.get("2dcd0e65-468c-4655-8015-30c8b3a1c8f8")
  .then(console.log.bind(console))
  .catch(console.error.bind(console));
```

Result:

```js
{
  data: [
    {
      id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
      title: "bar"
    }
  ]
}
```

**Note:** The promise will be rejected if no record is found for that id.

### Updating a record

```js
var existing = {
  id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
  title: "bar"
};

var updated = Object.assign(existing, {
  title: "baz"
});

articles.save(updated)
  .then(console.log.bind(console));
```

Result is:

```js
{
  data: {
    id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
    title: "baz",
    last_modified: 1432222889337
  }
}
```

### Deleting records

#### Single unique record passing its `id`:

```js
articles.delete("2dcd0e65-468c-4655-8015-30c8b3a1c8f8")
  .then(console.log.bind(console));
```

Result:

```js
{
  data: [
    {
      id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
      deleted: true,
    }
  ]
}
```

#### Multiple deletions using a query

```js
articles.delete({
  filter: {
    age: { $gte: 42 }
  }
}).then(console.log.bind(console));
```

### Listing records

```js
articles.list()
  .then(console.log.bind(console));
```

Result is:

```js
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
```

> Records with ``last_modified`` attribute were sync'ed on a server.

#### Filtering

```js
articles.list({
  filter: { unread: { $eq: true } }
}).then(console.log.bind(console));
```

#### Sorting

```js
articles.list({
  sort: ["-unread", "-added_on"]
}).then(console.log.bind(console));
```

#### Combining `sort` and `filter`

```js
articles.list({
  filter: { unread: { $eq: true } },
  sort: ["-added_on"]
}).then(console.log.bind(console));
```

### Clearing the collection

This will remove all existing records from the collection:

```js
articles.clear()
  .then(console.log.bind(console));
```

Result:

```js
{
  data: [],
  permissions: {}
}
```

### Fetching and publishing changes

Synchronizing local data with remote ones is performed by calling the `.sync()` method:

```js
articles.sync()
  .then(console.log.bind(console));
```

Note that you can override default options by passing it a new options object, Cliquetis will merge these new values with the default ones:

```js
articles.sync({mode: Cliquet.FORCE})
  .then(console.log.bind(console));
```

Result:

```js
{
  created:   [], // missing locally.
  updated:   [], // changed since last sync.
  deleted:   [], // deleted since last sync.
  conflicts: []  // changed both sides.
}
```

> If conflicts occured, they're listed in the `conflicts` array property; they must be resolved locally and `sync()` called again.

**Synchronization strategy**

TODO

- Fetch changes since last synchronization using `?_since`;
- Detect conflicts and apply changes if not any;
- Publish deletions of records;
- Publish creations records.

**Notes**

> During synchronization, records created locally are published on the server
> using ``PUT`` and the ``If-None-Match: *`` request header to prevent overwriting.

> Since fetching changes is paginated, it should be performed using `If-None-Match`
> header to prevent race-conditions.
> If a `412 Precondition failed` is received, synchronization is stopped,
> and nothing is performed. Note that this is not the case for batch operations.
> Another request with `?_since` will have be to sent in order to fetch information about
> changes that occured since pagination was initiated.
> ­­→ Not acceptable: whole sync is cancelled if another device creates a record
> meanwhile. Find something better (Think of a blamk device that should sync the
> whole collection).

> `404 Not Found` errors are ignored on `DELETE`.

> After a synchronization, the collection timestamp is updated.


Tests
-----

    $ npm run test

TDD mode:

    $ npm run tdd

License
-------

MPL.
