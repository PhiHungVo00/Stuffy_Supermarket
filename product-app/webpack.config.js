const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  mode: "development",
  entry: "./src/index.js",

  devServer: {
    headers: { "Access-Control-Allow-Origin": "*" },
    port: 3002,
    historyApiFallback: true,
    hot: false,
    liveReload: true,
  },

  output: {
    publicPath: "auto",
  },

  module: {
    rules: [
      {
        test: /\.m?js$/,
        type: "javascript/auto",
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
      name: "product",
      filename: "remoteEntry.js",

      remotes: {
        store: "store@https://stuffy-store-app.onrender.com/remoteEntry.js",
        design_system: "design_system@https://stuffy-design-system-app.onrender.com/remoteEntry.js",
        viewer: "viewer@https://stuffy-3d-viewer-app.onrender.com/remoteEntry.js",
      },

      exposes: {
        "./ProductList": "./src/ProductList",
        "./ProductDetail": "./src/ProductDetail",
        "./WishlistPage": "./src/WishlistPage",
        "./Storefront": "./src/Storefront",
        "./LiveStream": "./src/LiveStream",
      },

      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false },
        "react-router-dom": { singleton: true, requiredVersion: false },
        zustand: { singleton: true, requiredVersion: false },
      },
    }),

    new HtmlWebpackPlugin({
      template: "./public/index.html",
    }),
  ],
};
