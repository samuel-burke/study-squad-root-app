// Preload with `node --require ./fake-root/register.cjs server/dist/main.js` to run
// the real server against the fake Root host in ./server-app.cjs. Every
// require of @rootsdk/server-app, including the generated networking code's,
// gets the fake.
//
// `rootsdk build package` leaves sqlite3 out of the package: Root's host
// supplies its own native build. Outside Root, the repo's copy stands in.
"use strict";

const Module = require("node:module");
const path = require("node:path");

const fake = path.join(__dirname, "server-app.cjs");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "@rootsdk/server-app") return fake;
  try {
    return resolve.call(this, request, ...rest);
  } catch (error) {
    if (request === "sqlite3") return require.resolve("sqlite3");
    throw error;
  }
};
