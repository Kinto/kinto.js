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
const pusher = new Pusher('pusherKey', {
  encrypted: true
});

const collectionName = 'tasks';
const channelName = 'mybucket-tasks-record'; // Should match the setting `kinto.event_listeners.pusher.channel`
const channel = pusher.subscribe(channelName);

channel.bind_all((evtName, data) => {
  if (evtName === 'pusher:subscription_succeeded') {
    return;
  }
  applyChanges(collectionName, evtName, data);
});

function applyChanges(collectionName, evtName, data) {
  const changes = data.map(record => record.new);
  const timestamps = changes.map(record => record.last_modified)
  const changeObj = {
    changes: changes,
    lastModified: Math.max.apply(null, timestamps)
  };

  const syncResultObject = new SyncResultObject();
  tasks.importChanges(syncResultObject, changeObj);
}
```
