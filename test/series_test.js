// Load in our dependencies
var expect = require('chai').expect;
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
    // TODO: Create method
    // TODO: Require `key` for our series to prevent collisions between tests ;D
    // TODO: If `key` is already present when running another test, throw a complaint
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

      it('clears our storage', function () {
        // DEV: This is broken because we are not doing our time series magic yet
        expect(this.err).to.equal(null);
        expect(this.res.statusCode).to.equal(200);
        expect(JSON.parse(this.body)).to.deep.equal([]);
      });

      describe('when we replay the series of events "in another run"', function () {
        before(function restartSeries () {
          this.nineTrack.stopSeries();
          this.nineTrack.startSeries('series-test');
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
        before(function restartSeries () {
          this.nineTrack.stopSeries();
          this.nineTrack.startSeries('series-separate-test');
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

describe('A CRUD server being proxied via a series `nine-track`', function () {
  describe('when a request in the chain has been invalidated', function () {
    // First set of requests
    httpUtils.save({
      url: 'http://localhost:1338/items/save',
      qs: {
        hello: 'world'
      }
    });
    httpUtils.save('http://localhost:1338/items');
    httpUtils.save('http://localhost:1338/items/clear');
    httpUtils.save('http://localhost:1338/items');

    // Second set of requests
    httpUtils.save({
      url: 'http://localhost:1338/items/save',
      qs: {
        hello: 'world'
      }
    });
    httpUtils.save('http://localhost:1338/items');
    httpUtils.save('http://localhost:1338/items/clear2');
    httpUtils.save('http://localhost:1338/items');

    it.skip('removes invalid fixtures in our chain', function () {

    });
    it.skip('halts the test by throwing an error', function () {

    });

    describe('when we run our test again', function () {
      httpUtils.save({
        url: 'http://localhost:1338/items/save',
        qs: {
          hello: 'world'
        }
      });
      httpUtils.save('http://localhost:1338/items');
      httpUtils.save('http://localhost:1338/items/clear2');
      httpUtils.save('http://localhost:1338/items');

      it.skip('generates a new set of fixtures', function () {
      });

      describe('when run again "in another run"', function () {
        httpUtils.save({
          url: 'http://localhost:1338/items/save',
          qs: {
            hello: 'world'
          }
        });
        httpUtils.save('http://localhost:1338/items');
        httpUtils.save('http://localhost:1338/items/clear2');
        httpUtils.save('http://localhost:1338/items');

        it.skip('does not re-request', function () {

        });
      });
    });
  });
});
