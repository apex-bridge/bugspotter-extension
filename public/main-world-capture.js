/**
 * BugSpotter main-world capture script.
 * Runs in the PAGE's JavaScript context (not the extension's isolated world).
 * Patches console, fetch, and XHR to capture logs and network requests,
 * then relays them via window.postMessage to the isolated-world content script.
 *
 * This file is loaded via <script src="..."> from the content script,
 * NOT as inline code (inline scripts are blocked by Chrome MV3 CSP).
 */
(function () {
  if (window.__bugspotter_injected) return;
  window.__bugspotter_injected = true;

  /* ---- Deduplication for browser-generated errors ---- */
  var _lastErrorMsg = '';
  var _lastErrorTime = 0;
  var DEDUP_WINDOW_MS = 2000; // suppress identical error messages within 2s

  function isDuplicateError(msg) {
    var now = Date.now();
    if (msg === _lastErrorMsg && now - _lastErrorTime < DEDUP_WINDOW_MS) return true;
    _lastErrorMsg = msg;
    _lastErrorTime = now;
    return false;
  }

  /* ---- Console capture ---- */
  var OC = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      var msg = args
        .map(function (a) {
          if (a === null) return 'null';
          if (a === undefined) return 'undefined';
          if (typeof a === 'object') {
            try {
              return JSON.stringify(a);
            } catch (e) {
              return String(a);
            }
          }
          return String(a);
        })
        .join(' ');

      // Skip BugSpotter's own internal logs (except errors)
      if (level !== 'error' && msg.indexOf('[BugSpotter]') === 0) {
        OC[level].apply(console, arguments);
        return;
      }

      // Capture raw args for richer debugging. JSON round-trip each arg
      // to avoid structured clone failures on DOM nodes, functions, etc.
      var safeArgs = args.map(function (a) {
        if (a === null || a === undefined || typeof a !== 'object') return a;
        try {
          return JSON.parse(JSON.stringify(a));
        } catch (e) {
          return String(a);
        }
      });
      var entry = { level: level, message: msg, timestamp: Date.now(), args: safeArgs };

      // Capture stack trace for error/warn
      if (level === 'error' || level === 'warn') {
        try {
          entry.stack = new Error().stack.split('\n').slice(3).join('\n');
        } catch (e) {
          /* ignore */
        }
      }

      try {
        window.postMessage({ source: 'bugspotter-capture', type: 'console', data: entry }, window.location.origin);
      } catch (e) {
        /* ignore */
      }

      OC[level].apply(console, arguments);
    };
  });

  /* ---- console.assert capture ---- */
  var OA = console.assert;
  console.assert = function (condition) {
    if (!condition) {
      var args = Array.prototype.slice.call(arguments, 1);
      var msg = 'Assertion failed';
      if (args.length > 0) {
        msg += ': ' + args.map(function (a) {
          if (a === null) return 'null';
          if (a === undefined) return 'undefined';
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch (e) { return String(a); }
          }
          return String(a);
        }).join(' ');
      }
      var entry = { level: 'error', message: msg, timestamp: Date.now(), args: [] };
      try {
        entry.stack = new Error().stack.split('\n').slice(2).join('\n');
      } catch (e) { /* ignore */ }
      try {
        window.postMessage({ source: 'bugspotter-capture', type: 'console', data: entry }, window.location.origin);
      } catch (e) { /* ignore */ }
    }
    OA.apply(console, arguments);
  };

  /* ---- Fetch capture ---- */
  var OF = window.fetch;
  window.fetch = function (input, init) {
    // Handle string, URL, and Request inputs
    var url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input && typeof input === 'object') {
      url = typeof input.href === 'string' ? input.href : (input.url || '');
    }
    var method = (init && init.method)
      ? init.method.toUpperCase()
      : (input && typeof input === 'object' && input.method)
        ? input.method.toUpperCase()
        : 'GET';
    var start = Date.now();
    var body = (init && typeof init.body === 'string') ? init.body.slice(0, 2048) : '';
    var reqHeaders = {};
    try {
      if (init && init.headers) {
        reqHeaders = Object.fromEntries(new Headers(init.headers).entries());
      }
    } catch (e) { /* ignore unparseable headers */ }

    return OF.apply(this, arguments).then(
      function (response) {
        var respHeaders = {};
        try {
          respHeaders = Object.fromEntries(response.headers.entries());
        } catch (e) { /* ignore */ }
        var entry = {
          url: url,
          method: method,
          status: response.status,
          statusText: response.statusText || '',
          duration: Date.now() - start,
          timestamp: start,
          headers: reqHeaders,
          responseHeaders: respHeaders,
          requestBody: body,
        };
        try {
          window.postMessage({ source: 'bugspotter-capture', type: 'network', data: entry }, window.location.origin);
        } catch (e) {
          /* ignore */
        }
        return response;
      },
      function (err) {
        var entry = {
          url: url,
          method: method,
          status: 0,
          statusText: '',
          duration: Date.now() - start,
          timestamp: start,
          headers: reqHeaders,
          requestBody: body,
          error: err.message || 'Network error',
        };
        try {
          window.postMessage({ source: 'bugspotter-capture', type: 'network', data: entry }, window.location.origin);
        } catch (e) {
          /* ignore */
        }
        throw err;
      },
    );
  };

  /* ---- XHR capture ---- */
  var OX = XMLHttpRequest.prototype.open;
  var OS = XMLHttpRequest.prototype.send;
  var OSH = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (m, u) {
    this._bs_method = (m || 'GET').toUpperCase();
    this._bs_url = String(u);
    this._bs_start = Date.now();
    this._bs_headers = {};
    return OX.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._bs_headers) {
      this._bs_headers[name] = value;
    }
    return OSH.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var xhr = this;
    xhr._bs_body = (typeof body === 'string') ? body.slice(0, 2048) : '';

    xhr.addEventListener('error', function () {
      xhr._bs_errored = true;
      var entry = {
        url: xhr._bs_url || '',
        method: xhr._bs_method || 'GET',
        status: 0,
        statusText: '',
        duration: Date.now() - (xhr._bs_start || Date.now()),
        timestamp: xhr._bs_start || Date.now(),
        headers: xhr._bs_headers || {},
        requestBody: xhr._bs_body || '',
        error: 'XHR error',
      };
      try {
        window.postMessage({ source: 'bugspotter-capture', type: 'network', data: entry }, window.location.origin);
      } catch (e) {
        /* ignore */
      }
    });

    xhr.addEventListener('loadend', function () {
      if (xhr._bs_errored) return; // Already reported by the error handler
      var respHeaders = {};
      try {
        var raw = xhr.getAllResponseHeaders();
        if (raw) {
          raw.trim().split('\r\n').forEach(function (line) {
            var idx = line.indexOf(':');
            if (idx > 0) respHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          });
        }
      } catch (e) { /* ignore */ }
      var entry = {
        url: xhr._bs_url || '',
        method: xhr._bs_method || 'GET',
        status: xhr.status,
        statusText: xhr.statusText || '',
        duration: Date.now() - (xhr._bs_start || Date.now()),
        timestamp: xhr._bs_start || Date.now(),
        headers: xhr._bs_headers || {},
        responseHeaders: respHeaders,
        requestBody: xhr._bs_body || '',
      };
      try {
        window.postMessage({ source: 'bugspotter-capture', type: 'network', data: entry }, window.location.origin);
      } catch (e) {
        /* ignore */
      }
    });

    return OS.apply(this, arguments);
  };

  /* ---- Browser-generated error capture ---- */

  // CSP violations (not reported via console.error)
  window.addEventListener('securitypolicyviolation', function (e) {
    var msg = 'CSP violation: ' + (e.violatedDirective || 'unknown directive');
    if (e.blockedURI) msg += ' — blocked ' + e.blockedURI;
    if (isDuplicateError(msg)) return;
    var entry = { level: 'error', message: msg, timestamp: Date.now(), args: [] };
    try {
      window.postMessage({ source: 'bugspotter-capture', type: 'console', data: entry }, window.location.origin);
    } catch (err) { /* ignore */ }
  });

  // Uncaught script errors AND resource load failures
  window.addEventListener('error', function (e) {
    var entry;
    if (e.message) {
      // Script error
      entry = {
        level: 'error',
        message: e.message,
        timestamp: Date.now(),
        args: [],
        stack: e.filename ? (e.filename + ':' + e.lineno + ':' + e.colno) : '',
      };
    } else if (e.target && e.target !== window) {
      // Resource load failure (img, script, link, etc.)
      var tag = (e.target.tagName || '').toLowerCase();
      var src = e.target.src || e.target.href || '';
      if (!src) return; // No useful info
      // Determine friendly resource type from element + URL
      var resType = tag;
      if (tag === 'link') {
        resType = /\.css(\?|$|#)/i.test(src) || (e.target.rel || '') === 'stylesheet'
          ? 'stylesheet' : 'resource';
      } else if (tag === 'img') {
        resType = 'image';
      } else if (tag === 'script' && /\.css(\?|$|#)/i.test(src)) {
        resType = 'stylesheet';
      }
      entry = {
        level: 'error',
        message: 'Failed to load ' + resType + ': ' + src,
        timestamp: Date.now(),
        args: [],
      };
    } else {
      return;
    }
    if (isDuplicateError(entry.message)) return;
    try {
      window.postMessage({ source: 'bugspotter-capture', type: 'console', data: entry }, window.location.origin);
    } catch (err) { /* ignore */ }
  }, true); // Use capture phase to catch resource errors that don't bubble

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    var msg = 'Unhandled rejection: ';
    if (reason instanceof Error) {
      msg += reason.message;
    } else if (typeof reason === 'string') {
      msg += reason;
    } else {
      try { msg += JSON.stringify(reason); } catch (err) { msg += String(reason); }
    }
    if (isDuplicateError(msg)) return;
    var entry = {
      level: 'error',
      message: msg,
      timestamp: Date.now(),
      args: [],
      stack: (reason instanceof Error && reason.stack) ? reason.stack : '',
    };
    try {
      window.postMessage({ source: 'bugspotter-capture', type: 'console', data: entry }, window.location.origin);
    } catch (err) { /* ignore */ }
  });
})();
