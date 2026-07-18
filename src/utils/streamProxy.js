/**
 * Same-origin stream proxy helpers.
 *
 * Some CDNs (e.g. Shahid / edgenext) return HTTP 403 when the browser sends
 * Origin: https://your-app.netlify.app. Localhost is often allowed.
 * We rewrite external stream URLs to /api/proxy/https/host/path so requests
 * leave the CDN from Netlify's edge (no blocked browser Origin).
 *
 * Inverse problem: some CDNs (Medianova / Starzplay, etc.) allow browser CORS
 * (Access-Control-Allow-Origin: *) but block datacenter/edge IPs — so the
 * proxy gets 403 while a direct browser fetch works. Those hosts bypass proxy.
 */

const PROXY_PREFIX = '/api/proxy/';

/** Header names the edge proxy understands (channel config → upstream). */
export const PROXY_HEADER = {
  userAgent: 'X-Stream-User-Agent',
  referer: 'X-Stream-Referer',
  origin: 'X-Stream-Origin',
  authorization: 'X-Stream-Authorization',
};

/**
 * Hosts / suffixes that typically block Netlify edge IPs but allow browser
 * CORS. Requests go direct from the client instead of through /api/proxy.
 * Matched as exact host or suffix (e.g. starzplayarabia.com → *.starzplayarabia.com).
 */
const STATIC_PROXY_BYPASS_SUFFIXES = [
  'starzplayarabia.com',
  'starzplay.com',
  'mncdn.com',
  'medianova.com',
  // Common MNCDN edge host patterns
  'mncdn.net',
];

/** Session-learned hosts that returned 403 via proxy (auto-bypass). */
const sessionBypassHosts = new Set();

function envFlag(name) {
  try {
    return import.meta?.env?.[name];
  } catch {
    return undefined;
  }
}

/** True when we should route media through the edge proxy (global switch). */
export function shouldUseStreamProxy() {
  if (typeof window === 'undefined') return false;
  // Explicit override
  if (envFlag('VITE_FORCE_PROXY') === 'true') return true;
  if (envFlag('VITE_FORCE_PROXY') === 'false') return false;

  const host = window.location.hostname;
  // Local dev Origin is usually allowed by CDNs — skip proxy bandwidth
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return false;
  }
  return true;
}

/**
 * Extract hostname from a real or proxied URI.
 * @param {string} uri
 * @returns {string|null}
 */
