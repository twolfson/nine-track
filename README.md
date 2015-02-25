# nine-track [![Build status](https://travis-ci.org/twolfson/nine-track.png?branch=master)](https://travis-ci.org/twolfson/nine-track)

Record and playback HTTP requests

This is built to make testing against third party services a breeze. No longer will your test suite fail because an external service is down.

> `nine-track` is inspired by [`cassette`][] and [`vcr`][]. This is a fork of [`eight-track`][] due to permissioning issues.

[`cassette`]: https://github.com/uber/cassette
[`vcr`]: https://rubygems.org/gems/vcr
[`eight-track`]: https://github.com/uber/eight-track

## Getting Started
Install the module with: `npm install nine-track`

```js
// Start up a basic applciation
var express = require('express');
var nineTrack = require('nine-track');
var request = require('request');
express().use(function (req, res) {
  console.log('Pinged!');
  res.send('Hello World!');
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
express().use(nineTrack({
  url: 'http://localhost:1337',
  fixtureDir: 'directory/to/save/responses'
})).listen(1338);

// Hits original server, triggering a `console.log('Pinged!')` and 'Hello World!' response
request('http://localhost:1338/', console.log);

// Hits saved response but still receieves 'Hello World!' response
request('http://localhost:1338/', console.log);
```

## Documentation
`nine-track` exposes `nineTrack` as its `module.exports`.

### `nineTrack(options)`
Middleware creator for new `nineTrack's`. This *is not* a constructor.

- options `Object` - Container for parameters
    - url `String|Object` - URL of a server to proxy to
        - If it is a string, it should be the base URL of a server
        - If it is an object, it should be parameters for [`url.format`][]
    - fixtureDir `String` - Path to load/save HTTP responses
        - Files will be saved with the format `{{method}}_{{encodedUrl}}_{{hashOfRequestContent}}.json`
        - An example filename is `GET_%2F_658e61f2a6b2f1ae4c127e53f28dfecd.json`
    - preventRecording `Boolean` - Flag to throw errors if a request has not been recorded previously
        - By default, this is `false`; no errors will be thrown
        - This can be useful in CI to reveal missing fixtures
    - normalizeFn `Function` - Function to adjust `request's` save location signature
        - If you would like to make two requests resolve from the same response file, this is how.
        - The function signature should be `function (info)` and can either mutate the `info` or return a fresh object
        - info `Object` - Container for `request` information
            - httpVersion `String` - HTTP version received from `request` (e.g. `1.0`, `1.1`)
            - headers `Object` - Headers received by `request`
                - An example would be `{"host": "locahost:1337"}`
            - trailers `Object` - Trailers received by `request`
            - method `String` - HTTP method that was used (e.g. `GET`, `POST`)
            - url `String` - Pathname that `request` arrived from
                - An example would be `/`
            - body `Buffer` - Buffered body that was written to `request`
        - Existing `normalizeFn` libraries (e.g. `multipart/form-data` can be found below)
    - scrubFn `Function` - Functon to adjust `request's` and `response's` before saving to disk
        - If you would like to sanitize information from JSON files before saving, this is how.
        - The function signature should be `function (info)` and can either mutate `info` or return a fresh object
        - info `Object` - Container for `request` and `response` information
          - request `Object` - Container for `request` information
            - Same information as present in `normalizeFn.info`
          - response `Object` - Container for `response` information
            - httpVersion `String` - HTTP version received from `response` (e.g. `1.0`, `1.1`)
            - headers `Object` - Headers received by `response`
                - An example would be `{"x-powered-by": "Express"}`
            - trailers `Object` - Trailers received by `response`
            - statusCode `Number` - Status code received from response
                - An example would be `200`
            - body `Buffer` - Body received from response
                - If this is adjusted, we will automatically correct the `Content-Length` response header

[`url.format`]: http://nodejs.org/api/url.html#url_url_format_urlobj

`nineTrack` returns a middleware with the signature `function (req, res)`

```js
// Example of string url
nineTrack({
  url: 'http://localhost:1337',
  fixtureDir: 'directory/to/save/responses'
});

// Example of object url
nineTrack({
  url: {
    protocol: 'http:',
    hostname: 'localhost',
    port: 1337
  },
  fixtureDir: 'directory/to/save/responses'
});
```

If you need to buffer the data before passing it off to `nine-track` that is supported as well.
The requirement is that you record the data as a `Buffer` or `String` to `req.body`.

#### `normalizeFn` libraries
- `multipart/form-data` - Ignore randomly generated boundaries and consolidate similar `multipart/form-data` requests
    - Website: https://github.com/twolfson/nine-track-normalize-multipart

### `nineTrack.forwardRequest(req, cb)`
Forward an incoming HTTP request in a [`mikeal/request`][]-like format.

- req `http.IncomingMessage` - Inbound request to an HTTP server (e.g. from `http.createServer`)
    - Documentation: http://nodejs.org/api/http.html#http_http_incomingmessage
- cb `Function` - Callback function with `(err, res, body)` signature
    - err `Error` - HTTP error if any occurred (e.g. `ECONNREFUSED`)
    - res `Object` - Container that looks like an HTTP object but simiplified due to saving to disk
        - httpVersion `String` - HTTP version received from external server response (e.g. `1.0`, `1.1`)
        - headers `Object` - Headers received by response
        - trailers `Object` - Trailers received by response
        - statusCode `Number` - Status code received from external server response
        - body `Buffer` - Buffered body that was written to response
    - body `Buffer` - Sugar variable for `res.body`

[`mikeal/request`]: https://github.com/mikeal/request

### `nineTrack.startSeries(key)`
Begin a series of requests that rely on each other. We will compound past keys onto the hash generated for the current request. This allows for testing items like:

