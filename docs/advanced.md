## Receiving changes via Websocket

While explicitly calling `collection.sync()` works nicely, sometimes
we want the synchronization operation to happen automatically in the
background. In that case, we need to listen to change events sent from
a WebSocket server.

Currently, the simplest way to publish the changes via websocket from
Kinto API is to integrate with Pusher.com ([tutorial here](https://kinto.readthedocs.io/en/stable/tutorials/notifications-websockets.html)).
Later, [kinto-webpush](https://github.com/Kinto/kinto-webpush/) will
help you to use your own websocket server.

When there are incoming changes, we can import them to our local store using
[`collection.importChanges()`](https://doc.esdoc.org/github.com/Kinto/kinto.js/class/src/collection.js~Collection.html#instance-method-importChanges):

```javascript
var pusher = new Pusher('pusherKey', {
  encrypted: true
});

var collectionName = 'tasks';
var channelName = 'mybucket-tasks-record'; // Should match the setting `kinto.event_listeners.pusher.channel`
var channel = pusher.subscribe(channelName);

channel.bind_all(function(evtName, data) {
  if (evtName === 'pusher:subscription_succeeded') {
    return;
  }
  applyChanges(collectionName, evtName, data);
});

function applyChanges(collectionName, evtName, data) {
  var changes = data.map(function(record) { return record.new; });
  var timestamps = changes.map(function(record) { return record.last_modified; })
  var changeObj = {
    changes: changes,
    lastModified: Math.max.apply(null, timestamps)
  };

  var syncResultObject = new SyncResultObject();
  tasks.importChanges(syncResultObject, changeObj);
}
```
