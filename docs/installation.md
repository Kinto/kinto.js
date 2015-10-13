# Installing Kinto.js

## NodeJS

If you're using [NodeJS](https://nodejs.org) and [npm](https://www.npmjs.com/) as a frontend package manager, you'll need [NodeJS v0.12.x](https://nodejs.org/download/) installed on your system. Then:

```js
$ npm install kinto --save
```

> #### Notes
>
> *Read more about how to build Kinto.js in the [Hacking section](hacking.md).*

## Static assets

Dev and production ready assets are available in the [`dist` folder of the repository](https://github.com/Kinto/kinto.js/tree/master/dist). You can either download an archive of the code and use these files in your own project, or link to static assets served through [rawgit](http://rawgit.com/):

### Latest master

- Dev version, including source maps: [kinto.dev.js](https://rawgit.com/Kinto/kinto.js/master/dist/kinto.dev.js)
- Production version, minified, no source maps: [kinto.dev.js](https://rawgit.com/Kinto/kinto.js/master/dist/kinto.min.js)

### Latest tag

- Dev version, including source maps: [kinto.dev.js](https://cdn.rawgit.com/Kinto/kinto.js/1.0.0-rc.1/dist/kinto.dev.js)
- Production version, minified, no source maps: [kinto.dev.js](https://cdn.rawgit.com/Kinto/kinto.js/1.0.0-rc.1/dist/kinto.min.js)
