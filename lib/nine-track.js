var assert = require('assert');
var crypto = require('crypto');
var url = require('url');
var _ = require('underscore');
var async = require('async');
var Store = require('fs-memory-store');
var request = require('request');
var Message = require('./message');

function NineTrack(options) {
  // Assert we received the expected options
  assert(options.url, '`nine-track` expected `options.url` but did not receive it');
  assert(options.fixtureDir, '`nine-track` expected `options.fixtureDir` but did not receive it');

  // Pre-emptively parse options
  var remoteUrl = options.url;
  if (typeof remoteUrl === 'string') {
    remoteUrl = url.parse(remoteUrl);
  }

  // Save remoteUrl and fixtureDir for later
  this.remoteUrl = remoteUrl;
  this.normalizeFn = options.normalizeFn;
  this.scrubFn = options.scrubFn;
  this.store = new Store(options.fixtureDir);
}
NineTrack.prototype = {
  startSeries: function (seriesKey) {
    assert.strictEqual(this.seriesKey, undefined, '`nineTrack.startSeries` has already been invoked. ' +
      'Please call `nineTrack.stopSeries` before starting a new one.');
    assert(seriesKey, '`nineTrack.startSeries` requires `seriesKey` to be defined. Please define it.');
    this.seriesKey = seriesKey;
    this.pastRequestKeys = [];
    this.isNewRecording = false;
  },
  stopSeries: function () {
    delete this.seriesKey;
    delete this.pastRequestKeys;
    delete this.isNewRecording;
  },

  getConnectionKey: function (conn) {
    // Generate an object representing the request
    var info = conn.getRequestInfo();

    // If we are in a series, add on past keys to our request
    // TODO: Add to `scrubFn` for saving to disk?
    if (this.seriesKey !== undefined) {
      info.headers['X-Nine-Track-Past-Keys'] = this.seriesKey + '=' + this.pastRequestKeys.join(';');
    }

    // Pass through scrubber to prevent excess info getting into hash
    if (this.scrubFn) {
      var _info = this.scrubFn({request: info});
      if (_info) {
        info = _info.request;
      }
    }

    // Normalize the info
    if (this.normalizeFn) {
      info = this.normalizeFn(info) || info;
    }

    // Stringify the info and hash it
    if (info.body && Buffer.isBuffer(info.body)) {
      info.body = info.body.toString('base64');
    }
    var json = JSON.stringify(info);
    var md5 = crypto.createHash('md5');
    md5.update(json);
    var hash = md5.digest('hex');

    // Compound method, url, and hash to generate the key
    // DEV: We truncate URL at 32 characters to prevent ENAMETOOLONG
    // https://github.com/uber/eight-track/issues/7
    var url = encodeURIComponent(info.url).substr(0, 32);
    return info.method + '_' + url + '_' + hash;
  },

  _serializeBody: function (obj) {
    // Serialize the buffer for disk
    var _buff = obj.body;
    var bodyEncoding = 'utf8';
    var body = _buff.toString(bodyEncoding);

    // If the buffer is not utf8-friendly, serialize it to base64
    var testBuffer = new Buffer(body, bodyEncoding);
    if (testBuffer.length !== _buff.length) {
      bodyEncoding = 'base64';
      body = _buff.toString(bodyEncoding);
    }

    // Save the new body
    var retObj = _.omit(obj, 'body');
    retObj.bodyEncoding = bodyEncoding;
    retObj.body = body;

    // Return our object ready for serialization
    return retObj;
  },
  getConnection: function (key, cb) {
    this.store.get(key, function handleGet (err, info) {
      // If there was an error, callback with it
      if (err) {
        return cb(err);
      // Otherwise, if there was no info, callback with it
      } else if (!info) {
        return cb(err, info);
      }

      // Otherwise, de-serialize the buffer
      var _body = info.response.body;
      info.response.body = _body.length ? new Buffer(_body, info.response.bodyEncoding || 'utf8') : '';
      cb(null, info);
    });
  },
  saveConnection: function (key, _info, cb) {
    // Serialize our information
    var info = _.clone(_info);
    info.request = this._serializeBody(info.request);
    info.response = this._serializeBody(info.response);

    // If there is a scrubber, pass it through
    if (this.scrubFn) {
      info = this.scrubFn(info) || info;
    }

    // Save our serialized info
    this.store.set(key, info, cb);
  },

  createRemoteRequest: function (localReqMsg) {
    // Prepate the URL for headers logic
    // TODO: It feels like URL extension deserves to be its own node module
    // http://nodejs.org/api/url.html#url_url
    /*
      headers: local (+ remote host)
      protocol: remote,
      hostname: remote,
      port: remote,
      pathname: remote + local, (e.g. /abc + /def -> /abc/def)
      query: local
    */
    var localReq = localReqMsg.connection;
    var localUrl = url.parse(localReq.url);
    var _url = _.pick(this.remoteUrl, 'protocol', 'hostname', 'port');

    // If the remotePathname is a `/`, convert it to a ''.
    //   Node decides that all URLs deserve a `pathname` even when not provided
    var remotePathname = this.remoteUrl.pathname || '';
    if (remotePathname === '/') {
      remotePathname = '';
    }

    // DEV: We use string concatenation because we cannot predict how all servers are designed
    _url.pathname = remotePathname + (localUrl.pathname || '');
    _url.search = localUrl.query;

    // Set up headers
    var headers = localReq.headers;

    // If there is a host, use our new host for the request
    if (headers.host) {
      headers = _.clone(headers);
      delete headers.host;

      // Logic taken from https://github.com/mikeal/request/blob/v2.30.1/request.js#L193-L202
      headers.host = _url.hostname;
      if (_url.port) {
        if (!(_url.port === 80 && _url.protocol === 'http:') &&
            !(_url.port === 443 && _url.protocol === 'https:')) {
          headers.host += ':' + _url.port;
        }
      }
    }

    // Forward the original request to the new server
    var remoteReq = request({
      // DEV: Missing `httpVersion`
      headers: headers,
      // DEV: request does not support `trailers`
      trailers: localReq.trailers,
      method: localReq.method,
      url: url.format(_url),
      body: localReqMsg.body,
      // DEV: This is probably an indication that we should no longer use `request`. See #19.
      followRedirect: false
    });
    return remoteReq;
  },

  forwardRequest: function (localReq, callback) {
    // Create a connection to pass around between methods
    // DEV: This cannot be placed inside the waterfall since in 0.8, we miss data + end events
    var localReqMsg = new Message(localReq);
    var requestKey, remoteResMsg, connInfo;

    function sendConnInfo(connInfo) {
      return callback(null, connInfo.response, connInfo.response.body);
    }

    // Create marker for request loading before we get to `loadIncomingBody` listener
    var localReqLoaded = false;
    localReqMsg.on('loaded', function updateLoadedState () {
      localReqLoaded = true;
    });

    var that = this;
    async.waterfall([
      function loadIncomingBody (cb) {
        if (localReqLoaded) {
          return process.nextTick(cb);
        }
        localReqMsg.on('loaded', cb);
      },
      function findSavedConnection (cb) {
        requestKey = that.getConnectionKey(localReqMsg);
        if (that.pastRequestKeys) {
          that.pastRequestKeys.push(requestKey);
        }
        that.getConnection(requestKey, cb);
      },
      function createRemoteReq (connInfo, cb) {
        // If we successfully found the info, reply with it
        if (connInfo) {
          return sendConnInfo(connInfo);
        }

        // If we are inside of a series
        // DEV: Reminder that we are inside of a new request being made since the `connInfo` would have indicated otherwise
        if (that.seriesKey) {
          // If this is the first request, mark it as a new recording
          if (that.pastRequestKeys.length <= 1) {
            that.isNewRecording = true;
          // Otherwise, if this is not a new recording, consider our series corrupted
          } else if (that.isNewRecording !== true) {
            // Clean up all past fixtures in this chain
            // DEV: We trim off the last item since that is the current fixture that we attempted to resolve
            return that.removeFixtures(that.pastRequestKeys.slice(0, -1), function handleRemoval (err) {
              // Prepare our message
              var msg = '`nineTrack` found a corrupted series while playing back HTTP fixtures. ' +
                'To resolve this, we have removed the fixtures from the start of this series. ' +
                'Unfortunately, we must raise an error and require you to re-run your test suite. ' +
                'Otherwise, your database and tests would be in an inconsistent state between this and future runs.';

              // If there was an error, log our message and callback with the error
              if (err) {
                console.error(msg);
                cb(err);
              // Otherwise, callback with the message as an error
              } else {
                cb(new Error(msg));
              }
            });
          }
        }

        // Forward the original request to the new server
        var remoteReq = that.createRemoteRequest(localReqMsg);

        // When we receive a response, load the response body
        remoteReq.on('error', cb);
        remoteReq.on('response', function handleRes (remoteRes) {
          remoteResMsg = new Message(remoteRes);
          remoteResMsg.on('loaded', cb);
        });
      },
      function saveIncomingRemote (cb) {
        // Save the incoming request and remote response info
        connInfo = {
          request: localReqMsg.getRequestInfo(),
          response: remoteResMsg.getResponseInfo()
        };
        that.saveConnection(requestKey, connInfo, cb);
      }
    ], function handleResponseInfo (err) {
      if (err) {
        return callback(err);
      } else {
        return sendConnInfo(connInfo);
      }
    });
  },

  handleConnection: function (localReq, localRes) {
    // DEV: remoteRes is not request's response but an internal response format
    this.forwardRequest(localReq, function handleForwardedResponse (err, remoteRes, remoteBody) {
      // If there was an error, emit it
      if (err) {
        err.req = localReq;
        err.res = localRes;
        // process.emit('uncaughtException', err);
        localRes.end();
      // Otherwise, send the response
      } else {
        localRes.writeHead(remoteRes.statusCode, remoteRes.headers);
        localRes.write(remoteBody);
        localRes.end();
      }
    });
  },

  removeFixtures: function (keys, callback) {
    var that = this;
    console.log('deleting', keys);
    async.forEach(keys, function deleteFixture (key, cb) {
      that.store['delete'](key, cb);
    }, callback);
  }
};

function middlewareCreator(options) {
  // Create a new nine track for our middleware
  var nineTrack = new NineTrack(options);

  // Define a middleware to handle requests `(req, res)`
  function nineTrackMiddleware(localReq, localRes) {
    nineTrack.handleConnection(localReq, localRes);
  }

  // Add on prototype methods (e.g. `forwardRequest`)
  var keys = Object.getOwnPropertyNames(NineTrack.prototype);
  keys.forEach(function bindNineTrackMethod (key) {
    nineTrackMiddleware[key] = function executeNineTrackMethod () {
      nineTrack[key].apply(nineTrack, arguments);
    };
  });

  // Return the middleware
  return nineTrackMiddleware;
}

// Expose class on top of middlewareCreator
middlewareCreator.NineTrack = NineTrack;
middlewareCreator.Message = Message;

// Expose our middleware constructor
module.exports = middlewareCreator;
