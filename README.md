# Cliquetis

[![Build Status](https://travis-ci.org/mozilla-services/cliquetis.svg?branch=master)](https://travis-ci.org/mozilla-services/cliquetis) [![Coverage Status](https://coveralls.io/repos/mozilla-services/cliquetis/badge.svg)](https://coveralls.io/r/mozilla-services/cliquetis)

A JavaScript client for [Cliquet](https://github.com/mozilla-services/cliquet/).

This is work in progress, and documented API isn't fully implemented just yet. Don't use it for serious things.

## Installation

    $ npm install

## Build

    $ npm run dist

## Usage

* Every operation is performed locally;
* Synchronization with server shall be ran explicitly.

### The `Cliquetis` constructor

```js
const db = new Cliquetis(options);
```

`options` is an object defining the following option values:

- `remote`: The remote Cliquet server endpoint root URL (eg. `"https://server/v1"`);
- `headers`: The default headers to pass for every HTTP request performed to the Cliquet server (eg. `{"Authorization": "Basic bWF0Og=="}`);
- `mode`: The conflict default resolution strategy (`Collection.strategy.SERVER_WINS`, `Collection.strategy.CLIENT_WINS` or `Collection.strategy.MANUAL` (default)

### Collection

Collection are persisted in indexedDB.

**Note:** A single database and store is created per collection.

**Status:** Implemented.

Selecting a collection is done by calling the `collection()` method, passing it the resource name:

```js
const articles = db.collection("articles");
```

The collection object has the following (read-only) attribute:

* **lastModified**: last synchronization timestamp, `null` if never sync'ed.

> Synchronization timestamps are persisted in the device local storage. **Status:** Not implemented.

All operations are asynchronous and rely on [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).

### Creating a record

**Status:** Implemented.

```js
articles.create({title: "foo"})
  .then(console.log.bind(console))
  .catch(console.error.bind(console));
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

**Status:** Implemented.

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

**Status:** Implemented.

```js
var existing = {
  id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
  title: "bar"
};

var updated = Object.assign(existing, {
  title: "baz"
});

articles.update(updated)
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

**Status:** Implemented.

By default, local deletion is performed *virtually*, until the collection is actually synced to the remote server.

Virtual deletions aren't retrieved when calling `#get()` and `#list()`.

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
      title: "foo",
      _status: "deleted"
    }
  ]
}
```

#### Multiple deletions using a query

**Status:** Not implemented.

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

> Records with `last_modified` attribute were sync'ed on a server.

#### Filtering

**Status:** Not implemented.

```js
articles.list({
  filter: { unread: { $eq: true } }
}).then(console.log.bind(console));
```

#### Sorting

**Status:** Not implemented.

```js
articles.list({
  sort: ["-unread", "-added_on"]
}).then(console.log.bind(console));
```

#### Combining `sort` and `filter`

**Status:** Not implemented.

```js
articles.list({
  filter: { unread: { $eq: true } },
  sort: ["-added_on"]
}).then(console.log.bind(console));
```

### Clearing the collection

**Status:** Implemented.

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

**Status:** Partially implemented.

Synchronizing local data with remote ones is performed by calling the `.sync()` method.

Synopsis:

1. Fetch remote changes since last synchronization;
2. Fail on any conflict detected;
  * The developer has to handle them manually, and call `sync ()` again when done;
3. If everything went fine, publish local changes;
4. Fail on any publication conflict detected;
  * If `mode` is set to `Collection.strategy.SERVER_WINS`, no remote data override will be performed by the server;
  * If `mode` is set to `Collection.strategy.CLIENT_WINS`, conflicting server records will be overriden with local changes;
  * If `mode` is set to `Collection.strategy.MANUAL`, conflicts will be reported in a dedicated array.

**Note:** On any rejection, `sync()` should be called again once conflicts are properly handled.

```js
articles.sync()
  .then(console.log.bind(console))
  .catch(console.error.bind(console));
```

**Note:** You can override default options by passing `sync()` a new `options` object; Cliquetis will merge these new values with the default ones:

```js
articles.sync({mode: Collection.strategy.CLIENT_WINS})
  .then(console.log.bind(console));
  .catch(console.error.bind(console));
```

Sample result:

```js
{
  ok: true,
  lastModified: 1434270764485,
  errors:    [], // Errors encountered, if any
  created:   [], // Created locally
  updated:   [], // Updated locally
  deleted:   [], // Deleted locally
  conflicts: [], // Import conflicts
  skipped:   [], // Skipped imports
  published: [], // Successfully published
  conflicts: []  // Export conflicts
}
```

If conflicts occured, they're listed in the `conflicts` property; they must be resolved locally and `sync()` called again.

The `conflicts` array is in this form:

```js
{
  // …
  conflicts: [
    {
      type: "incoming", // can also be "outgoing"
      local: {
        _status: "created",
        id: "233a018a-fd2b-4d39-ba85-8bf3e13d73ec",
        title: "local title",
      },
      remote: {
        id: "233a018a-fd2b-4d39-ba85-8bf3e13d73ec",
        title: "remote title",
      }
    }
  ]
}
```

### Synchronization strategies

The `sync()` method accepts a `mode` option, which accepts the following values:

- `Collection.strategy.MANUAL` (default): Conflicts are reflected in a `conflicts` array as a result, and need to be resolved manually.
- `Collection.strategy.SERVER_WINS`: Server data will be preserved;
- `Collection.strategy.CLIENT_WINS`: Client data will be preserved.

**Notes**

> During synchronization, records created locally are published on the server
> using `PUT` and the `If-None-Match: *` request header to prevent overwriting.

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

    $ npm test

Note: this will also run code coverage and send the report to [Coveralls](http://coveralls.io/). Alternatives:

    $ npm run test-nocover    # runs tests skipping code coverage.
    $ npm run test-cover      # runs tests, code coverage; doesn't send results.
    $ npm run test-cover-html # runs tests, code coverage and opens a fancy html report.

Note that code coverage reports are also [browseable on Coveralls](https://coveralls.io/r/mozilla-services/cliquetis).

### TDD mode

This command will watch for changes on the js source files then rerun the tests:

    $ npm run tdd

Note that it won't perform code coverage analysis.

You can also grep to run a subset of tests that way:

    $ npm run tdd -- -g Api # only runs Api-related tests

License
-------

MPL.
