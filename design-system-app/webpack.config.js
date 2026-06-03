const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  mode: "development",
  entry: "./src/index.js",

  devServer: {
    headers: { "Access-Control-Allow-Origin": "*" },
    port: 3006,
    historyApiFallback: true,
    hot: false,
    liveReload: true,
  },

  output: { publicPath: "auto" },

  module: {
    rules: [
      { test: /\.m?js$/, type: "javascript/auto", resolve: { fullySpecified: false } },
      { test: /\.jsx?$/, use: "babel-loader", exclude: /node_modules/ },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: { extensions: [".js", ".jsx"] },

  plugins: [
    new ModuleFederationPlugin({
      name: "design_system",
      filename: "remoteEntry.js",
      exposes: {
        "./Button": "./src/components/Button",
        "./GlassCard": "./src/components/GlassCard",
        "./ProductSkeleton": "./src/components/ProductSkeleton",
        "./styles": "./src/index.css",
        "./ThemeConfig": "./src/ThemeConfig"
      },
      shared: {
        react: { singleton: true, requiredVersion: false },
        "react-dom": { singleton: true, requiredVersion: false },
      },
    }),
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
  ],
};

