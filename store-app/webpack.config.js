const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  mode: "development",
  entry: "./src/index.js",

  devServer: {
    headers: { "Access-Control-Allow-Origin": "*" },
    port: 3005,
    historyApiFallback: true,
    hot: false,
    liveReload: true,
  },

  output: { publicPath: "auto" },

  module: {
    rules: [
      { test: /\.m?js$/, type: "javascript/auto", resolve: { fullySpecified: false } },
      { test: /\.(js|jsx)$/, use: "babel-loader", exclude: /node_modules/ },
      { test: /\.(ts|tsx)$/, loader: "ts-loader", options: { transpileOnly: true }, exclude: /node_modules/ },
      { test: /\.css$/i, use: ["style-loader", "css-loader"] },
    ],
  },
  resolve: { extensions: [".js", ".jsx", ".ts", ".tsx"] },

  plugins: [
    new ModuleFederationPlugin({
      name: "store",
      filename: "remoteEntry.js",
      exposes: {
        "./store": "./src/store",
        "./api": "./src/api",
        "./i18n": "./src/i18n",
        "./signals": "./src/GlobalSignals",
      },
      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false },
        zustand: { singleton: true, requiredVersion: false },
        "@preact/signals-react": { singleton: true, requiredVersion: false }
      },
    }),
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
  ],
};

