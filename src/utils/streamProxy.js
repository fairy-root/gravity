/**
 * Same-origin stream proxy helpers.
 *
 * Some CDNs (e.g. Shahid / edgenext) return HTTP 403 when the browser sends
 * Origin: https://your-app.netlify.app. Localhost is often allowed.
 * We rewrite external stream URLs to /api/proxy/https/host/path so requests
 * leave the CDN from Netlify's edge (no blocked browser Origin).
 *
 * Path style preserves relative segment resolution inside MPD/HLS.
 */

const PROXY_PREFIX = '/api/proxy/';

/** True when we should route media through the edge proxy. */
export function shouldUseStreamProxy() {
  if (typeof window === 'undefined') return false;
  // Explicit override
  if (import.meta.env.VITE_FORCE_PROXY === 'true') return true;
  if (import.meta.env.VITE_FORCE_PROXY === 'false') return false;

  const host = window.location.hostname;
  // Local dev Origin is usually allowed by CDNs — skip proxy bandwidth
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
    return false;
  }
  return true;
}

/**
 * Wrap an absolute or relative media URI for the proxy when needed.
 * @param {string} uri
 * @returns {string}
 */
export function wrapStreamUrl(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  if (!shouldUseStreamProxy()) return uri;

  // Already proxied, data/blob, or relative to current origin path only
  if (uri.startsWith(PROXY_PREFIX)) return uri;
  if (uri.startsWith('data:') || uri.startsWith('blob:')) return uri;

  let absolute;
  try {
    absolute = new URL(uri, typeof window !== 'undefined' ? window.location.href : undefined);
  } catch {
    return uri;
  }

  if (typeof window !== 'undefined' && absolute.origin === window.location.origin) {
    // Same-origin (including already-proxied absolute form)
    if (absolute.pathname.startsWith(PROXY_PREFIX)) return absolute.pathname + absolute.search;
    return uri;
  }

  if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
    return uri;
  }

  // /api/proxy/https/cdn.example.com/live/index.mpd?x=1
  return (
    PROXY_PREFIX +
    absolute.protocol.replace(':', '') +
    '/' +
    absolute.host +
    absolute.pathname +
    absolute.search
  );
}

/**
 * Unwrap a proxy path back to the real URL (for error messages).
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