1. Retrieve item, verify non-existence
2. Create item
3. Retrieve item, verify existence

Normally, we would be unable to test this since steps (1) and (3) have the same signature. However, by compounding the previous request keys into our key, we can handle this.

**You must remember to run `stopSeries()` at the end of a series. If you do not, it will pollute future requests and make your tests brittle.**

- key `String` - Namespace to use in hashing our requests
    - This is practical to prevent collisions of similar tests that rely on the same request (e.g. retrieving all resources)

> For your convenience, if a series is corrupted (e.g. a request signature changes), then we will attempt clean up the series and require a re-run of your test suite. We do not try to re-run with saved information since states could be inconsistent.

```js
var nineTrackInstance = nineTrack({
  url: {
    protocol: 'http:',
    hostname: 'localhost',
    port: 1337
  },
  fixtureDir: 'directory/to/save/responses'
});
nineTrackInstance.startSeries('create-test');
// Run get, create, get as requests in series
nineTrackInstance.stopSeries();
```

### `nineTrack.stopSeries()`
Stop a series of requests. This will remove the chaining effect from `startSeries` and reset `nineTrack` to default behavior.

## Examples
### Proxy server with subpath
`nine-track` can talk to servers that are behind a specific path

```js
// Start up a server that echoes our path
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
```

### Normalizing requests
Sometimes requests have unpredictable an header or body (e.g. `timestamp`). We can leverage `normalizeFn` to make our request hashes consistent to force the same look up.

**This does not affect outgoing request data.**

```js
// Start up a server that echoes our path
express().use(function (req, res) {
  res.send(req.path);
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
express().use(nineTrack({
  url: 'http://localhost:1337',
  fixtureDir: 'directory/to/save/responses',
  normalizeFn: function (info) {
    if (info.headers['X-Timestamp']) {
      // Normalize all timestamps to a consistent number
      info.headers['X-Timestamp'] = '2015-02-12T00:00:00.000Z';
    }
  }
})).listen(1338);

// On first run, makes valid request
// On future runs, repeats same response
request({
  url: 'http://localhost:1338/world',
  headers: {
    'X-Timestamp': (new Date()).toISOString()
  }
}, console.log);
```

### Scrubbing requests
In some repositories, there is sensitive data being sent/received in requests/responses that you would like to be sanitized. `scrubFn` takes request/response information and removes it from the saved content and hash.

```js
// Start up a server that echoes our path
express().use(bodyParser.urlencoded()).use(function (req, res) {
  res.send(req.body.sensitive_token === 'password');
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
express().use(nineTrack({
  url: 'http://localhost:1337',
  fixtureDir: 'directory/to/save/responses',
  scrubFn: function (info) {
    var bodyObj = querystring.parse(info.request.body.toString('utf8'));
    if (bodyObj.sensitive_token) {
      // Normalize all sensitive token to a hidden value
      bodyObj.sensitive_token = '****';
      info.request.body = querystring.stringify(bodyObj);
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
}, console.log); // true

// Saved to disk
/*
"request": {
  "body": "sensitive_token=****"
}
*/
```

### Modifying response data
Occasionally, we want to reply with near accurate data but adjust it slightly (e.g. return an empty list, reproduce an encoding issue). For this example, we will leverage `forwardRequest` to return an adjusted list.

```js
// Start up a server that echoes our path
express().use(function (req, res) {
  res.json({items: ['a', 'b', 'c']});
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
var nineTrackFn = nineTrack({
  url: 'http://localhost:1337',
  fixtureDir: 'directory/to/save/responses'
});
express().use(function (localReq, localRes) {
  nineTrackFn.forwardRequest(localReq, function (err, remoteRes, remoteBody) {
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
request('http://localhost:1338/world', console.log); // {items: ['a', 'b']}

// Saved on disk
/*
"response": {
  "body": "{\n  \"items\": [\n    \"a\",\n    \"b\",\n    \"c\"\n  ]\n}"
}
*/
```

### Prevent recording
In CI, it can be useful to prevent requests to remote servers since all fixtures should be saved by this point. In this example, we leverage `preventRecording` and the Travis CI environment variable to not allow new requests in Travis CI.

```js
// Start up a server that echoes our path
express().use(function (req, res) {
  res.json(req.path);
}).listen(1337);

// Create a server using a `nine-track` middleware to the original
express().use(nineTrack({
  url: 'http://localhost:1337',
  fixtureDir: 'directory/to/save/responses',
  preventRecording: !!process.env.TRAVIS
})).listen(1338);

request('http://localhost:1338/world', console.log);

// On an unsaved fixture in "Travis CI"
/*
events.js:72
        throw er; // Unhandled 'error' event
              ^
Error: Fixture not found for request "{"httpVersion":"1.1","headers":{"host":"localhost:1338","connection":"keep-alive"},"trailers":{},"method":"GET","url":"/world","body":""}"
    at createRemoteReq (/home/todd/github/nine-track/lib/nine-track.js:240:21)
    at fn (/home/todd/github/nine-track/node_modules/async/lib/async.js:582:34)
    at Object._onImmediate (/home/todd/github/nine-track/node_modules/async/lib/async.js:498:34)
    at processImmediate [as _immediateCallback] (timers.js:354:15)
*/
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint via `npm run lint` and test via `npm test`.

## License
All work up to and including `87a024b` is owned by Uber under the [MIT license][].

[MIT license]: https://github.com/twolfson/nine-track/blob/87a024ba47584311dc3d5bc10e11682c1fbd7bdf/LICENSE-MIT

After that commit, all modifications to the work have been released under the [UNLICENSE][] to the public domain.

[UNLICENSE]: UNLICENSE
