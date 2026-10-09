const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const HtmlMinimizerPlugin = require("html-minimizer-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

module.exports = {
    entry: {
        main: "./src/main.ts",
    },
    module: {
        rules: [
            {
                test: /\.m?tsx?$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "static", to: "" },
            ]
        })
    ],
    resolve: {
        extensions: [".mts", ".tsx", ".ts", ".js"],
    },
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "dist"),
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        passes: 5
                    }
                }
            }),
            new HtmlMinimizerPlugin({
                minimizerOptions: {
                    conservativeCollapse: false
                }
            }),
            new CssMinimizerPlugin()
        ]
    }
};
