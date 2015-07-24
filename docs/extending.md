# Extending Kinto.js

## Custom database adapters

By default, Kinto.js performs all local persistence operations using IndexedDB; though if you want to create and use you own, that's definitely possible.

Simply create a class and extends from `Kinto.BaseAdapter`, which rather acts as an interface than anything else here:

```js
class MyAdapter extends Kinto.BaseAdapter {
  create(record) {
    …
  }

  update(record) {
    …
  }

  …
}

const kinto = new Kinto({adapter: MyAdapter});
```

`BaseAdapter` class [source code](https://github.com/mozilla-services/kinto.js/blob/master/src/adapters/base.js) to figure out what needs to be implemented exactly.
