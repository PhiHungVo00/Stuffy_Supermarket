const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const path = require("path");
const webpack = require("webpack");
require("dotenv").config();

module.exports = {
  entry: "./src/index",
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  devServer: {
    port: 3010,
    static: { directory: path.join(__dirname, "public") },
    headers: { "Access-Control-Allow-Origin": "*" },
  },
  module: {
    rules: [
      { test: /\.jsx?$/, loader: "babel-loader", exclude: /node_modules/, options: { presets: ["@babel/preset-env", "@babel/preset-react"] } },
    ],
  },
  resolve: { extensions: [".js", ".jsx"] },
  plugins: [
    new ModuleFederationPlugin({
      name: "support",
      filename: "remoteEntry.js",
      remotes: {
        store: "store@https://stuffy-store-app.onrender.com/remoteEntry.js",
      },
      exposes: {
        "./FloatingChat": "./src/FloatingChat",
      },
      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false }
      },
    }),
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
    new webpack.DefinePlugin({
      "process.env.GEMINI_API_KEY": JSON.stringify(process.env.GEMINI_API_KEY),
    }),
  ],
};
