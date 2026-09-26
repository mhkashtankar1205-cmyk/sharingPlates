/**
 * A small stand-in for Express's Router, so the route modules read like ordinary API routes.
 * Supports get/post/patch/delete with `:param` segments, `use()` for middleware and mounted routers,
 * `(req, res, next)` middleware, and async handlers that throw.
 */

function compile(path, prefix) {
  const keys = [];
  const pattern = path.replace(/\/$/, '').replace(/:(\w+)/g, (_, key) => (keys.push(key), '([^/]+)'));
  return { keys, regex: new RegExp(`^${pattern}${prefix ? '(?=/|$)' : '/?$'}`) };
}

export function Router() {
  const layers = [];
  const route = (method) => (path, ...handlers) => {
    layers.push({ method, handlers, ...compile(path, false) });
    return router;
  };

  const router = {
    get: route('GET'),
    post: route('POST'),
    patch: route('PATCH'),
    delete: route('DELETE'),
    use(path, ...handlers) {
      if (typeof path !== 'string') [path, handlers] = ['/', [path, ...handlers]];
      layers.push({ method: null, handlers, ...compile(path, true) });
      return router;
    },

    /** Runs the first matching route. Resolves true once a handler has sent a response. */
    async run(req, res, path) {
      for (const layer of layers) {
        if (layer.method && layer.method !== req.method) continue;
        const match = layer.regex.exec(path);
        if (!match) continue;
        const params = Object.fromEntries(layer.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
        for (const handler of layer.handlers) {
          req.params = params;
          if (handler.run) await handler.run(req, res, path.slice(match[0].length) || '/');
          else if (handler.length >= 3) await new Promise((resolve, reject) => handler(req, res, (err) => (err ? reject(err) : resolve())));
          else await handler(req, res);
          if (res.finished) return true;
        }
      }
      return false;
    },
  };
  return router;
}

/** Response object with the parts of Express's API the routes use. The session "cookie" is handed back to the caller. */
export function createResponse() {
  const res = {
    statusCode: 200,
    body: null,
    finished: false,
    session: undefined, // new session token, or null when logged out
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      res.finished = true;
      return res;
    },
    end() {
      res.finished = true;
      return res;
    },
    cookie(_name, value) {
      res.session = value;
    },
    clearCookie() {
      res.session = null;
    },
  };
  return res;
}
