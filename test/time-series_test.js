// Load in our dependencies
var expect = require('chai').expect;
var httpUtils = require('./utils/http');
var serverUtils = require('./utils/server');

// Start our tests
describe('A CRUD server that is being proxied', function () {
  var storage = [];
  serverUtils.run(1337, function startCrudServer (req, res, next) {
    // If someone is retrieiving all our items, send them
    // DEV: These methods are intentionally simplified for less code
    if (req.url === '/items') {
      return res.send(storage);
    // Otherwise, if someone is adding a new item, save it
    } else if (req.url === '/items/save') {
      storage.push(req.query);
      return res.send('OK');
    // Otherwise, if someone is clearing out our db, clear it
    } else if (req.url === '/items/clear') {
      storage = [];
      return res.send('OK');
    // Otherwise, send a 404
    } else {
      return next();
    }
  });
  serverUtils.runNineServer(1338, {
    fixtureDir: __dirname + '/actual-files/time-series',
    url: 'http://localhost:1337'
  });

  describe('when saving a new item and retrieving our items', function () {
    httpUtils.save({
      url: 'http://localhost:1338/items/save',
      query: {
        hello: 'world'
      }
    });
    httpUtils.save({
      url: 'http://localhost:1338/items'
    });

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

      // TODO: It sucks that we cannot prevent double requests for re-use on the same server
      //   This is because any future requests will be building off of the same chain.
      //   Are there any alternatives to this? Like sending requests through another proxy only if we want it?

      it('clears our storage', function () {
        expect(this.err).to.equal(null);
        expect(this.res.statusCode).to.equal(200);
        expect(JSON.parse(this.body)).to.deep.equal([]);
      });
    });
  });
});
