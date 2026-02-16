const withSerwistInit = require("@serwist/next").default;

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
};

module.exports = withSerwist(nextConfig);
