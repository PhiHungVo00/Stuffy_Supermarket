const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const webpack = require("webpack");
require("dotenv").config();

module.exports = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",

  entry: "./src/index.js",

  devServer: {
    headers: { "Access-Control-Allow-Origin": "*" },
    port: 3001,
    historyApiFallback: true,
    hot: false,
    liveReload: true,
  },

  experiments: {
    outputModule: false,
  },

  module: {
    rules: [
      {
        test: /\.m?js$/,
        type: "javascript/auto",   // 🔥 QUAN TRỌNG
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.jsx?$/,
        use: "babel-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },

  resolve: {
    extensions: [".js", ".jsx"],
  },

  plugins: [
    new ModuleFederationPlugin({
      name: "header",

      filename: "remoteEntry.js",
      remotes: {
        store: "store@https://stuffy-store-app.onrender.com/remoteEntry.js",
        design_system: "design_system@https://stuffy-design-system-app.onrender.com/remoteEntry.js",
      },
      exposes: {
        "./Header": "./src/Header",
      },

      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false },
      },
    }),

    new HtmlWebpackPlugin({
      template: "./public/index.html",
    }),
    new webpack.DefinePlugin({
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || ''),
    }),
  ],
};
