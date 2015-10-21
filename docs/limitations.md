# Current known limitations

## Intended limitations

### No revision tree

Kinto.js doesn't track modification history in a form of a revision tree. Instead, it provides information about what eventually changed since the last time you asked, and only that.

This allows covering most synchronization use cases, while being super-lightweight implementation wise.

You can read more about Kinto features [here](http://kinto.readthedocs.org).

### No automatic confict handling

Kinto.js won't try to outsmart you as a conflict resolver. Instead, it provides very explicit ways to know about conflicts, and [simple helpers to handle them](api.md#resolving-conflicts).

## Transactions

Ideally, we should wrap the whole synchronization flow related operations within a single transaction. While that's a goal and [part of our roadmap](https://github.com/Kinto/kinto.js/issues/16), right now this isn't implemented.

That means if anything fails during the sync flow while some records have already been processed locally, there won't be any rollback performed — and you'll have to handle the situation by hand.

Fortunately, as in theory records don't carry any relations information, usually that's simply matter of calling `#sync()` again once you've addressed the reported issues.

### Take away →

> *If you don't emulate relations in your data schemas, you're safe.*

## Concurrency

As all local persistence operations are asynchronous, there might be situations where race conditions may occur.

For example, if you're displaying a form for the user to update a record, and in the meanwhile that record is updated from a ServiceWorker, you might just save an obsolete/conflicting version of the record, overriding the last know valid one by "mistake".

This is a [known issue](https://github.com/Kinto/kinto.js/issues/34) and we're in the process of finding a decent situation to handle these smoothly.

### Take away →

> *Pay high attention to race conditions when saving records in your app async flows.*

## In-memory filtering/ordering

All the collection ordering and filtering is done in-memory; that means Kinto.js first loads a whole collection in memory, then process it, meaning you can easily get high-memory usage and degraded performances on very large datasets.

### Take away →

> *Don't use Kinto.js for very large datasets.*

## Custom schema fields are not indexed yet

For now only a few standard fields are indexed by default in IndexedDB collection schemas, resulting in possible degraded performances when filtering & ordering collections. We'll add [custom indexes capability](https://github.com/Kinto/kinto.js/issues/66) in a near future, though.

### Take away →

> *Seriously, don't use Kinto.js for very large datasets.*

## Future plans

Here's what's planned for future versions, outside of fixing the known limitations listed above:

- Adding a **client-side crypto layer** to the API in order to bring secure & privacy-safe remote storage of user data;
- Adding support for [**sharing & permissions**](http://kinto.readthedocs.org/en/latest/api/permissions.html);
- Allowing to use **other local storage backend than IndexedDB** (localStorage, WebSQL) in the form of alternative drivers/adapters;
- Providing an **admin Web UI** allowing easy management of your Kinto buckets and collections.

These are really higher goals, so feedback and help are [warmly welcome](hacking.md)!
