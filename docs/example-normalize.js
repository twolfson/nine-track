// Load in dependencies
var express = require('express');
var nineTrack = require('../');
var request = require('request');

// Start up a server that echoes our path
express().use(function (req, res) {
  res.send(req.path);
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
express().use(nineTrack({
  url: 'http://localhost:1337',
  fixtureDir: 'directory/to/save/responses',
  normalizeFn: function (info) {
    if (info.headers['x-timestamp']) {
      // Normalize all timestamps to a consistent number
      info.headers['x-timestamp'] = '2015-02-12T00:00:00.000Z';
    }
  }
})).listen(1338);

// On first run, makes valid request
// On future runs, repeats same response
request({
  url: 'http://localhost:1338/timestamp',
  headers: {
    'x-timestamp': (new Date()).toISOString()
  }
}, console.log);
