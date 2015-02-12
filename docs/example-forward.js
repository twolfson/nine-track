// Load in dependencies
var express = require('express');
var nineTrack = require('../');
var request = require('request');

// Start up a server that echoes our path
express().use(function (req, res) {
  res.json({items: ['a', 'b', 'c']});
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
var nineTrackFn = nineTrack({
  url: 'http://localhost:1337/hello',
  fixtureDir: 'directory/to/save/responses'
});
express().use(function (localReq, localRes) {
  nineTrackFn.forwardRequest(localReq, function handleResponse (err, remoteRes, remoteBody) {
    // If there was an error, emit it
    if (err) {
      return localReq.emit('error', err);
    }

    // Otherwise, attempt to adjust the body
    var remoteJson = JSON.parse(remoteBody);
    if (remoteJson.items.length === 3) {
      remoteJson.items.pop();
    }

    // Send our response
    localRes.json(remoteJson);
  });
}).listen(1338);

// On first run, makes successful request and saves sanitized data
// On future runs, repeats same response
request({
  url: 'http://localhost:1338/world',
  form: {
    sensitive_token: 'password'
  }
}, console.log); // {items: ['a', 'b']}
