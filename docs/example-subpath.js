// Start up a server that echoes our path
var express = require('express');
var nineTrack = require('../');
var request = require('request');
express().use(function (req, res) {
  res.send(req.path);
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
express().use(nineTrack({
  url: 'http://localhost:1337/hello',
  fixtureDir: 'directory/to/save/responses'
})).listen(1338);

// Logs `/hello/world`, concatenated result of `/hello` and `/world` pathss
request('http://localhost:1338/world', console.log);
