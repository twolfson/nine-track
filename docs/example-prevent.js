// Load in dependencies
var express = require('express');
var nineTrack = require('../');
var request = require('request');

// Run this file via:
// http://docs.travis-ci.com/user/ci-environment/#Environment-variables
// TRAVIS=true node example-prevent.js

// Start up a server that echoes our path
express().use(function (req, res) {
  res.json(req.path);
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
express().use(nineTrack({
  url: 'http://localhost:1337',
  fixtureDir: 'directory/to/save/responses',
  preventRecording: !!process.env.TRAVIS
})).listen(1338);

request('http://localhost:1338/world', console.log);
