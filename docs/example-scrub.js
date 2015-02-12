// Load in dependencies
var express = require('express');
var nineTrack = require('../');
var request = require('request');

// Start up a server that echoes our path
express().use(bodyParser.urlencoded()).use(function (req, res) {
  res.send(req.body.sensitive_token === 'password');
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
express().use(nineTrack({
  url: 'http://localhost:1337/hello',
  fixtureDir: 'directory/to/save/responses',
  scrubFn: function (info) {
    if (info.request.body.sensitive_token) {
      // Normalize all sensitive token to a hidden value
      info.request.body.sensitive_token = '****';
    }
  }
})).listen(1338);

// On first run, makes successful request and saves sanitized data
// On future runs, repeats same response
request({
  url: 'http://localhost:1338/world',
  form: {
    sensitive_token: 'password'
  }
}, console.log);
