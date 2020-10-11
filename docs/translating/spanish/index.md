# Kinto.js [![](https://travis-ci.org/Kinto/kinto.js.svg?branch=master)](https://travis-ci.org/Kinto/kinto.js) [![](https://coveralls.io/repos/Kinto/kinto.js/badge.svg?branch=master)](https://coveralls.io/r/Kinto/kinto.js?branch=master) [![](https://readthedocs.org/projects/kintojs/badge/?version=latest)](http://kintojs.readthedocs.io/) [![](https://doc.esdoc.org/github.com/Kinto/kinto.js/badge.svg)](https://doc.esdoc.org/github.com/Kinto/kinto.js)

*Un cliente Javascript offline-first  para utilizar la [API de Kinto](http://kinto.readthedocs.io/).*

```js
const tasks = new Kinto({
  remote: "https://kinto.dev.mozaws.net/v1"
}).collection("tasks");

await tasks.create({label: "First item", done: false});
await tasks.sync();
```

## Conceptos clave

* Offline first: cada operación se realiza localmente en IndexedDB de manera predeterminada.
* La sincronización con el servidor se ejecutará de manera explícita.

Siga el [tutorial](tutorial.md) para comenzar, luego lea sobre el [uso de la API](api.md) y, finalmente, explore los documentos [detallados de la API](https://doc.esdoc.org/github.com/Kinto/kinto.js/).

Si deseas, puedes echar un vistazo a algunos usos [avanzados](advanced.md).

## Communidad & Soporte

* [Repositorio](https://github.com/Kinto/kinto.js)
* [Issue tracker](https://github.com/Kinto/kinto.js/issues)
* [Rastreador de issues](https://github.com/Kinto/kinto.js/issues)
* [Lista de correo](https://mail.mozilla.org/listinfo/kinto)
* IRC: [irc.freenode.org#kinto](https://kiwiirc.com/client/irc.freenode.net/?#kinto)

## Licencia

[Licencia pública de Mozilla v2](https://www.mozilla.org/MPL/2.0/)