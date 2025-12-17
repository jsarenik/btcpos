const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require('path');

module.exports = {
    entry: "./bootstrap.ts",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bootstrap.js",
    },
    mode: "development",
    plugins: [
        new CopyWebpackPlugin({ patterns: ["index.html", "styles.css", { from: "docs", to: "docs" }] })
    ],
    experiments: {
        asyncWebAssembly: true,
        syncWebAssembly: true
    },
    optimization: {
        minimize: false,
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    devServer: {
        port: 8384,
    },
};

