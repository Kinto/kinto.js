const path = require("path");
const merge = require("webpack-merge");

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
default:
  module.exports = common;
}
