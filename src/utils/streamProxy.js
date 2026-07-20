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
 *
 * User-Agent cannot be set from the browser; channel UA is sent as
 * X-Stream-User-Agent and the edge proxy applies it as the real User-Agent.
 */

import { resolveStreamHeaders } from './streamHeaders';

const PROXY_PREFIX = '/api/proxy/';

/** Header names the edge proxy understands (channel config → upstream). */
export const PROXY_HEADER = {
  userAgent: 'X-Stream-User-Agent',
  referer: 'X-Stream-Referer',
  origin: 'X-Stream-Origin',
  authorization: 'X-Stream-Authorization',
  /** JSON map of extra custom headers → applied upstream as real header names */
  extraHeaders: 'X-Stream-Extra-Headers',
  /**
   * When authorization is "Key: Value" with a non-Authorization name,
   * name is sent here so the edge proxy can set the correct upstream header.
   */
  authName: 'X-Stream-Authorization-Name',
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
  // Amazon IVS / Prime-style edges often block datacenter/Netlify IPs (403 via proxy)
  'aiv-cdn.net',
  'aiv-cdn.com.tw',
  'media-amazon.com',
  'cloudfront.net',
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
 * Pull uri + HTTP status from a Shaka network error (code 1001/1002/…).
 * @param {object} error
 * @returns {{ uri: string|null, status: number|null, code: number|null }}
 */
export function getShakaNetworkErrorInfo(error) {
  if (!error) return { uri: null, status: null, code: null };
  const data = error.data || [];
  return {
    code: typeof error.code === 'number' ? error.code : null,
    uri: typeof data[0] === 'string' ? data[0] : null,
    status: typeof data[1] === 'number' ? data[1] : null,
  };
}

/**
 * If a Shaka network error is a proxy 403, mark the host for direct fetch.
 * @param {object} error Shaka error-like
 * @returns {boolean} true if this looks like a proxy-edge 403 worth retrying direct
 */
export function handleProxyHttpError(error) {
  if (!error || error.code !== 1001) return false;
  const { uri, status } = getShakaNetworkErrorInfo(error);
  if (status !== 403 || !uri) return false;

  // Only treat as edge-block if we actually went through the proxy
  if (!isProxiedUrl(uri) && !uri.includes('/api/proxy/')) return false;

  markProxyBypass(uri);
  return true;
}

/**
 * Build a clearer dual-failure message after proxy 403 + direct retry both fail.
 * @param {object} proxyError
 * @param {object} directError
 * @returns {object} error-like with improved message for the UI
 */
export function enrichDualFetchFailure(proxyError, directError) {
  const p = getShakaNetworkErrorInfo(proxyError);
  const d = getShakaNetworkErrorInfo(directError);
  const host = extractStreamHost(d.uri || p.uri) || 'CDN';

  const msg =
    `Stream blocked both ways for ${host}. ` +
    `Edge proxy HTTP ${p.status ?? '?'} (datacenter IP often blocked); ` +
    `direct browser HTTP ${d.status ?? d.code ?? '?'}` +
    (d.status === 403
      ? ' (CDN rejected — set Referer / User-Agent / Authorization in Advanced Options, or the link needs a fresh token).'
      : d.code === 1002
        ? ' (network/CORS — CDN may not allow this site origin).'
        : '.') +
    ' Tip: many Amazon/Prime-style CDNs need a valid token in the URL and a matching Referer.';

  const err = directError || proxyError || {};
  return {
    ...err,
    message: msg,
    code: err.code,
    data: err.data,
    severity: err.severity,
    category: err.category,
    gravityDualFail: true,
    gravityProxyStatus: p.status,
    gravityDirectStatus: d.status,
  };
}

/**
 * Apply channel headers onto a Shaka networking request when using the proxy.
 * Browser forbids setting User-Agent; edge proxy maps X-Stream-* → real headers.
 * Advanced options override defaults (see resolveStreamHeaders).
 *
 * @param {object} request Shaka request
 * @param {{ userAgent?: string, referrer?: string, origin?: string, authorization?: string, headers?: object }} channel
 */
export function applyProxyRequestHeaders(request, channel = {}) {
  if (!request?.headers) return;

  // Only attach proxy control headers when at least one URI is actually proxied
  const uris = request.uris || [];
  const anyProxied = uris.some(
    (u) => isProxiedUrl(u) || (typeof u === 'string' && u.includes('/api/proxy/'))
  );
  if (!anyProxied) return;

  const resolved = resolveStreamHeaders(channel);

  // Always send UA so the edge can set the real User-Agent (never browser default)
  request.headers[PROXY_HEADER.userAgent] = resolved.userAgent;

  if (resolved.referrer) {
    request.headers[PROXY_HEADER.referer] = resolved.referrer;
  }

  // Explicit Origin (from #EXTVLCOPT:http-origin= or form) wins; else derived from referrer
  if (resolved.origin) {
    request.headers[PROXY_HEADER.origin] = resolved.origin;
  }

  if (resolved.authHeader) {
    request.headers[PROXY_HEADER.authorization] = resolved.authHeader.value;
    // Custom auth header name (e.g. "X-Auth-Token: secret")
    if (!/^authorization$/i.test(resolved.authHeader.name)) {
      request.headers[PROXY_HEADER.authName] = resolved.authHeader.name;
    }
  }

  // Extra custom headers as JSON — edge applies them with their real names
  const extra = resolved.customHeaders;
  if (extra && Object.keys(extra).length > 0) {
    try {
      request.headers[PROXY_HEADER.extraHeaders] = JSON.stringify(extra);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Apply channel headers for a direct (non-proxy) browser fetch.
 * User-Agent cannot be overridden in browsers; other headers can.
 * @param {object} request Shaka request
 * @param {{ userAgent?: string, referrer?: string, origin?: string, authorization?: string, headers?: object }} channel
 */
export function applyDirectRequestHeaders(request, channel = {}) {
  if (!request?.headers) return;

  const resolved = resolveStreamHeaders(channel);

  if (resolved.referrer) {
    request.headers['Referer'] = resolved.referrer;
  }

  // Origin is often forbidden on browser fetch; still set when allowed by Shaka/engine
  if (resolved.origin) {
    request.headers['Origin'] = resolved.origin;
  }

  if (resolved.authHeader) {
    request.headers[resolved.authHeader.name] = resolved.authHeader.value;
  }

  Object.entries(resolved.customHeaders || {}).forEach(([k, v]) => {
    if (!k || v == null) return;
    // Browser forbids setting User-Agent on fetch/XHR
    if (/^user-agent$/i.test(k)) return;
    request.headers[k] = String(v);
  });
}
