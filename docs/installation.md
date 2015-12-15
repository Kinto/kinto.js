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

Dev and production ready assets are available in the [`gh-pages` branch of the repository](https://github.com/Kinto/kinto.js/tree/gh-pages). In general, you should download these files and ship them along your own projects, though you can also link them during development:

- Dev version, including source maps: [kinto-1.1.2.js](http://npmcdn.com/kinto@1.1.2/dist/kinto-1.1.2.js)
- Production version, minified, no source maps: [kinto-1.1.2.min.js](http://npmcdn.com/kinto@1.1.2/dist/kinto-1.1.2.min.js)
- Minimalist version, without polyfills [kinto-1.1.2.noshim.js](http://npmcdn.com/kinto@1.1.2/dist/kinto-1.1.2.noshim.js)

> #### Notes
>
> Only stable tags are released as dist files; if you plan on using latest versions from master, you need to [build them manually](hacking.md#generating-dist-files).
