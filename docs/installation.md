# Installing Kinto.js

## NodeJS

If you're using [NodeJS](https://nodejs.org) and [npm](https://www.npmjs.com/) as a frontend package manager, you'll need [NodeJS v0.12.x](https://nodejs.org/download/) installed on your system. Then:

```js
$ npm install kinto --save
```

> #### Notes
>
> *Read more about how to build Kinto.js in the [Contributing section](contributing.md).*

## Static assets

Dev and production ready assets are available in the [`gh-pages` branch of the repository](https://github.com/Kinto/kinto.js/tree/gh-pages). In general, you should download these files and ship them along your own projects, though you can also link them during development:

- Dev version, including source maps: [kinto-2.0.1.js](http://npmcdn.com/kinto@2.0.1/dist/kinto-2.0.1.js)
- Production version, minified, no source maps: [kinto-2.0.1.min.js](http://npmcdn.com/kinto@2.0.1/dist/kinto-2.0.1.min.js)
- Minimalist version, without polyfills [kinto-2.0.1.noshim.js](http://npmcdn.com/kinto@2.0.1/dist/kinto-2.0.1.noshim.js)

> #### Notes
>
> Only stable tags are released as dist files; if you plan on using latest versions from master, you need to [build them manually](contributing.md#generating-dist-files).


### Subresource integrity

To make sure that you are using the right code when loading from a CDN, you can use subresource
integrity with the hash provided below:

```html
    <script src="//npmcdn.com/kinto@2.0.1/dist/kinto-2.0.1.min.js"
            integrity="sha384-/6HibJ/ub13TpR2+A2DhxlX6qo0hSIzT75j26NpoAlRQEDefIV56QWmWqo1n9fjG"
            crossorigin="anonymous">
    </script>
```

| Filename                | Hash                                                                    |
|-------------------------|-------------------------------------------------------------------------|
| kinto-2.0.1.js          | sha384-dnS8mqJJO8tfA5ltm4hbDgU/xDbxgKTRUb06s514e/TLowfz5Y05kbPkqec0Wx/X |
| kinto-2.0.1.min.js      | sha384-/6HibJ/ub13TpR2+A2DhxlX6qo0hSIzT75j26NpoAlRQEDefIV56QWmWqo1n9fjG |
| kinto-2.0.1.noshim.js   | sha384-uT/r9N2hBs+/nUKSxIR9asConCsr2kX89pMglaRDr66CCCFFOzw09v4GSDj3fdNr |

