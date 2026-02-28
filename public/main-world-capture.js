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

      var entry = { level: level, message: msg, timestamp: Date.now(), args: [] };

      // Capture stack trace for error/warn
      if (level === 'error' || level === 'warn') {
        try {
          entry.stack = new Error().stack.split('\n').slice(3).join('\n');
        } catch (e) {
          /* ignore */
        }
      }

      try {
        window.postMessage({ source: 'bugspotter-capture', type: 'console', data: entry }, '*');
      } catch (e) {
        /* ignore */
      }

      OC[level].apply(console, arguments);
    };
  });

  /* ---- Fetch capture ---- */
  var OF = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url ? input.url : '';
    var method = init && init.method ? init.method.toUpperCase() : 'GET';
    var start = Date.now();
    var body = init && init.body ? String(init.body).slice(0, 2048) : '';

    return OF.apply(this, arguments).then(
      function (response) {
        var entry = {
          url: url,
          method: method,
          status: response.status,
          statusText: response.statusText || '',
          duration: Date.now() - start,
          timestamp: start,
          headers: {},
          requestBody: body,
        };
        try {
          window.postMessage({ source: 'bugspotter-capture', type: 'network', data: entry }, '*');
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
          headers: {},
          requestBody: body,
          error: err.message || 'Network error',
        };
        try {
          window.postMessage({ source: 'bugspotter-capture', type: 'network', data: entry }, '*');
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

  XMLHttpRequest.prototype.open = function (m, u) {
    this._bs_method = (m || 'GET').toUpperCase();
    this._bs_url = u;
    this._bs_start = Date.now();
    return OX.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var xhr = this;
    xhr._bs_body = body ? String(body).slice(0, 2048) : '';

    xhr.addEventListener('loadend', function () {
      var entry = {
        url: xhr._bs_url || '',
        method: xhr._bs_method || 'GET',
        status: xhr.status,
        statusText: xhr.statusText || '',
        duration: Date.now() - (xhr._bs_start || Date.now()),
        timestamp: xhr._bs_start || Date.now(),
        headers: {},
        requestBody: xhr._bs_body || '',
      };
      try {
        window.postMessage({ source: 'bugspotter-capture', type: 'network', data: entry }, '*');
      } catch (e) {
        /* ignore */
      }
    });

    xhr.addEventListener('error', function () {
      var entry = {
        url: xhr._bs_url || '',
        method: xhr._bs_method || 'GET',
        status: 0,
        statusText: '',
        duration: Date.now() - (xhr._bs_start || Date.now()),
        timestamp: xhr._bs_start || Date.now(),
        headers: {},
        requestBody: xhr._bs_body || '',
        error: 'XHR error',
      };
      try {
        window.postMessage({ source: 'bugspotter-capture', type: 'network', data: entry }, '*');
      } catch (e) {
        /* ignore */
      }
    });

    return OS.apply(this, arguments);
  };
})();
