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

- Dev version, including source maps: [kinto.js](http://unpkg.com/kinto/dist/kinto.js)
- Production version, minified, no source maps: [kinto.min.js](http://unpkg.com/kinto/dist/kinto.min.js)
- Minimalist version, without polyfills [kinto.noshim.js](http://unpkg.com/kinto/dist/kinto.noshim.js)

> #### Notes
>
> Only stable tags are released as dist files; if you plan on using latest versions from master, you need to [build them manually](contributing.md#generating-dist-files).


### Subresource integrity

To make sure that you are using the right code when loading from a CDN, you can use subresource
integrity with the hash provided below:

```html
    <script src="//unpkg.com/kinto@X.Y.Z/dist/kinto.min.js"
            integrity="sha384-<refer to the table below to retrieve the proper hash>"
            crossorigin="anonymous">
    </script>
```

| Filename                | Hash (for version 7.0.0)                                                |
|-------------------------|-------------------------------------------------------------------------|
| kinto.js                | sha384-yy1QVIOdNcqBGUxjj4cNNZPobGnxjwiv95MfTPWb6J0q0PXI0PSN+871W2nkavMx |
| kinto.min.js            | sha384-o60AYLGD1VZtUfvb/ZRZqoyL5/nnTzY05PJkOSUUfj1bhe0lmu5g1+Tb6uk8l4p+ |
| kinto.noshim.js         | sha384-UYfSk9TQUXpw3IAamJVc+HzD+DcTaOe+OSxOkyY3IPrsk3DChLCSRUjPvw8G1kqz |
