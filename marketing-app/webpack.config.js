const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const path = require("path");

module.exports = {
  entry: "./src/index",
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  devServer: {
    port: 3009,
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
      name: "marketing",
      filename: "remoteEntry.js",
      remotes: {
        store: "store@https://stuffy-store-app.onrender.com/remoteEntry.js",
      },
      exposes: {
        "./FlashSaleBanner": "./src/FlashSaleBanner",
        "./VoucherWallet": "./src/VoucherWallet",
      },
      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false }
      },
    }),
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
  ],
};
