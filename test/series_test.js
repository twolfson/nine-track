// Load in our dependencies
var fs = require('fs');
var async = require('async');
var expect = require('chai').expect;
var request = require('request');
var nineTrack = require('../');
var httpUtils = require('./utils/http');
var serverUtils = require('./utils/server');

// Start our tests
describe('A CRUD server that is being proxied by a series-based `nine-track`', function () {
  var storage = [];
  serverUtils.run(1337, function startCrudServer (req, res, next) {
    // If someone is retrieiving all our items, send them
    // DEV: These methods are intentionally simplified for less code
    if (req.path === '/items') {
      return res.send(storage);
    // Otherwise, if someone is adding a new item, save it
    } else if (req.path === '/items/save') {
      storage.push(req.query);
      return res.send('OK');
    // Otherwise, if someone is clearing out our db, clear it
    } else if (req.path === '/items/clear') {
      storage = [];
      return res.send('OK');
    // Otherwise, send a 404
    } else {
      return next();
    }
  });
  serverUtils.runNineServer(1338, {
    fixtureDir: __dirname + '/actual-files/series',
    url: 'http://localhost:1337'
  });
  before(function enableSeries () {
    this.nineTrack.startSeries('series-test');
  });

  describe('when saving a new item and retrieving our items', function () {
    httpUtils.save({
      url: 'http://localhost:1338/items/save',
      qs: {
        hello: 'world'
      }
    });
    httpUtils.save('http://localhost:1338/items');

    it('saves the new item', function () {
      expect(this.err).to.equal(null);
      expect(this.res.statusCode).to.equal(200);
      expect(JSON.parse(this.body)).to.deep.equal([{
        hello: 'world'
      }]);
    });

    describe('when clearing the items and retrieving our items', function () {
      httpUtils.save('http://localhost:1338/items/clear');
      httpUtils.save('http://localhost:1338/items');
      before(function stopSeries () {
        this.nineTrack.stopSeries();
      });

      it('clears our storage', function () {
        // DEV: This is broken because we are not doing our time series magic yet
        expect(this.err).to.equal(null);
        expect(this.res.statusCode).to.equal(200);
        expect(JSON.parse(this.body)).to.deep.equal([]);
      });

      describe('when we replay the series of events "in another run"', function () {
        before(function restartSeries () {
          this.nineTrack.startSeries('series-test');
        });
        after(function stopSeries () {
          this.nineTrack.stopSeries();
        });
        httpUtils.save({
          url: 'http://localhost:1338/items/save',
          qs: {
            hello: 'world'
          }
        });
        httpUtils.save('http://localhost:1338/items');
        httpUtils.save('http://localhost:1338/items/clear');
        httpUtils.save('http://localhost:1338/items');

        it('does not re-request our server', function () {
          expect(this.requests[1337]).to.have.property('length', 4);
        });
      });

      describe('when we replay the first requests with a separate series key', function () {
        before(function startNewSeries () {
          this.nineTrack.startSeries('series-separate-test');
        });
        after(function stopSeries () {
          this.nineTrack.stopSeries();
        });

        httpUtils.save({
          url: 'http://localhost:1338/items/save',
          qs: {
            hello: 'world'
          }
        });
        httpUtils.save('http://localhost:1338/items');
        httpUtils.save('http://localhost:1338/items/clear');
        httpUtils.save('http://localhost:1338/items');

        it('makes the original requests again', function () {
          expect(this.requests[1337]).to.have.property('length', 8);
        });
      });
    });
  });
});

