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

  describe('when requested', function () {
    httpUtils.save('http://localhost:1338/');

    it('replies with a 500 status code and its message', function () {
      expect(this.err).to.equal(null);
      expect(this.res.statusCode).to.equal(500);
      expect(this.body).to.equal('error');
    });

    describe('when requested again', function () {
      httpUtils.save('http://localhost:1338/');

      it('has the same status code', function () {
        expect(this.res.statusCode).to.equal(500);
      });

      it('does not double request', function () {
        expect(this.requests[1337]).to.have.property('length', 1);
      });
    });
  });
});
