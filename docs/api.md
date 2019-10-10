# API documentation

The detailed API documentation is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/). This page provides an abstract of it, aimed at making you immediately productive.

## The `Kinto` constructor

```js
const db = new Kinto(options);
```

`options` is an object defining the following option values:

- `remote`: The remote Kinto server endpoint root URL (eg. `"https://server/v1"`). Not that you *must* define a URL matching the version of the protocol the client supports, otherwise you'll get an error;
- `headers`: The default headers to pass for every HTTP request performed to the Kinto server (eg. `{"Authorization": "Basic bWF0Og=="}`);
- `retry`: Number of retries when the server fails to process the request (default: `1`)
- `adapter`: The persistence layer adapter to use for saving data locally (default: `Kinto.adapters.IDB`); if you plan on writing your own adapter, you can read more about how to do so in the [Extending Kinto.js](extending.md) section.
- `adapterOptions`: Any options that you would like to pass to your adapter. See the documentation for each adapter to see what options it supports.
- `requestMode`: The HTTP [CORS](https://fetch.spec.whatwg.org/#concept-request-mode) mode. Default: `cors`.
- `timeout`: The requests timeout in ms. Default: `5000`.
- `bucket`: The [Kinto bucket name](http://kinto.readthedocs.io/en/latest/api/buckets.html) to use for remote syncing (default: "default").

#### Adapter options

The default adapter (IndexedDB) supports the following options:

- `dbName`: the local database name (Default: `"KintoDB"`)
- `migrateOldData`: : whether data created with older versions than v12.X should be migrated (Default: `false`)

## Collections

By default, collections are persisted locally in [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

Selecting a collection is done by calling the `collection()` method, passing it the resource name:

```js
const articles = db.collection("articles");
```

The collection object has the following (read-only) attribute:

* **lastModified**: last synchronization timestamp, `null` if never sync'ed.

> #### Notes
>
> - A single dedicated database and store are created per collection;
> - All transactional operations are asynchronous and rely on [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).

## Creating a record

```js
await articles.create({title: "foo"});
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

> #### Notes
>
> - By default, records identifiers are generated locally using [UUID v4](https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_.28random.29);
but you can also define a [custom ID schema](#id-schemas));
> - Trying to create a record with the ID of a record that already exists is an error;
> - As deletions are [performed virtually by default](#deleting-records), attempting at creating a record reusing the id of a virtually deleted record will fail;
> - Detailed API documentation for `Collection#create()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-create).

## Retrieving a single record

```js
await articles.get("2dcd0e65-468c-4655-8015-30c8b3a1c8f8");
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

> #### Notes
>
> - The promise will be rejected if no record is found for that ID;
> - Detailed API documentation for `Collection#get()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-get).

## Retrieving a single record if present

```js
try {
  const article = await articles.getAny("2dcd0e65-468c-4655-8015-30c8b3a1c8f8");
  console.log(article);
} catch (err) {
  console.error(err);
}
```

Result:

```js
undefined
```

> #### Notes
>
> - This is a lower-level version of `get()` which does not fail if called on a missing or deleted record;
> - This might be useful for using Kinto as a plain key-value store, but otherwise you should probably use `get()`;
> - Detailed API documentation for `Collection#getAny()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-getAny).

## Updating a record

```js
const existing = {
  id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
  title: "bar"
};

const updated = {...existing, title: "baz"};

await articles.update(updated);
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

> #### Notes
>
> - An ID is required, otherwise the promise will be rejected;
> - If no record has this ID, or if the record with this ID was deleted, the promise will be rejected;
> - The `patch` option allows amending the existing record with passed data. By default this option is set to `false`, so existing records are overriden with passed data;
> - Detailed API documentation for `Collection#update()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-update).

## Upserting records

`upsert()` will create a record or replace the one that exists (equivalent to «put»).

```js
const existing = {
  id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f7",
  title: "bar"
};

await articles.upsert(existing);

const updated = {...existing, title: "baz"};

await articles.upsert(updated);
```

Result is:

```js
{
  data: {
    id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f7",
    title: "baz",
    last_modified: 1432222889337
  }
}
```

> #### Notes
>
> - An ID is required, otherwise the promise will be rejected;
> - If the record with this ID does not exist, or is deleted, a new one will be created;
> - If the record with this ID does exist, it will be updated;
> - This method may be useful when using Kinto as a key-value store;
> - Detailed API documentation for `Collection#upsert()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-upsert).

## Deleting records

By default, local deletion is performed *virtually*, until the collection is actually synced to the remote server.

```js
await articles.delete("2dcd0e65-468c-4655-8015-30c8b3a1c8f8");
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

> #### Notes
>
> - An ID is required, otherwise the promise will be rejected;
> - Virtual deletions aren't retrieved when calling [`#get()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-get) and [`#list()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-list);
> - Detailed API documentation for `Collection#delete()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-delete).

## Deleting records if present

```js
await articles.deleteAny("2dcd0e65-468c-4655-8015-30c8b3a1c8f7");
```

Result:

```js
{
  data: undefined
}
```

> #### Notes
>
> - An ID is required, otherwise the promise will be rejected;
> - If the record with this ID doesn't exist or is already deleted, this is a no-op;
> - Otherwise this will perform a virtual delete, as with `Collection#delete`;
> - Detailed API documentation for `Collection#deleteAny()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-deleteAny).

## Listing records

```js
await articles.list();
```

Result is:

```js
{
  data: [
    {
      id: "705b17be-e957-4c14-8f4c-86f8eaac29c0",
      title: "foo",
      rank: 2,
      _status: "created"
    },
    {
      id: "68e63131-3859-40cc-a4f7-b237ca179329",
      last_modified: 1432222889336,
      title: "Web page",
      rank: 3,
      _status: "synced"
    },
    {
      id: "86f8baac-4d12-4957-805c-8f4c17bc29c0",
      title: "Another page",
      rank: 1,
      _status: "created"
    },
  ]
}
```

### List filtering and ordering

The `#list()` method accepts an object argument allowing to define filters and ordering:

```js
await articles.list({filters: {_status: "created"}, order: "rank"});
```

Filters accepts an object where a key is the column name and the property value the pattern to filter the column with. For now this pattern can be either a single value or an array of values; in the latter case, results will contain all records having the filtered column value containing any of the provided ones:

```js
await articles.list({filters: {_status: ["created", "updated"]}});
```

> #### Notes
>
> - Records with `last_modified` attribute denote they've already been synced on a server.
> - By default, results are ordered by `last_modified` DESC.
> - Detailed API documentation for `Collection#list()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-list).

### Filtering

Records can be filtered using the `filters` parameter mentioning field names and their expected value:

```js
await articles.list({filters: {unread: true}});
```

> #### Notes
>
> - If several fields are specified, an implicit *and* is used.
> - As mentioned in the [limitations](limitations.md) section, until [local DB indices are implemented](https://github.com/Kinto/kinto.js/issues/66), the filter is performed in memory.


### Sorting

Records can be sorted using the `order` parameter:

```js
await articles.list({order: "-title"});
```

> #### Notes
>
> - Sorts according to a single field.
> - Prefix field name with `-` for descending order.
> - By default, the records are sorted on `last_modified` in descending order.
> - As mentioned in the [limitations](limitations.md) section, the sort is performed in memory.

## Importing a data dump locally

You may want to preload a dump of records from the server, before
actually starting the first sync with it.

The list of imported records is returned.

```js
const records = await articles.importBulk([
  {
    id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
    title: "baz",
    last_modified: 1432222889337
  }
]);
console.log(records);
```

> #### Notes
>
> - Existing records are replaced if they do not have more recent modifications.
> - Imported records won't be synced with the server.
> - The importation is optimized in a single database transaction.

## Clearing the collection

This will remove all existing records from the collection:

```js
await articles.clear();
```

Result:

```js
{
  data: [],
  permissions: {}
}
```

> #### Notes
>
> - Clearing the local collection will mark the collection as never synchronized;
> - Detailed API documentation for `Collection#clear()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-clear).

## Transactions

Kinto.js exposes a concept of a "local transaction", which guarantees
that a set of local operations will happen atomically -- that is, all
or nothing.

Note that these transactions are local to the browser, and they don't
go to the server. Other Kinto clients can make changes to the server
during your transaction, and those changes may still introduce
conflicts with the changes you've made as part of a transaction.

To initiate a transaction, call `Collection#execute()` like this:

```js
const articles = await articles.execute(txn => {
  let article1 = txn.get(id1);
  let article2 = txn.get(id2);
  return [article1, article2];
}, {preloadIds: [id1, id2]});

console.log(articles);
```

The `execute` function takes two arguments. The first is a function
that will be called with a transaction, and can perform operations on
it. These operations are synchronous and so don't produce
promises. The full list of operations is available
[here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~CollectionTransaction.html).

The second argument to `execute()` should include a set of record IDs
on which your transaction wants to operate. These IDs will be read at
the beginning of your transaction, and the corresponding records will
be made available to the transaction. Most operations, including even
`upsert()` and `delete()`, will require that you provide the relevant IDs.

Result:

```js
[
    {
      data: {
        id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f8",
        title: "foo",
      }
    },
    {
      data: {
        id: "2dcd0e65-468c-4655-8015-30c8b3a1c8f7",
        title: "bar",
      }
    }
]
```

## Authentication

Authenticating against a Kinto server can be achieved by adding an `Authorization` header to the request.

By default Kinto server supports Basic Auth authentication, but others mechanisms can be activated such as OAuth (eg. [Firefox Account](https://accounts.firefox.com/))

### Using Basic Auth

Simply provide an `Authorization` header option to the `Kinto` constructor:

```js
const username = "my_username";
const password = "my_password";
const kinto = new Kinto({
  remote: "https://my.server.tld/v1",
  headers: {
    Authorization: "Basic " + btoa(`${username}:${password}`)
  }
});
```

You can also provide this authentication header to [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync):

```js
await kinto.collection("articles")
  .sync({
    headers: {Authorization: "Basic " + btoa(`${username}:${password}`)}
  });
// ...
```

>#### Notes
>
> - You're not obliged to use the `username:password` format; basically whatever unique string gets you covered.

### Using an OAuth Bearer Token

As for Basic Auth, once you have retrieved a valid OAuth Bearer Token, simply pass it in an `Authorization` header:

```js
const kinto = new Kinto({
  remote: "https://my.server.tld/v1",
  headers: {
    Authorization: `Bearer ` + oauthBearerToken)
  }
});
```

As with Basic Auth, you can pass the header to [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) as well:

```js
await kinto.collection("articles")
  .sync({
    headers: {Authorization: "Basic " + oauthBearerToken}
  });
// ...
```

> #### Notes
>
> - Kinto also supports custom [Pyramid](http://docs.pylonsproject.org/projects/pyramid) authentication backends, though these must be obviously installed and configured at the server level.

## Fetching and publishing changes

Synchronizing local data with remote ones is performed by calling the [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) method.

![](images/sync-flow.png)

Synopsis:

1. Fetch remote changes since last synchronization;
2. Fail on any conflict encountered;
    - The developer has to handle them manually using [`#resolve()`](#resolving-conflicts-manually), and call [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) again when done;
3. If everything went fine, publish local changes;
    - Fail on any publication conflict detected;
        * If `strategy` is set to `Kinto.syncStrategy.SERVER_WINS`, no client data will overwrite the remote data;
        * If `strategy` is set to `Kinto.syncStrategy.CLIENT_WINS`, conflicting server records will be overwritten with local changes;
        * If `strategy` is set to `Kinto.syncStrategy.PULL_ONLY`, the local changes are never pushed, and overwritten by remote data;
        * If `strategy` is set to `Kinto.syncStrategy.MANUAL`, both incoming and outgoing conflicts will be reported in a dedicated array.

```js
try {
  const result = await articles.sync();
  console.log(result);
} catch (err) {
  if (err.response && err.response.status === 401) {
    console.error('HTTP status code indicates auth problem');
  }
}
```

> #### Notes
> - By default, it uses the collection name as the collection id on the remove server. A different name can be specified in `sync()` options.
> - Detailed API documentation for `Collection#sync()` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync).

### Error handling

If anything goes wrong during sync, `collection.sync()` will reject its promise with an `error` object, as follows:

* If an unexpected HTTP status is received from the server, `error.response` will contain that response, for you to inspect
    (see the example above for detecting 401 Unauthorized errors).
* If the server is unreachable, `error.response` will be undefined, but `error.message` will equal
    `'HTTP 0; TypeError: NetworkError when attempting to fetch resource.'`.

### Synchronization strategies

For publication conflicts, the `sync()` method accepts a `strategy` option, which itself accepts the following values:

- `Kinto.syncStrategy.MANUAL` (default): Conflicts are reflected in a `conflicts` array as a result, and need to be resolved manually;
- `Kinto.syncStrategy.SERVER_WINS`: Server data will always be preserved;
- `Kinto.syncStrategy.CLIENT_WINS`: Client data will always be preserved.
- `Kinto.syncStrategy.PULL_ONLY`: Server data will always be preserved and local data never pushed.

> Note:
> `strategy` only applies to *outgoing* conflicts. *Incoming* conflicts will still
> be reported in the `conflicts` array. See [`resolving conflicts section`](#resolving-conflicts-manually).

You can override default options by passing [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) a new `options` object; Kinto.js will merge these new values with the default ones:

```js
import Collection from "kinto/lib/collection";

try {
  const result = await articles.sync({
    strategy: Kinto.syncStrategy.CLIENT_WINS,
    remote: "https://alt.server.tld/v1",
    headers: {Authorization: "Basic bWF0Og=="},
    retry: 3
  });
  console.log(result);
} catch (error) {
  console.error(error);
}
```

## The synchronization result object

When the [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) promise is fulfilled, a [`SyncResultObject`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~SyncResultObject.html) is returned, providing information about the performed operations.

Here's a sample result object:

```js
{
  ok: true,
  lastModified: 1434270764485,
  conflicts: [],
  errors:    [],
  created:   [],
  updated:   [],
  deleted:   [],
  skipped:   [],
  published: [],
  resolved:  [],
}
```

The synchronization result object exposes the following properties:

- `ok`: The boolean status of the synchronization operation; `true` if no unresolved conflicts and no errors were encountered.
- `lastModified`: The timestamp of the latest known successful synchronization operation (no error and no conflict encountered).
- `conflicts`: The list of unresolved conflicts encountered during both import and export operations (see *[Resolving conflicts manually](#resolving-conflicts-manually)*);
- `errors`:    The list of encountered errors, if any. Each error has a `type` property, which value can either be `incoming` or `outgoing` depending on which part of the sync flow it's been caught from;
- `created`:   The list of remote records which have been successfully imported into the local database.
- `updated`:   The list of updates with old and new record which have been successfully reflected into the local database.
- `deleted`:   The list of remotely deleted records which have been successfully deleted as well locally.
- `skipped`:   The list of remotely deleted records that were missing or also deleted locally.
- `published`: The list of locally modified records (created, updated, or deleted) which have been successfully pushed to the remote server.
- `resolved`:  The list of resolutions produced by applying the selected [strategy](#synchronization-strategies) as {accepted, rejected} objects (note that when using the default `MANUAL` strategy, this list is always empty).

> #### Notes
> - Detailed API documentation for `SyncResultObject` is available [here](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~SyncResultObject.html).

## Resolving conflicts manually

When using `Kinto.syncStrategy.MANUAL`, if conflicts occur, they're listed in the `conflicts` property; they must be resolved locally and `sync()` called again.

The `conflicts` array is in this form:

```js
{
  // …
  conflicts: [
    {
      type: "incoming", // can also be "outgoing" if stategy is MANUAL
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

Once the developer is done with merging records, conflicts are marked as
resolved using the [`#resolve()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-resolve) method of the collection:

```js
async function sync() {
  try {
    const res = await articles.sync();

    if (res.ok) {
      return res;
    }

    // If conflicts, take remote version and sync again.
    await Promise.all(res.conflicts.map(conflict => {
      return articles.resolve(conflict, conflict.remote);
    }))

    return sync();
  } catch (error) {
    console.error(error);
  }
}
```

Here we're solving encountered conflicts by picking all remote versions. After conflicts being properly addressed, we're syncing the collection again, until no conflicts occur.

## Local fields

By default, kinto.js sends every record attribute stored locally.

In order to store some field only locally, and never publish them to the server, you can provide a list of field names in the `localFields` option of `Kinto#collection`:

```js
const collection = kinto.collection("articles", {
  localFields: ["captain", "age"]
});
```

A [`#cleanLocalFields()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-cleanLocalFields) method is available to clean a record from the local fields:

```js
stripped = collection.cleanLocalFields(record);
```

## Collection Metadata

During synchronization, the collection metadata is fetched and stored in storage. It can be accessed with the ``.metadata()`` method.

```js
const collection = kinto.collection("articles");
await collection.sync();

const metadata = collection.metadata();
```

The result is:

```js
{
  id: "articles",
  last_modified: 124768977,
  displayFields: ["title"]
}
```

## Raw HTTP calls

Every CRUD operations are performed locally using the *database adapter* and the HTTP calls to the remote API are performed automatically during *synchronization*.

However, in some situations — like setting permissions on objects or checking server capabilities — it may be useful to interact with the remote API manually.

A [kinto-http.js instance](https://github.com/Kinto/kinto-http.js) is available on the Kinto object:

```js
const kinto = new Kinto({
  remote: "https://my.server.tld/v1",
  headers: {
    Authorization: `Bearer ` + oauthBearerToken)
  }
});

const { data } = await kinto.api.listBuckets();
// ...
```

On a collection, the `api` instance must be set to a bucket and a collection name:

```js
const kinto = new Kinto({
  bucket: "blog"
});
const collection = kinto.collection("articles");

// List records from "articles" collection in "blog" bucket:
const { data } = await collection.api
  .bucket(collection.bucket)
  .collection(collection.name)
  .listRecords();
// ...
```


## The case of a new/flushed server

In case a pristine or [flushed](http://kinto.readthedocs.io/en/latest/configuration/settings.html?highlight=flush#activating-the-flush-endpoint) server is used against an existing local database, [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) will reject with a *«Server has been flushed»* error. That means the remote server doesn't hold any data, while your local database is marked as synchronized and probably contains records you don't want to lose.

So instead of wiping your local database to reflect this new remote state, you're notified about the situation with a proper error :) You'll most likely want to republish your local database to the server; this is very easy to achieve by calling [`#resetSyncStatus()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-resetSyncStatus), then [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) again:

```js
try {
  const result = await articles.sync();
  console.log(result);
} catch (err) {
  if (err.message.includes("flushed")) {
    await articles.resetSyncStatus();
    return articles.sync();
  }
  throw err;
}
```

## Handling server backoff

If the Kinto server instance is under heavy load or maintenance, their admins can [send a Backoff header](http://kinto.readthedocs.io/en/stable/core/api/backoff.html) and it's the responsibily for clients to hold on performing more requests for a given amount of time, expressed in seconds.

When this happens, Kinto.js will reject calls to [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) with an appropriate error message specifying the number of seconds you need to wait before calling it again.

While not necessarily recommended, if you ever want to bypass this restriction, you can pass the `ignoreBackoff` option set to `true`:

```js
await articles.sync({ignoreBackoff: true});
// ...
```

## Events

### `Kinto` instance

Using the `events` on a `Kinto` instance property you can subscribe public events from. That `events` property implements nodejs' [EventEmitter interface](https://nodejs.org/api/events.html#events_class_events_eventemitter).


#### The `sync:success` and `sync:error` events

Triggered on [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) call, whether it succeeds or not.


#### The `retry-after` event

Triggered when a `Retry-After` HTTP header has been received from the last received response from the server, meaning clients should retry the same request after the specified amount of time.

> Note: With *kinto-http.js* 2.7 and above, the requests are transparently retried. This event is thus only useful for tracking such situations.


#### The `backoff` event

Triggered when a `Backoff` HTTP header has been received from the last received response from the server, meaning clients should hold on performing further requests during a given amount of time.

The `backoff` event notifies what's the backoff release timestamp you should wait until before performing another [`#sync()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-sync) call:

```js
const kinto = new Kinto();

kinto.events.on("backoff", releaseTime => {
  const releaseDate = new Date(releaseTime).toLocaleString();
  alert(`Backed off; wait until ${releaseDate} to retry`);
});
```

#### The `deprecated` event

Triggered when an `Alert` HTTP header is received from the server, meaning that a feature has been deprecated; the `event` argument received by the event listener contains the following deprecation information:

- `type`: The type of deprecation, which in ou case is always `soft-eol` (`hard-eol` alerts trigger an `HTTP 410 Gone` error);
- `message`: The deprecation alert message;
- `url`: The URL you can get information about the related deprecation policy.

```js
const kinto = new Kinto();

kinto.events.on("deprecated", event => {
  console.log(event.message);
});
```

### `Collection` instance

#### Change event

Triggered when a successful operation was executed. Only one is sent per transaction.

The `event` argument contains the following information:

- `targets`: a list of mappings with an `action` attribute and the other attributes of the respective event as described below.

```js
const kinto = new Kinto();
const articles = kinto.collection("articles");

articles.events.on("change", event => {
  const first = event.targets[0];
  console.log(first.action);
  console.log(first.data.id);
});

articles.delete(recordId);
```

#### Per action event

Atomic events are sent for ``create``, ``update`` and ``delete``.

Every event contains the following attributes:

- ``data``: the record that was created, updated or deleted

The ``update`` event contains an additional attribute:

- ``oldRecord``: the previous version of the updated record.


```js
const kinto = new Kinto();
const articles = kinto.collection("articles");

articles.events.on("update", event => {
  console.log(`Title was changed from "${event.oldRecord.title}" to "${event.data.title}"`);
});

articles.upsert({id, title: "Holà!"});
```

> #### Notes
>
> - The `upsert()` method will fire either a `create` or an `update` event;
> - The `deleteAny()` does not fire any event if the record does not exist;
> - A transaction will fire as many atomic events as executed operations.


## Transformers

Transformers are basically hooks for encoding and decoding records, which can work synchronously or asynchronously.

For now, only *remote transformers* and *hooks* have been implemented, but there are plans to implement local transformers in a next version.

### Remote transformers

Remote transformers aim at encoding records before pushing them to the remote server, and decoding them back when pulling changes. Remote transformers are registered through the optional second argument of `Kinto#collection()`, which accepts a list of transformer objects in its `remoteTransformers` array.

A transformer object is basically an object literal having and `encode` and a `decode` method, both accepting a `record` object and returning that record transformed, or a Promise resolving with that record transformed:

```js
import Kinto from "kinto";

const update = (obj1, obj2) => ({ ...obj1, ...obj2 });

const exclamationMarkTransformer = {
  encode(record) {
    return update(record, {title: record.title + "!"});
  },

  decode(record) {
    return update(record, {title: record.title.slice(0, -1)});
  }
};

const kinto = new Kinto({remote: "https://my.server.tld/v1"});
const coll = kinto.collection("articles", {
  remoteTransformers: [ exclamationMarkTransformer ]
});
```

> #### Notes
>
> - The `decode` method should be the strict reverse version of `encode`;
> - Your transformer will be called even on deleted records, so be sure to handle those correctly in both encoding and decoding;
> - Most transformers should pass `id` and `last_modified` through unaltered, since they are used in syncing;
> - If you do alter `id` or `last_modified`, be careful, since this can interfere with syncing;
> - While this example transformer returns the modified record synchronously, you can also use promises to make it asynchronous — see [dedicated section](#async-transformers).

Calling `coll.sync()` here will store encoded records on the server; when pulling for changes, the client will decode remote data before importing them, so you're always guaranteed to have the local database containing data in clear:

```js
await coll.create({title: "foo"});
await coll.sync();
// remotely saved:
// {id: "125b3bff-e80f-4823-8b8f-bfae10bfc3e8", title: "foo!"}
// locally saved:
// {id: "125b3bff-e80f-4823-8b8f-bfae10bfc3e8", title: "foo"}
```

> #### Notes
>
> This mechanism is especially useful for implementing a cryptographic layer, to ensure remote data are stored in a secure fashion. Kinto.js will provide one in a near future.

Normally, a record that is deleted locally will be deleted remotely, and a record that is not deleted locally will not be deleted remotely. However, with a remote transformer, it's possible to change this. The records given to `encode()` have a `_status` field which represents their local status (`synced`, `created`, `updated`, or `deleted`); by turning a `deleted` into a `created` or `updated`, or by turning a `created` or `updated` into a `deleted`, you can control what happens to the remote record. Similarly, the records given to `decode()` have a `deleted` field, which is true if the record was deleted on the remote end; by turning `true` to `false` or `false` to `true`, you can control what happens to the local version of this record.

Here's an example (taken from `integration_test.js`):

```javascript
const transformer = {
  encode(record) {
    if (record._status == "deleted") {
      if (record.title.includes("preserve-on-send")) {
        if (record.last_modified) {
          return {...record, _status: "updated", wasDeleted: true};
        }
        return {...record, _status: "created", wasDeleted: true};
      }
    }
    return record;
  },
  decode(record) {
    // Records that were deleted locally get pushed to the
    // server with `wasDeleted` so that we know they're
    // supposed to be deleted on the client.
    if (record.wasDeleted) {
      return {...record, deleted: true};
    }
    return record;
  }
};
```

This transformer will turn locally-deleted records with a title that contains the phrase "preserve-on-send" into remotely-kept records, and vice versa.

In order for this to work:

- Records with `_status` of `"deleted"` must turn into `"updated"` or `"created"`. You should turn records with `last_modified` fields into `updated` records, and those without into `created` records, so that concurrency control with `If-Match` and `If-None-Match` works correctly.
- If `record._status == "deleted"`, then `decode(encode(record)).deleted` must be `true`. In other words, if the record was locally deleted, it should be marked as "to be deleted" when it gets decoded from the remote end. In this example, this is accomplished by using another field, `wasDeleted`, to store whether the record was originally deleted.

There are two possible transformations like this: local deletes become remote keeps, or local keeps become remote deletes. Remote deletes cause Kinto to delete the record, and subsequently Kinto will only serve a tombstone which doesn't have any information besides an ID and a "deleted" flag. Because decoding anything useful out of a tombstone is impossible, we don't support transforming local keeps into remote deletes.

> #### Notes
> - Once a local delete is "sent", the locally-deleted record will be deleted for real, so you can't really keep information in a locally deleted record.
> - This feature might be useful to avoid "leaking" the fact that a record was deleted in an encryption scheme.

### Local transformers

In a near future, Kinto.js will provide transfomers aimed at providing facilities to encode and decode records when persisted locally.

### Async transformers

Transformers can also work asynchronously by returning a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise):

```js
const exclamationMarkTransformer = {
  encode(record) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(update(record, {title: record.title + "!"}));
      }, 10);
    });
  },

  decode(record) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(update(record, {title: record.title.slice(0, -1)}));
      }, 10);
    });
  }
};

const coll = kinto.collection("articles", {
  remoteTransformers: [ exclamationMarkTransformer ]
});
```

### Multiple transformers

The remoteTransformers field of the options object passed to `Kinto#collection` is an Array. That means you can chain multiple encoding operations, with the decoding ones being processed in the reverse order:

```js
function createTitleCharTransformer(char) {
  encode(record) {
    return update(record, {title: record.title + char});
  },

  decode(record) {
    return update(record, {title: record.title.slice(0, -1)});
  }
}

const coll = kinto.collection("articles", {
  remoteTransformers: [
    createTitleCharTransformer("!"),
    createTitleCharTransformer("?")
  ]
});

await coll.create({title: "foo"});
coll.sync();
// remotely saved:
// {id: "125b3bff-e80f-4823-8b8f-bfae10bfc3e8", title: "foo!?"}
// locally saved:
// {id: "125b3bff-e80f-4823-8b8f-bfae10bfc3e8", title: "foo"}
```

### Limitations

There's currently no way to deal with adding transformers to an already filled remote database; that would mean remote data migrations, and both Kinto and Kinto.js don't provide this feature just yet.

**As a rule of thumb, you should only start using transformers on an empty remote collection.**

## Custom ID generation using an ID schema

By default, kinto.js uses [UUID4](https://en.wikipedia.org/wiki/Universally_unique_identifier) strings for record ID's. If you want to work with an existing body of data, this may not be what you want.

You can define a custom ID schema on a collection by passing it to `Kinto#collection`:

```js
import Kinto from "kinto";

const createIntegerIdSchema = () => ({
  generate() {
    return _next++;
  },

  validate(id) {
    return (typeof id == "number");
  }
});

const kinto = new Kinto({remote: "https://my.server.tld/v1"});
const coll = kinto.collection("articles", {
  idSchema: createIntegerIdSchema()
});
```

The `generate` function can also optionally accept the record being created as an argument, allowing you to use any or all of the data to generate an ID.

```js
const urlBase64IdSchema = () => ({
    generate(record) {
      return btoa(record.url);
    },

    validate(id) {
      return !!atob(id).match("http");
    }
});
```

> #### Notes
>
> - The `generate` method should generate unique ID's;
> - The `validate` method should return a boolean, where `true` means valid.
> - In a real application, you want to make sure you do not generate twice the same record ID on a collection. This dummy example doesn't take care of ID unicity. In case of ID conflict you may loose data.

For ids chosen by your application (like "config", "last-save", etc.), you'll want a NOP id generator:
```js
const nopSchema = {
    generate() {
        throw new Error("can't generate keys");
    },
    validate(id) {
        return true;
    }
};
const kinto = new Kinto({remote: "https://my.server.tld/v1"});
coll = kinto.collection("articles", {
  idSchema: nopSchema
});
```

Kinto.js will then refuse to create documents without an `id` field, and accept any provided id.

### Limitations

There's currently no way to deal with changing the ID schema of an already filled local database; that would mean existing records would fail the new validation check, and can no longer be updated.

**As a rule of thumb, you should only start using a custom ID schema on an empty remote collection.**
