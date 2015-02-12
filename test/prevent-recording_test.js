var expect = require('chai').expect;
var nineTrack = require('../');
var httpUtils = require('./utils/http');
var serverUtils = require('./utils/server');

// DEV: This tests that we can sanitize saved data for public visibility
describe('A server being proxied by a frozen `nine-track`', function () {
  var fixtureDir = __dirname + '/test-files/prevent-recording';
  serverUtils.run(1337, function startServer (req, res) {
    res.send(req.path);
  });
  var _app;
  before(function startServer () {
    // Initialize our nineTrack
    this.nineTrack = nineTrack({
      fixtureDir: fixtureDir,
      preventRecording: true,
      url: 'http://localhost:1337'
    });

    // Generate our server
    var that = this;
    var startServerFn = serverUtils._startServer(function startHttpServer (app, port) {
      return app.listen(port);
    }, 1338, [
      function catchErr (req, res, next) {
        req.on('error', function handleErr (err) {
          that.reqErr = err;
        });
        next();
      },
      this.nineTrack
    ]);
    _app = startServerFn.call(this);
  });
  after(function cleanup (done) {
    delete this.reqErr;
    _app.close(done);
  });
  serverUtils._cleanupNineTrack(fixtureDir);

  describe('when requested at a recorded endpoint', function () {
    httpUtils.save('http://localhost:1338/hello');

    it('plays back the request', function () {
      expect(this.err).to.equal(null);
      expect(this.res.statusCode).to.equal(200);
      expect(this.body).to.equal('/hello');
    });
  });

  describe('when requested at a unrecorded endpoint', function () {
    it('emits an error', function () {
      expect(this.reqErr).to.an.instanceof(Error);
    });
  });
});
