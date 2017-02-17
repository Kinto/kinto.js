const path = require("path");
const merge = require("webpack-merge");
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const common = {
  entry: "./src/index",
  output: {
    library: "Kinto",
    libraryTarget: "umd",
    filename: "kinto.js",
    path: path.resolve(__dirname, "dist")
  },
  module: {
    loaders: [{
      test: /\.js$/,
      exclude: /node_modules/,
      loader: "babel-loader"
    }]
  },
  devtool: "source-map"
};

switch (process.env.npm_lifecycle_event) {
  case "dist-prod":
    module.exports = merge(common, {
      output: {
        filename: "kinto.min.js"
      }
    });
  break;
  case "dist-noshim":
    module.exports = merge(common, {
      output: {
        filename: "kinto.noshim.js"
      }
    });
    break;
  case "dist-fx":
    module.exports = merge(common, {
      entry: "./fx-src/index",
      output: {
        filename: "temp.jsm",
        path: __dirname
      },
      externals: {
        uuid: "uuid",
        "kinto-http": "kinto-http"
      }
    });
  break;
  case "analyze-bundle":
    module.exports = merge(common, {
      plugins: [
        new BundleAnalyzerPlugin({
          analyzerMode: "server",
          analyzerPort: 8080
        })
      ]
    });
    break;
  default:
    module.exports = common;
}
