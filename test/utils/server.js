var https = require('https');
var express = require('express');
var pem = require('pem');
var rimraf = require('rimraf');
var nineTrack = require('../../');

before(function () {
  this.requests = {};
});

// Helper for starting HTTP and HTTPS servers
exports._startServer = function (listenFn, port, middlewares) {
  return function _startServerFn () {
    // Create a namespace to save the requests
    this.requests[port] = [];

    // Save requests as they come in
    var app = express();
    var that = this;
    app.use(function (req, res, next) {
      that.requests[port].push(req);
      next();
    });

    // Use our middlewares and start listening
    if (!Array.isArray(middlewares)) {
      middlewares = [middlewares];
    }
    middlewares.forEach(function (middleware) {
      app.use(middleware);
    });
    return listenFn(app, port);
  };
};
exports._run = function (listenFn, port, middlewares) {
  var _app;
  var startServerFn = exports._startServer(listenFn, port, middlewares);
  before(function startServer () {
    _app = startServerFn.call(this);
  });
  after(function deleteServer (done) {
    _app.close(done);
  });
};

// Start up an HTTP/HTTPS server
exports.run = function (port, middlewares) {
  exports._run(function startHttpServer (app, port) {
    return app.listen(port);
  }, port, middlewares);
};

exports.runHttps = function (port, middlewares) {
  // Generate an HTTPS certificate
  before(function generateCertificate (done) {
    pem.createCertificate({days: 1, selfSigned: true}, function saveCertificate (err, keys) {
      this.certificate = keys;
      done(err);
    });
  });
  after(function cleanupCertificate () {
    delete this.certificate;
  });

  // Start the HTTPS server with said certificate
  exports._run(function startHttpsServer (app, port) {
    var server = https.createServer({
      key: this.certificate.serviceKey,
      cert: this.certificate.certificate
    }, app);
    server.listen(port);
    return server;
  }, port, middlewares);
};

// Start an nine-track server
exports._cleanupNineTrack = function (fixtureDir) {
  // after(function cleanupNineTrack (done) {
  //   rimraf(fixtureDir, done);
  // });
};
exports.runNineServer = function (port, options) {
  var nineTrackInstance = nineTrack(options);
  before(function exposeNineTrack () {
    this.nineTrack = nineTrackInstance;
  });
  after(function cleanup () {
    delete this.nineTrack;
  });
  exports.run(port, nineTrackInstance);
  exports._cleanupNineTrack(options.fixtureDir);
};