export function extractStreamHost(uri) {
  if (!uri || typeof uri !== 'string') return null;
  try {
    const unwrapped = unwrapStreamUrl(uri);
    const u = new URL(unwrapped, typeof window !== 'undefined' ? window.location.href : 'http://local');
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostMatchesSuffix(hostname, suffix) {
  if (!hostname || !suffix) return false;
  const h = hostname.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}

/**
 * Whether this specific URI should skip the edge proxy (direct browser fetch).
 * @param {string} uri
 * @returns {boolean}
 */
export function shouldBypassProxy(uri) {
  // Force-proxy: never bypass (user wants everything through edge)
  if (envFlag('VITE_FORCE_PROXY') === 'true') return false;

  const host = extractStreamHost(uri);
  if (!host) return false;

  if (sessionBypassHosts.has(host)) return true;

  return STATIC_PROXY_BYPASS_SUFFIXES.some((suffix) => hostMatchesSuffix(host, suffix));
}

/**
 * Remember that this host's CDN blocks the edge proxy (403). Future requests
 * for the host go direct.
 * @param {string} uriOrHost
 */
export function markProxyBypass(uriOrHost) {
  if (!uriOrHost) return;
  let host = uriOrHost.toLowerCase();
  if (host.includes('/') || host.includes(':')) {
    host = extractStreamHost(uriOrHost);
  }
  if (!host) return;
  if (!sessionBypassHosts.has(host)) {
    sessionBypassHosts.add(host);
    console.info(`[Gravity] CDN blocks edge proxy — using direct fetch for ${host}`);
  }
}

/**
 * True if URI is already a same-origin proxy path.
 * @param {string} uri
 */
export function isProxiedUrl(uri) {
  if (!uri || typeof uri !== 'string') return false;
  if (uri.startsWith(PROXY_PREFIX)) return true;
  try {
    const u = new URL(uri, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    return u.pathname.startsWith(PROXY_PREFIX);
  } catch {
    return false;
  }
}

/**
 * Whether this URI should be rewritten through the proxy right now.
 * @param {string} uri
 */
export function shouldProxyUri(uri) {
  if (!shouldUseStreamProxy()) return false;
  if (shouldBypassProxy(uri)) return false;
  return true;
}

/**
 * Wrap an absolute or relative media URI for the proxy when needed.
 * @param {string} uri
 * @returns {string}
 */
export function wrapStreamUrl(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  if (!shouldProxyUri(uri)) {
    // If previously wrapped but now bypassed, unwrap for direct fetch
    if (isProxiedUrl(uri)) return unwrapStreamUrl(uri);
    return uri;
  }

  // Already proxied, data/blob
  if (uri.startsWith(PROXY_PREFIX)) return uri;
  if (uri.startsWith('data:') || uri.startsWith('blob:')) return uri;

  let absolute;
  try {
    absolute = new URL(uri, typeof window !== 'undefined' ? window.location.href : undefined);
  } catch {
    return uri;
  }

  if (typeof window !== 'undefined' && absolute.origin === window.location.origin) {
    if (absolute.pathname.startsWith(PROXY_PREFIX)) {
      return absolute.pathname + absolute.search + absolute.hash;
    }
    return uri;
  }

  if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
    return uri;
  }

  const host = absolute.host;
  return (
    PROXY_PREFIX +
    absolute.protocol.replace(':', '') +
    '/' +
    host +
    absolute.pathname +
    absolute.search
  );
}

/**
 * Unwrap a proxy path back to the real URL (for error messages / direct retry).
 * @param {string} uri
 * @returns {string}
 */
export function unwrapStreamUrl(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  try {
    const u = new URL(uri, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    const m = u.pathname.match(/^\/api\/proxy\/(https?)\/(.+)$/);
    if (!m) return uri;
    return `${m[1]}://${m[2]}${u.search}`;
  } catch {
    return uri;
  }
}

/**
 * If a Shaka network error is a proxy 403, mark the host for direct fetch.
 * @param {object} error Shaka error-like
 * @returns {boolean} true if this looks like a proxy-edge 403 worth retrying direct
 */
export function handleProxyHttpError(error) {
  if (!error || error.code !== 1001) return false;
  const data = error.data || [];
  const uri = typeof data[0] === 'string' ? data[0] : null;
  const status = typeof data[1] === 'number' ? data[1] : null;
  if (status !== 403 || !uri) return false;

  // Only treat as edge-block if we actually went through the proxy
  if (!isProxiedUrl(uri) && !uri.includes('/api/proxy/')) return false;

  markProxyBypass(uri);
  return true;
}

/**
 * Apply channel headers onto a Shaka networking request when using the proxy.
 * Browser forbids setting User-Agent / often Referer; edge proxy applies them.
 * @param {object} request Shaka request
 * @param {{ userAgent?: string, referrer?: string, authorization?: string, headers?: object }} channel
 */
export function applyProxyRequestHeaders(request, channel = {}) {
  if (!shouldUseStreamProxy() || !request?.headers) return;

  // Only attach proxy headers when at least one URI is actually proxied
  const uris = request.uris || [];
  const anyProxied = uris.some((u) => isProxiedUrl(u) || (typeof u === 'string' && u.includes('/api/proxy/')));
  if (!anyProxied) return;

  const { userAgent, referrer, authorization, headers } = channel;

  if (userAgent) {
    request.headers[PROXY_HEADER.userAgent] = String(userAgent);
  }
  if (referrer) {
    request.headers[PROXY_HEADER.referer] = String(referrer);
    try {
      request.headers[PROXY_HEADER.origin] = new URL(referrer).origin;
    } catch {
      /* ignore */
    }
  }
  if (authorization) {
    request.headers[PROXY_HEADER.authorization] = String(authorization);
  }

  if (headers && typeof headers === 'object') {
    Object.entries(headers).forEach(([k, v]) => {
      if (v == null || !k) return;
      if (/^user-agent$/i.test(k)) {
        request.headers[PROXY_HEADER.userAgent] = String(v);
        return;
      }
      if (/^referer$/i.test(k) || /^referrer$/i.test(k)) {
        request.headers[PROXY_HEADER.referer] = String(v);
        return;
      }
      if (/^authorization$/i.test(k)) {
        request.headers[PROXY_HEADER.authorization] = String(v);
        return;
      }
      request.headers[k] = String(v);
    });
  }
}
