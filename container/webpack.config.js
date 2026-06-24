const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const { GenerateSW } = require('workbox-webpack-plugin');
const CopyWebpackPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
require("dotenv").config();

// Determine if webpack is running via dev-server / serve mode
const isDevServer = process.env.WEBPACK_SERVE === 'true' || process.env.WEBPACK_DEV_SERVER === 'true' || process.argv.some(arg => arg.includes('serve'));

// Auto-detect environment: use .env for local dev, fall back to process.env for Render deployment
// Helper to generate dynamic remote promise for Webpack Module Federation
module.exports = {
  mode: "development",
  entry: "./src/index.js",

  devServer: {
    headers: { "Access-Control-Allow-Origin": "*" },
    port: 3000,
    historyApiFallback: true,
    hot: false,
    liveReload: true,
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
  },

  output: {
    publicPath: "auto",
  },

  module: {
    rules: [
      {
        test: /\.m?js$/,
        type: "javascript/auto",
        resolve: { fullySpecified: false },
      },
      {
        test: /\.(js|jsx)$/,
        use: "babel-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.(ts|tsx)$/,
        loader: "ts-loader",
        options: { transpileOnly: true },
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

  resolve: { extensions: [".js", ".jsx", ".ts", ".tsx"] },

  plugins: [
    new ModuleFederationPlugin({
      name: "container",
      remoteType: "var",
      remotes: {
        header: "header",
        product: "product",
        cart: "cart",
        admin: "admin",
        store: "store",
        design_system: "design_system",
        viewer: "viewer",
        profile: "profile",
        marketing: "marketing",
        support: "support",
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
    new CopyWebpackPlugin({
      patterns: [
        { from: "public/config.json", to: "." },
        { from: "public/favicon.ico", to: ".", noErrorOnMissing: true },
        { from: "public/push-sw.js", to: "." },
      ],
    }),

    // PWA: Generate Service Worker (disabled in local dev to prevent infinite reload loops)
    ...((process.env.NODE_ENV === 'production' && !isDevServer) ? [

      new GenerateSW({
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 50 },
            },
          },
          {
            urlPattern: /https:\/\/stuffy-backend-api.onrender.com\/api/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
            },
          }
        ]
      })
    ] : []),
  ],
};
