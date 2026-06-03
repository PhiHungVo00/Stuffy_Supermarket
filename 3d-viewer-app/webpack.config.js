const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const deps = require("./package.json").dependencies;

module.exports = {
  mode: "development",
  entry: "./src/index.js",
  devServer: {
    headers: { "Access-Control-Allow-Origin": "*" },
    port: 3007,
    historyApiFallback: true,
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
  },
  performance: { hints: false },
  output: { publicPath: "auto" },
  stats: { errorDetails: true },
  module: {
    rules: [
      { test: /\.m?js$/, type: "javascript/auto", resolve: { fullySpecified: false } },
      { test: /\.jsx?$/, use: "babel-loader", exclude: /node_modules/ },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      {
        test: /\.(png|svg|jpg|jpeg|gif|glb|gltf|bin)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"],
    symlinks: false, // Helps resolving in monorepos
    modules: [
      path.resolve(__dirname, "node_modules"),
      path.resolve(__dirname, "../node_modules"),
      "node_modules",
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: "viewer",
      filename: "remoteEntry.js",
      exposes: { "./Viewer": "./src/Viewer" },
      shared: {
        react: { singleton: true, requiredVersion: deps.react },
        "react-dom": { singleton: true, requiredVersion: deps["react-dom"] },
        three: { singleton: true, requiredVersion: deps.three },
      },
    }),
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
  ],
};


