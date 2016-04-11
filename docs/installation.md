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

- Dev version, including source maps: [kinto-2.0.0.js](http://npmcdn.com/kinto@2.0.0/dist/kinto-2.0.0.js)
- Production version, minified, no source maps: [kinto-2.0.0.min.js](http://npmcdn.com/kinto@2.0.0/dist/kinto-2.0.0.min.js)
- Minimalist version, without polyfills [kinto-2.0.0.noshim.js](http://npmcdn.com/kinto@2.0.0/dist/kinto-2.0.0.noshim.js)

> #### Notes
>
> Only stable tags are released as dist files; if you plan on using latest versions from master, you need to [build them manually](contributing.md#generating-dist-files).


### Subresource integrity

To make sure that you are using the right code when loading from a CDN, you can use subresource
integrity with the hash provided below:

```html
    <script src="//npmcdn.com/kinto@2.0.0/dist/kinto-2.0.0.min.js"
            integrity="sha384-aaty4B6Fzw+pZ9DbNdrlGsFu9f8x06+N0aCAXCn1QMpWVgB79PC9KSdWqqagm6E9"
            crossorigin="anonymous">
    </script>
```

| Filename                | Hash                                                                    |
|-------------------------|-------------------------------------------------------------------------|
| kinto-2.0.0.js          | sha384-nhccqZvXYLdLpbp4w0BRCgd4zKKNbGnL6RO7+u+xbB/MplGoc3m6GWhQz3i0S0ly |
| kinto-2.0.0.min.js      | sha384-zP6aS9TKQ8AOwwcfSJjHcCVaHBEYnMIPnUea01uVKzB8AayzlHEyHgdyFaJxEUCT |
| kinto-2.0.0.noshim.js   | sha384-xzkr5lhJnBvqOTfbcIVSQbUlVfEdXGCen/DUUkDUxljasft0dVk6cG8Y/eV+MoGv |