describe('A server being proxied via a series `nine-track`', function () {
  var fixtureDir = __dirname + '/actual-files/series-corrupt';
  serverUtils.run(1337, function startServer (req, res) {
    res.send(req.path);
  });
  var _app;
  before(function startServer () {
    // Initialize our nineTrack
    this.nineTrack = nineTrack({
      fixtureDir: fixtureDir,
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
  after(function deleteServer (done) {
    _app.close(done);
  });
  serverUtils._cleanupNineTrack(fixtureDir);

  describe('when a request in the chain has been invalidated', function () {
    before(function enableSeries () {
      this.nineTrack.startSeries('series-corrupt');
    });
    // First set of requests
    httpUtils.save('http://localhost:1338/hello');
    httpUtils.save('http://localhost:1338/world');
    before(function restartSeries () {
      this.nineTrack.stopSeries();
      this.nineTrack.startSeries('series-corrupt');
    });

    // Second set of requests
    httpUtils.save('http://localhost:1338/hello');
    httpUtils.save('http://localhost:1338/world2');
    before(function stopSeries () {
      this.nineTrack.stopSeries();
    });

    it('removes invalid fixtures in the head of our chain', function () {
      var files = fs.readdirSync(fixtureDir);
      expect(files).to.have.property('length', 1);
    });
    it('halts the test by throwing an error', function () {
      expect(this.reqErr).to.an.instanceof(Error);
    });

    describe('when we run our test again', function () {
      before(function restartSeries () {
        this.nineTrack.startSeries('series-corrupt');
      });
      httpUtils.save('http://localhost:1338/hello');
      httpUtils.save('http://localhost:1338/world2');
      before(function stopSeries () {
        this.nineTrack.stopSeries();
      });

      it('generates a new set of fixtures', function () {
        expect(this.err).to.equal(null);
        expect(this.res.statusCode).to.equal(200);
        expect(this.body).to.equal('/world2');
      });

      describe('when run again "in another run"', function () {
        before(function startSeries () {
          this.nineTrack.startSeries('series-corrupt');
        });

        httpUtils.save('http://localhost:1338/hello');
        httpUtils.save('http://localhost:1338/world2');

        it('does not re-request', function () {
          // hello + world for first non-corrupt run
          // hello + world2 for second run after cleaning
          expect(this.requests[1337]).to.have.property('length', 4);
        });
      });
    });
  });
});

// DEV: This is a regression test for https://github.com/twolfson/nine-track/issues/8
describe('A server being proxied via a series `nine-track`', function () {
  var fixtureDir = __dirname + '/actual-files/series-parallel';
  serverUtils.run(1337, function startServer (req, res) {
    res.send(req.path);
  });
  serverUtils.runNineServer(1338, {
    fixtureDir: fixtureDir,
    url: 'http://localhost:1337'
  });
  before(function enableSeries () {
    this.nineTrack.startSeries('series-parallel');
  });

  describe('when receiving 2 parallel requests', function () {
    before(function parallelRequests (done) {
      async.parallel([
        function firstRequest (cb) {
          request('http://localhost:1338/hello', cb);
        },
        function secondRequest (cb) {
          request('http://localhost:1338/hello2', cb);
        }
      ], done);
    });

    it('has no errors', function () {
      // DEV: Regression was that we would be seeing both keys and considering request old
    });

    it('saves with hashes received at time of request', function () {
      var files = fs.readdirSync(fixtureDir);
      expect(files).to.have.property('length', 2);
      var firstJson = JSON.parse(fs.readFileSync(fixtureDir + '/' + files[0], 'utf8'));
      var secondJson = JSON.parse(fs.readFileSync(fixtureDir + '/' + files[1], 'utf8'));
      if (firstJson.pastRequestKeys.length !== 0) {
        var tmpJson = firstJson;
        firstJson = secondJson;
        secondJson = tmpJson;
      }

      expect(firstJson.pastRequestKeys).to.deep.equal([]);
      expect(secondJson.pastRequestKeys).to.have.length(1);
      expect(secondJson.pastRequestKeys[0]).to.match(/Parallel request/);
    });
  });
});

// DEV: This is to make sure the parallel fix doesn't destroy all hashes
describe('A server being proxied via a series `nine-track`', function () {
  var fixtureDir = __dirname + '/actual-files/series-series';
  serverUtils.run(1337, function startServer (req, res) {
    res.send(req.path);
  });
  serverUtils.runNineServer(1338, {
    fixtureDir: fixtureDir,
    url: 'http://localhost:1337'
  });
  before(function enableSeries () {
    this.nineTrack.startSeries('series-series');
  });

  describe.only('when receiving 2 requests in series', function () {
    before(function parallelRequests (done) {
      async.series([
        function firstRequest (cb) {
          request('http://localhost:1338/hello', cb);
        },
        function secondRequest (cb) {
          request('http://localhost:1338/hello2', cb);
        }
      ], done);
    });

    it('has no errors', function () {
      // DEV: Regression was that we would be seeing both keys and considering request old
    });

    it('saves with hashes received at time of request', function () {
      var files = fs.readdirSync(fixtureDir);
      expect(files).to.have.property('length', 2);
      var firstJson = JSON.parse(fs.readFileSync(fixtureDir + '/' + files[0], 'utf8'));
      var secondJson = JSON.parse(fs.readFileSync(fixtureDir + '/' + files[1], 'utf8'));
      if (firstJson.pastRequestKeys.length !== 0) {
        var tmpJson = firstJson;
        firstJson = secondJson;
        secondJson = tmpJson;
      }

      expect(firstJson.pastRequestKeys).to.deep.equal([]);
      expect(secondJson.pastRequestKeys).to.have.length(1);
      expect(secondJson.pastRequestKeys[0]).to.not.match(/Parallel request/);
      expect(secondJson.pastRequestKeys[0]).to.match(/^GET_%2Fhello_/);
    });
  });
});
