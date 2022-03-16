# Kinto HTTP Client

`kinto` comes with a fully-featured Kinto HTTP client that powers all interactions with a Kinto instance.

## Requirements

- Kinto server v6.0.0+

## Installation

In the browser, you can load prebuilt scripts hosted on unpkg:

- [kinto.min.js](https://unpkg.com/kinto/dist/kinto.min.js)

```html
<script src="https://unpkg.com/kinto/dist/kinto.min.js"></script>
```

From npm:

```
$ npm install kinto --save
```

**Note:** If you plan to use the HTTP client from `kinto` in Node (as opposed to the browser), you'll also need to install polyfills for `fetch`, `FormData`, and `btoa`.

```
$ npm install node-fetch form-data btoa
```

Then (ES6):

```js
import { KintoClient } from "kinto";
```

Or (ES5):

```js
var { KintoClient } = require("kinto");
```

Note that this HTTP client can be transparently used server side or in a regular browser page. In the browser, creating an instance is achieved with the following:

```js
const client = new KintoClient("http://");
```

## Changelog

See [upgrading docs](#upgrading) and the full [detailed changelog on Github](https://github.com/Kinto/kinto.js/releases).

## Usage

A client instance is created using the `KintoClient` constructor, passing it the remote Kinto server root URL, including the version:

```js
const client = new KintoClient("https://demo.kinto-storage.org/v1");
```

#### Options

- `safe`: Adds concurrency headers to every requests. (default: `false`)
- `events`: The events handler. If none provided an `EventEmitter` instance will be created
- `headers`: The key-value headers to pass to each request. (default: `{}`)
- `retry`: Number of retries to make when the server responds with a `Retry-After` response. (default: `0`)
- `bucket`: The default bucket to use. (default: `"default"`)
- `requestMode`: The HTTP [CORS](https://fetch.spec.whatwg.org/#concept-request-mode) mode. (default: `"cors"`)
- `timeout`: The requests timeout in milliseconds. (default: `null`, which means "no timeout")

## Authentication

Authenticating against a Kinto server can be achieved by adding an `Authorization` header to the request.

By default Kinto server supports Basic Auth authentication, but others mechanisms can be activated such as OAuth (eg. [Firefox Account](https://accounts.firefox.com/))

### Using Basic Auth

Simply provide an `Authorization` header option to the `Kinto` constructor:

```js
const secretString = `${username}:${password}`;
const kinto = new KintoClient("https://my.server.tld/v1", {
  headers: {
    Authorization: "Basic " + btoa(secretString),
  },
});
```

> #### Notes
>
> - As explained in the [server docs](http://kinto.readthedocs.io/en/stable/api/1.x/authentication.html#basic-auth), any string is accepted. You're not obliged to use the `username:password` format.

### Using an OAuth Bearer Token

As for Basic Auth, once you have retrieved a valid OAuth Bearer Token, simply pass it in an `Authorization` header:

```js
const kinto = new KintoClient("https://my.server.tld/v1", {
  headers: {
    Authorization: `Bearer ` + oauthBearerToken)
  }
});
```

### Change headers

Requests headers can be altered using `setHeaders()`.

```js
const kinto = new KintoClient("https://my.server.tld/v1");

// Login somewhere...
// [...]

kinto.setHeaders({
  Authorization: `Bearer ` + accessToken,
});
```

## Server information

A Kinto server exposes some of its internal settings, information about authenticated user, the HTTP API version and the API capabilities (e.g. plugins).

```js
const info = await client.fetchServerInfo([options]);
```

Sample result:

```js
{
    "project_name": "kinto",
    "project_version": "3.0.2",
    "url": "http://0.0.0.0:8889/v1/",
    "project_docs": "https://kinto.readthedocs.io/",
    "http_api_version": "1.6",
    "settings": {
        "batch_max_requests": 25,
        "readonly": false
    },
    "user": {
        "bucket": "2f9b1aaa-552d-48e8-1b78-371dd08688b3",
        "id": "basicauth:f505765817a6b4ea46278be0620ddedd83b10f71f7695683719fe001cf0871d7"
    },
    "capabilities": {
        "default_bucket": {
            "description": "The default bucket is an alias for a personal bucket where collections are created implicitly.",
            "url": "http://kinto.readthedocs.io/en/latest/api/1.x/buckets.html#personal-bucket-default"
        }
    }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

#### Helpers

- `fetchServerSettings([options])`: server settings
- `fetchServerCapabilities([options])`: API capabilities
- `fetchUser()`: authenticated user information
- `fetchHTTPApiVersion([options])`: HTTP API version

## Buckets

### Listing buckets

```js
const { data } = await client.listBuckets([options]);
```

Sample result:

```js
{
  data: [
    {
      id: "comments",
      last_modified: 1456182233221,
    },
    {
      id: "blog",
      last_modified: 1456181213214,
    },
  ];
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

This method accepts the [generic parameters for sorting, filtering and paginating results](#generic-options-for-list-operations).

### Creating a new bucket

```js
const result = await client.createBucket("blog"[, options]);
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456182233221,
    "id": "blog"
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

It's alternatively possible to create a bucket without specifying an `id`, so the
Kinto server will create one for you:

```js
const result = await client.createBucket();
```

Note: if you plan on providing options along id autogeneration, you have to specify
`null` as the first argument:

```js
const result = await client.createBucket(null, { data: { foo: 42 }, retry: 3 });
```

#### Options

- `data`: Arbitrary data to attach to the bucket
- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Whether to override existing resource if it already exists (default: `false`)

### Selecting a bucket

```js
client.bucket("blog");
```

### Getting bucket data

```js
const result = await client.bucket("blog").getData();
```

Sample result:

```js
{
  "last_modified": 1456182336242,
  "id": "blog",
  "foo": "bar"
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

This method accepts the [generic parameters for singular operations](#generic-options-for-singular-operations).

### Setting bucket data

```js
const result = await client.bucket("blog").setData({ foo: "bar" });
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456182336242,
    "id": "blog",
    "foo": "bar"
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

#### Options

- `patch`: Patches existing bucket data instead of replacing them (default: `false`)
- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Whether to override existing resource if it already exists (default: `false`)

### Getting bucket permissions

```js
const result = client.bucket("blog").getPermissions();
```

Sample result:

```js
{
  "write": [
    "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
  ]
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

### Setting bucket permissions

```js
const permissions = {
  read:  ["github:bob"],
  write: ["github:bob", "github:john"]
};

const result = await client.bucket("blog").setPermissions(permissions[, options]);
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456182888466,
    "id": "blog"
  },
  "permissions": {
    "read": ["github:bob"],
    "write": [
      "github:bob",
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8",
      "github:john"
    ]
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: If `last_modified` is provided, ensures the resource hasn't been modified since that timestamp. Otherwise ensures no existing resource with the provided id will be overriden (default: `false`);
- `last_modified`: The last timestamp we know the resource has been updated on the server.

#### Notes

- This operation replaces any previously set permissions;
- Owners will always keep their `write` permission bit, as per the Kinto protocol.

### Deleting a bucket

```js
const result = await client.deleteBucket("testbucket"[, options]);
```

Sample result:

```js
{
  "data": {
    "deleted": true,
    "last_modified": 1456182931974,
    "id": "blog"
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Ensures the resource hasn't been modified in the meanwhile if `last_modified` is provided (default: `false`)
- `last_modified`: The last timestamp we know the resource has been updated on the server

### Creating a collection

#### Named collection

```js
const result = await client.bucket("blog").createCollection("posts");
```

Sample result:

```js

{
  "data": {
    "last_modified": 1456183004372,
    "id": "posts"
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

#### With an ID generated automatically

```js
const result = await client.bucket("blog").createCollection();
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456183040592,
    "id": "OUh5VEDa"
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

Note that `OUh5VEDa` is the collection ID automatically generated by the server.

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Whether to override existing resource if it already exists (default: `false`)

> Note: For generated names, options can be specified only if the first parameters are provided: `createCollection(undefined, {safe: true})`

### Listing bucket collections

```js
const { data } = await client.bucket("blog").listCollections();
```

Sample result:

```js
{
  data: [
    {
      last_modified: 1456183153840,
      id: "posts",
    },
    {
      last_modified: 1456183159386,
      id: "comments",
    },
  ];
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

This method accepts the [generic parameters for sorting, filtering and paginating results](#generic-options-for-list-operations).

### Collections list timestamp

The timestamp of the collections list is used for the `since` option in the [generic parameters for sorting, filtering and paginating results](#generic-options-for-list-operations).

```js
const result = await client.bucket("blog").getCollectionsTimestamp();
```

Sample result:

```js
"1548699177099";
```

#### Options

- `headers`: custom headers object to send along the HTTP request
- `retry`: number of retries when request fails (default: 0)

### Deleting a collection

```js
const result = await client.bucket("blog").deleteCollection("test");
```

Sample result:

```js
{
  "data": {
    "deleted": true,
    "last_modified": 1456183116571,
    "id": "posts"
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Ensures the resource hasn't been modified in the meanwhile if `last_modified` is provided (default: `false`)
- `last_modified`: The last timestamp we know the resource has been updated on the server

### Creating a user group

Kinto has a concept of groups of users. A group has a list of members and belongs to a bucket.

Permissions can refer to the group instead of an individuals - this makes it easy to define «roles», especially if the same set of permissions is applied to several objects.

When used in permissions definitions, the full group URI has to be used:

```js
    {
      data: {
        title: "My article"
      },
      permissions: {
        write: ["/buckets/blog/groups/authors", "github:lili"],
        read: ["system.Everyone"]
      }
    }
```

#### Named group

```js
const result = await client.bucket("blog").createGroup("admins");
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456183004372,
    "id": "admins",
    "members": []
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

#### With a list of members and attributes

```js
const result = await client
  .bucket("blog")
  .createGroup("admins", ["system.Authenticated"], { data: { pi: 3.14 } });
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456183004372,
    "id": "admins",
    "members": ["system.Authenticated"],
    "pi": 3.14
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

#### With an ID generated automatically

```js
const result = await client.bucket("blog").createGroup();
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456183040592,
    "members": [],
    "id": "7YHFF565"
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

Note that `7YHFF565` is the group ID automatically generated by the server.

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Whether to override existing resource if it already exists (default: `false`)
- `data`: Extra group attributes
- `permissions`: Permissions to be set on the created group

> Note: For generated names, options can be specified only if the first parameters are provided: `createGroup(undefined, [], {safe: true})`

### Listing bucket groups

```js
const { data } = await client.bucket("blog").listGroups();
```

Sample result:

```js
{
  "data": [
    {
      "last_modified": 1456183153840,
      "id": "admins",
      "members": ["system.Authenticated"],
      "pi": 3.14
    },
    {
      "last_modified": 1456183159386,
      "id": "moderators",
      "members": ["github:lili"]
    }
  ]
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

This method accepts the [generic parameters for sorting, filtering and paginating results](#generic-options-for-list-operations).

### Groups list timestamp

The timestamp of the groups list is used for the `since` option in the [generic parameters for sorting, filtering and paginating results](#generic-options-for-list-operations).

```js
const result = await client.bucket("blog").getGroupsTimestamp();
```

Sample result:

```js
"1548699177099";
```

#### Options

- `headers`: custom headers object to send along the HTTP request
- `retry`: number of retries when request fails (default: 0)

### Getting a bucket group

```js
const { data } = await client.bucket("blog").getGroup("admins");
```

Sample result:

```js
{
  "data": {
      "last_modified": 1456183153840,
      "id": "admins",
      "members": ["system.Authenticated"],
      "pi": 3.14
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

This method accepts the [generic parameters for singular operations](#generic-options-for-singular-operations).

### Updating an existing group

```js
const updated = {
  id: "cb0f7b2b-e78f-41a8-afad-92a56f8c88db",
  members: ["system.Everyone", "github:lili"],
  pi: 3.141592,
};

const result = await client
  .bucket("blog")
  .updateGroup(updated, { permissions: { write: ["fxa:35478"] } });
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456183778891,
    "id": "cb0f7b2b-e78f-41a8-afad-92a56f8c88db",
    "members": ["system.Everyone", "github:lili"],
    "pi": 3.141592
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8",
      "fxa:35478"
    ]
  }
}
```

#### Options

- `patch`: Patches the existing record instead of replacing it (default: `false`)
- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: If `last_modified` is provided, ensures the resource hasn't been modified since that timestamp. Otherwise ensures no existing resource with the provided id will be overriden (default: `false`)
- `permissions`: Permissions to be set on the group

### Deleting a group

```js
const result = await client.bucket("blog").deleteGroup("admins");
```

Sample result:

```js
{
  "data": {
    "deleted": true,
    "last_modified": 1456183116571,
    "id": "admins"
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Ensures the resource hasn't been modified in the meanwhile if `last_modified` is provided (default: `false`)
- `last_modified`: The last timestamp we know the resource has been updated on the server

### Listing bucket history

```js
const { data } = await client.bucket("blog").listHistory();
```

Sample result:

```js
{
  "data": [
    {
      "action": "update",
      "collection_id": "articles",
      "date": "2016-07-20T11:18:36.530281",
      "id": "cb98ecd7-a66f-4f9d-82c5-73d06930f4f2",
      "last_modified": 1469006316530,
      "record_id": "b3b76c56-b6df-4195-8189-d79da4a128e1",
      "resource_name": "record",
      "target": {
          "data": {
              "id": "b3b76c56-b6df-4195-8189-d79da4a128e1",
              "last_modified": 1469006316529,
              "title": "Modified title"
          },
          "permissions": {
              "write": [
                  "basicauth:43181ac0ae7581a23288c25a98786ef9db86433c62a04fd6071d11653ee69089"
              ]
          }
      },
      "timestamp": 1469006098757,
      "uri": "/buckets/blog/collections/articles/records/b3b76c56-b6df-4195-8189-d79da4a128e1",
      "user_id": "basicauth:43181ac0ae7581a23288c25a98786ef9db86433c62a04fd6071d11653ee69089",
    }
  ]
}

```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

This method accepts the [generic parameters for sorting, filtering and paginating results](#generic-options-for-list-operations).

## Collections

### Selecting a collection

```js
const posts = client.bucket("blog").collection("posts");
```

### Getting collection data

```js
const result = await client.bucket("blog").collection("posts").getData();
```

Sample result:

```js
{
  "last_modified": 1456183561206,
  "id": "posts",
  "preferedAuthor": "@chucknorris"
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

This method accepts the [generic parameters for singular operations](#generic-options-for-singular-operations).

### Setting collection data

```js
const result = await client
  .bucket("blog")
  .collection("posts")
  .setData({ preferedAuthor: "@chucknorris" });
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456183561206,
    "id": "posts",
    "preferedAuthor": "@chucknorris"
  },
  "permissions": {
    "write": [
      "github:bob",
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8",
      "github:john"
    ]
  }
}
```

#### Options

- `patch`: Patches the existing data instead of replacing them (default: `false`)
- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: If `last_modified` is provided, ensures the resource hasn't been modified since that timestamp. Otherwise ensures no existing resource with the provided id will be overriden (default: `false`)
- `last_modified`: The last timestamp we know the resource has been updated on the server

### Getting collection permissions

```js
const result = await client.bucket("blog").collection("posts").getPermissions();
```

Sample result:

```js
{
  "write": [
    "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8",
  ]
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

### Setting collection permissions

```js
const result = await client
  .bucket("blog")
  .collection("posts")
  .setPermissions({
    read: ["github:bob"],
    write: ["github:john", "github:bob"],
  });
```

Sample result:

```js
{
  "data": {
    "last_modified": 1456183508926,
    "id": "posts"
  },
  "permissions": {
    "read": ["github:bob"],
    "write": [
      "github:bob",
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8",
      "github:john"
    ]
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: If `last_modified` is provided, ensures the resource hasn't been modified since that timestamp. Otherwise ensures no existing resource with the provided id will be overriden (default: `false`)
- `last_modified`: The last timestamp we know the resource has been updated on the server.

#### Notes

- This operation replaces any previously set permissions;
- Owners will always keep their `write` permission bit, as per the Kinto protocol.

### Creating a new record

```js
const result = await client
  .bucket("blog")
  .collection("posts")
  .createRecord({ title: "My first post", content: "Hello World!" });
```

Sample result:

```js
{
  "data": {
    "content": "Hello World!",
    "last_modified": 1456183657846,
    "id": "cb0f7b2b-e78f-41a8-afad-92a56f8c88db",
    "title": "My first post"
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request;
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Whether to override existing resource if it already exists and if an id is provided (default: `false`)

### Retrieving an existing record

```js
const result = await client
  .bucket("blog")
  .collection("posts")
  .getRecord("cb0f7b2b-e78f-41a8-afad-92a56f8c88db");
```

Sample result:

```js
{
  "data": {
    "content": "Hello World!",
    "last_modified": 1456183657846,
    "id": "cb0f7b2b-e78f-41a8-afad-92a56f8c88db",
    "title": "My first post"
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

This method accepts the [generic parameters for singular operations](#generic-options-for-singular-operations).

### Updating an existing record

```js
const updated = {
  id: "cb0f7b2b-e78f-41a8-afad-92a56f8c88db",
  title: "My first post, edited",
  content: "Hello World, again!",
};

const result = await client
  .bucket("blog")
  .collection("posts")
  .updateRecord(updated);
```

Sample result:

```js
{
  "data": {
    "content": "Hello World, again!",
    "last_modified": 1456183778891,
    "id": "cb0f7b2b-e78f-41a8-afad-92a56f8c88db",
    "title": "My first post, edited"
  },
  "permissions": {
    "write": [
      "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8"
    ]
  }
}
```

#### Options

- `patch`: Patches the existing record instead of replacing it (default: `false`)
- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: If `last_modified` is provided, ensures the resource hasn't been modified since that timestamp. Otherwise ensures no existing resource with the provided id will be overriden (default: `false`);

### Deleting record

```js
const result = await client
  .bucket("blog")
  .collection("posts")
  .deleteRecord("cb0f7b2b-e78f-41a8-afad-92a56f8c88db");
```

Sample result:

```js
{
  "data": {
    "deleted": true,
    "last_modified": 1456183877287,
    "id": "cb0f7b2b-e78f-41a8-afad-92a56f8c88db"
  }
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Ensures the resource hasn't been modified in the meanwhile if `last_modified` is provided (default: `false`);
- `last_modified`: When `safe` is true, the last timestamp we know the resource has been updated on the server.

### Listing records

```js
const result = await client.bucket("blog").collection("posts").listRecords();
```

Sample result:

```js
{
  last_modified: "1456183930780",
  next: <Function>,
  totalRecords: 2,
  data: [
    {
      "content": "True.",
      "last_modified": 1456183930780,
      "id": "a89dd4b2-d597-4192-bc2b-834116244d29",
      "title": "I love cheese"
    },
    {
      "content": "Yo",
      "last_modified": 1456183914275,
      "id": "63c1805a-565a-46cc-bfb3-007dfad54065",
      "title": "Another post"
    }
  ]
}
```

The result object exposes the following properties:

- `last_modified`: the [collection's timestamp](http://kinto.readthedocs.io/en/stable/api/1.x/timestamps.html). (Note: this value is the same as the one returned by [`getRecordsTimestamp()`](#records-list-timestamp))
- `next`: the [pagination](#paginating-results) helper to access the next page of results, if any
- `totalRecords`: the total number of records in the **entire collection**. This number can alternatively be retrieved using the `getTotalRecords()` method of the collection API
- `data`: the list of records

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `at`: Retrieve the records list at at a given timestamp back in time (note: full list is always returned, this option doesn't support pagination and will reject if the [History plugin](http://kinto.readthedocs.io/en/stable/api/1.x/history.html) isn't enabled or has been enabled after the creation of the collection.)

This method accepts the [generic parameters for sorting, filtering and paginating results](#generic-options-for-list-operations).

### Total number of records

```js
const result = await client
  .bucket("blog")
  .collection("posts")
  .getTotalRecords();
```

Sample result:

```js
42;
```

#### Options

- `headers`: custom headers object to send along the HTTP request
- `retry`: number of retries when request fails (default: 0)

### Records list timestamp

The timestamp of the records list is used for the `since` option in the [generic parameters for sorting, filtering and paginating results](#generic-options-for-list-operations).

```js
const result = await client
  .bucket("blog")
  .collection("posts")
  .getRecordsTimestamp();
```

Sample result:

```js
"1548699177099";
```

#### Options

- `headers`: custom headers object to send along the HTTP request
- `retry`: number of retries when request fails (default: 0)

### Batching operations

This allows performing multiple operations in a single HTTP request.

```js
const result = await client
  .bucket("blog")
  .collection("posts")
  .batch((batch) => {
    batch.deleteRecord("cb0f7b2b-e78f-41a8-afad-92a56f8c88db");
    batch.createRecord({ title: "new post", content: "yo" });
    batch.createRecord({ title: "another", content: "yo again" });
  });
```

Sample result:

```js
[
  {
    status: 200,
    path: "/v1/buckets/blog/collections/posts/records/a89dd4b2-d597-4192-bc2b-834116244d29",
    body: {
      data: {
        deleted: true,
        last_modified: 1456184078090,
        id: "a89dd4b2-d597-4192-bc2b-834116244d29",
      },
    },
    headers: {
      "Content-Length": "99",
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Expose-Headers":
        "Retry-After, Content-Length, Alert, Backoff",
    },
  },
  {
    status: 201,
    path: "/v1/buckets/blog/collections/posts/records",
    body: {
      data: {
        content: "yo",
        last_modified: 1456184078096,
        id: "afd650b3-1625-42f6-8994-860e52d39201",
        title: "new post",
      },
      permissions: {
        write: [
          "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8",
        ],
      },
    },
    headers: {
      "Content-Length": "221",
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Expose-Headers":
        "Retry-After, Content-Length, Alert, Backoff",
    },
  },
  {
    status: 201,
    path: "/v1/buckets/blog/collections/posts/records",
    body: {
      data: {
        content: "yo again",
        last_modified: 1456184078102,
        id: "22c1319e-7b09-46db-bec4-c240bdf4e3e9",
        title: "another",
      },
      permissions: {
        write: [
          "basicauth:0f7c1b72cdc89b9d42a2d48d5f0b291a1e8afd408cc38a2197cdf508269cecc8",
        ],
      },
    },
    headers: {
      "Content-Length": "226",
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Expose-Headers":
        "Retry-After, Content-Length, Alert, Backoff",
    },
  },
];
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Ensures operations won't override existing resources on the server if their associated `last_modified` value or option are provided; otherwise ensures resources won't be overriden if they already exist on the server
- `aggregate`: Produces an aggregated result object, grouped by operation types; the result object has the following structure:

```js
{
  "errors":    [], // Encountered errors (HTTP 400, >=500)
  "published": [], // Successfully published resources (HTTP 200, 201)
  "conflicts": [], // Conflicting resources (HTTP 412)
  "skipped":   []  // Missing target resources on the server (HTTP 404)
}
```

## Listing all resource permissions

If the [`permissions_endpoint` capability](http://kinto.readthedocs.io/en/stable/api/1.x/permissions.html#list-every-permissions) is installed on the server, you can retrieve the list of all permissions set for the authenticated user using the `listPermissions()` method:

```js
const result = await client.listPermissions([options]);
```

Sample result:

```js
{
  "data": [
    {
      "bucket_id": "mybucket",
      "id": "mybucket",
      "permissions": [
        "write",
        "read",
        "group:create",
        "collection:create"
      ],
      "resource_name": "bucket",
      "uri": "/buckets/mybucket"
    },
    ...
  ]
}
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)

#### Result object properties

- `last_modified`: the last modified value for the list of permissions
- `hasNextPage`: a boolean informing if a next page is available; when that's the case, you can call `next()`
- `next`: the [pagination](#paginating-results) helper to access the next page of results, if any
- `data`: the list of permissions
- `totalRecords`: the total number of permissions listed in the `data` property array

## Attachments

If the [attachment](https://github.com/Kinto/kinto-attachment) capability is available from the Kinto server, you can attach files to records. Files must be passed as [data urls](http://dataurl.net/#about), which can be generated using the [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL) in the browser.

### Adding an attachment to a record

```js
client
  .bucket("blog")
  .collection("posts")
  .addAttachment(dataURL, { title: "First post" });
```

#### Options

- `headers`: Custom headers object to send along the HTTP request
- `retry`: Number of retries when request fails (default: 0)
- `safe`: Ensures operations won't override existing resources on the server if their associated `last_modified` value or option are provided; otherwise ensures resources won't be overriden if they already exist on the server
- `last_modified`: When `safe` is true, the last timestamp we know the resource has been updated on the server
- `permissions`: Permissions to be set on the record
- `filename`: Allows to specify the attachment filename, in case the data URI does not contain any, or if the file has to be renamed on upload

### Updating an attachment

```js
client
  .bucket("blog")
  .collection("posts")
  .addAttachment(dataURL, { id: "22c1319e-7b09-46db-bec4-c240bdf4e3e9" });
```

### Deleting an attachment

```js
client
  .bucket("blog")
  .collection("posts")
  .removeAttachment("22c1319e-7b09-46db-bec4-c240bdf4e3e9");
```

## Generic bucket and collection options

Both `bucket()` and `collection()` methods accept an `options` object as a second arguments where you can define the following options:

- `{Object} headers`: Custom headers to send along the request;
- `{Boolean} safe`: Ensure safe transactional operations; read more about that below.
- `{Number} retry`: Default number of times to retry requests when faced with transient errors.

Sample usage:

```js
client.bucket("blog", {
  headers: { "X-Hello": "Hello!" },
  safe: true,
  retry: 2,
});
```

Here the `X-Hello` header and the `safe` option will be used for building every outgoing request sent to the server, for every collection attached to this bucket.

This works at the collection level as well:

```js
client.bucket("blog").collection("posts", {
  headers: { "X-Hello": "Hello!" },
  safe: true,
  retry: 2,
});
```

Every request sent for this collection will have the options applied.

Last, you can of course pass these options at the atomic operation level:

```js
client
  .bucket("blog")
  .collection("posts")
  .updateRecord(updatedRecord, {
    headers: { "X-Hello": "Hello!" },
    safe: true,
    retry: 2,
  });
```

The cool thing being you can always override the default defined options at the atomic operation level:

```js
client
  .bucket("blog", { safe: true })
  .collection("posts")
  .updateRecord(updatedRecord, { safe: false });
```

## The `safe` option explained

The `safe` option can be used:

- when creating or updating a resource, to ensure that any already existing record matching the provided ID won't be overridden if it exists on the server;
- when updating or deleting a resource, to ensure it won't be overridden remotely if it has changed in the meanwhile on the server (requires a `last_modified` value to be provided).

### Safe creations

When creating a new ressource, using the `safe` option will ensure the resource will be created only if it doesn't already exist on the server.

### Safe updates

If a `last_modified` property value is set in the resource object being updated, the `safe` option will ensure it won't be overriden if it's been modified on the server since that `last_modified` timestamp, raising an `HTTP 412` response describing the conflict when that happens:

```js
const updatedRecord = {
  id: "fbd2a565-8c10-497a-95b8-ce4ea6f474e1",
  title: "new post, modified",
  content: "yoyo",
  last_modified: 1456184189160,
};

client
  .bucket("blog")
  .collection("posts")
  .updateRecord(updatedRecord, { safe: true });
```

If this record has been modified on the server already, meaning its `last_modified` is greater than the one we provide , we'll get a `412` error response.

If no `last_modified` value is provided at all, a safe update will simply guarantee that an existing resource with the provided ID won't be overriden.

### Safe deletions

The same applies for deletions, where you can pass both a `safe` and `last_modified` options:

```js
client
  .bucket("blog")
  .collection("posts")
  .deleteRecord("fbd2a565-8c10-497a-95b8-ce4ea6f474e1", {
    safe: true,
    last_modified: 1456184189160,
  });
```

## Generic options for list operations

Every list operations like [listBuckets()](#listing-buckets), [listCollections](#listing-bucket-collections), [listHistory](#listing-bucket-history), [listGroups()](#list-bucket-groups) or [listRecords()](#listing-records) accept parameters to sort, filter and paginate the results:

- `sort`: The order field (default: `-last_modified`);
- `pages`: The number of result pages to retrieve (default: `1`);
- `limit`: The number of records to retrieve per page: unset by default, uses default server configuration;
- `filters`: An object defining the filters to apply; read more about [what's supported](http://kinto.readthedocs.io/en/stable/api/1.x/filtering.html);
- `since`: The ETag header value received from the last response from the server.
- `fields`: The set of fields to return for each record (see the [selecting fields](https://kinto.readthedocs.io/en/stable/api/1.x/selecting_fields.html) documentation).

### Sorting

By default, results are listed by `last_modified` descending order. You can set the `sort` option to order by another field:

```js
const { data, next } = await client
  .bucket("blog")
  .collection("posts")
  .listRecords({ sort: "title" });
```

### Polling for changes

To retrieve the results modified since a given timestamp, use the `since` option:

```js
const { data, next } = await client
  .bucket("blog")
  .collection("posts")
  .listRecords({ since: "1456183930780" });
```

### Paginating results

By default, all results of the first page are retrieved, and the default configuration of the server defines no limit. To specify a max number of results to retrieve, you can use the `limit` option:

```js
const { data, hasNextPage, next } = await client
  .bucket("blog")
  .collection("posts")
  .listRecords({ limit: 20 });
```

To check if a next page of results is available, you can check for the `hasNextPage` boolean property. To actually fetch the next page of results, call the `next()` function obtained:

```js
let { data, hasNextPage, next } = await client
  .bucket("blog")
  .collection("posts")
  .listRecords({ limit: 20 });
while (hasNextPage) {
  const result = await next();
  data = data.concat(result.data);
  hasNextPage = result.hasNextPage;
}
```

Last, if you just want to retrieve and aggregate a given number of result pages, instead of dealing with calling `next()` recursively you can simply specify the `pages` option:

```js
const { data, hasNextPage, next } = await client
  .bucket("blog")
  .collection("posts")
  .listRecords({ limit: 20, pages: 3 }); // A maximum of 60 results will be retrieved here
```

> ##### Notes
>
> If you plan on fetching all the available pages, you can set the `pages` option to `Infinity`. Be aware that for large datasets this strategy can possibly issue an excessive number of HTTP requests.

## Generic options for singular operations

"Singular" operations such as [Bucket#getData()](#getting-bucket-data), [Bucket#getGroup](#getting-a-bucket-group), [Collection#getData](#getting-collection-data), and [Collection#getRecord](#retrieving-an-existing-record) support some shared options:

- `fields`: The set of fields to return for each record (see the [selecting fields](https://kinto.readthedocs.io/en/stable/api/1.x/selecting_fields.html) documentation).
- `query`: Any extra query arguments to pass. This might be handy if you want to use a feature that this library doesn't support yet, or for implementing cache-busting URLs.

## Events

The `KintoClient` exposes an `events` property you can subscribe public events from. That `events` property implements nodejs' [EventEmitter interface](https://nodejs.org/api/events.html#events_class_events_eventemitter).

### The `backoff` event

Triggered when a `Backoff` HTTP header has been received from the last received response from the server, meaning clients should hold on performing further requests during a given amount of time.

The `backoff` event notifies what's the backoff release timestamp you should wait until before performing another operation:

```js
const client = new KintoClient();

client.events.on("backoff", function (releaseTime) {
  const releaseDate = new Date(releaseTime).toLocaleString();
  alert(`Backed off; wait until ${releaseDate} to retry`);
});
```

### The `deprecated` event

Triggered when an `Alert` HTTP header is received from the server, meaning that a feature has been deprecated; the `event` argument received by the event listener contains the following deprecation information:

- `type`: The type of deprecation, which in ou case is always `soft-eol` (`hard-eol` alerts trigger an `HTTP 410 Gone` error);
- `message`: The deprecation alert message;
- `url`: The URL you can get information about the related deprecation policy.

```js
const client = new KintoClient();

client.events.on("deprecated", function (event) {
  console.log(event.message);
});
```

### The `retry-after` event

Some errors on the server side are transient (service unavailable or integrity errors). A `Retry-After` HTTP header in the response indicates the duration in seconds that clients should wait before retrying the request.

The `retry-after` event notifies what is the timestamp you should wait until before performing another operation:

```js
const client = new KintoClient();

client.events.on("retry-after", function (releaseTime) {
  const releaseDate = new Date(releaseTime).toLocaleString();
  alert(`Wait until ${releaseDate} to retry`);
});
```

> #### Note:
>
> We also automatically retry all requests that have a Retry-After response.

## Browser Compatibility

This library uses some features that are not supported on Internet Explorer or older versions of Safari.

- Javascript [`Promise`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Promise#Browser_compatibility)
- [`Object.assign()`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Browser_compatibility)
- [`fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API#Browser_compatibility)

Please [add polyfills](https://polyfill.io/v2/docs/features/) for these to get full functionality.
