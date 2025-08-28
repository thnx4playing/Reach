// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);

// Prefer React Native entry points so Metro bundles Skia correctly
config.resolver.resolverMainFields = ["react-native", "browser", "module", "main"];

module.exports = config;
