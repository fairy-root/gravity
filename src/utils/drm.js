/**
 * DRM helpers for ClearKey / license configuration.
 */

/** Strip non-hex characters (dashes, spaces) and lowercase. */
export const normalizeHex = (value = '') =>
  String(value).replace(/[^0-9a-fA-F]/g, '').toLowerCase();

/**
 * Parse ClearKey strings into a kid→key map for Shaka.
 * Supports:
 *  - kid:key
 *  - kid:key,kid2:key2
 *  - UUID-style kids (with dashes)
 *  - whitespace / newlines
 */
export const parseClearKeys = (clearKeys) => {
  const map = {};
  if (!clearKeys || typeof clearKeys !== 'string') return map;

  const parts = clearKeys
    .split(/[,\n;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    // kid:key — split on first colon only (keys themselves are hex, no colons)
    const colon = part.indexOf(':');
    if (colon === -1) continue;

    const kid = normalizeHex(part.slice(0, colon));
    const key = normalizeHex(part.slice(colon + 1));

    // ClearKey expects 16-byte (32 hex char) kid and key
    if (kid.length === 32 && key.length === 32) {
      map[kid] = key;
    }
  }

  return map;
};

/**
 * Build a Shaka-compatible drm config from stream settings.
 */
export const buildDrmConfig = ({ drmScheme, clearKeys, licenseUrl } = {}) => {
  const drm = {
    servers: {},
    clearKeys: {},
    preferredKeySystems: [],
    advanced: {},
  };

  const scheme = (drmScheme || '').toLowerCase();

  if (scheme === 'clearkey') {
    const keys = parseClearKeys(clearKeys);
    if (Object.keys(keys).length > 0) {
      drm.clearKeys = keys;
      // Force ClearKey so Widevine/PlayReady PSSH in the MPD is not preferred
      drm.preferredKeySystems = ['org.w3.clearkey'];
    }
  } else if (scheme === 'widevine' && licenseUrl) {
    drm.servers['com.widevine.alpha'] = licenseUrl;
    drm.preferredKeySystems = ['com.widevine.alpha'];
  } else if (scheme === 'playready' && licenseUrl) {
    drm.servers['com.microsoft.playready'] = licenseUrl;
    drm.preferredKeySystems = ['com.microsoft.playready'];
  }

  return drm;
};

/**
 * Format a Shaka error into a human-readable message.
 */
export const formatShakaError = (error) => {
  if (!error) return 'Unknown error';

  // Prefer dual-fail message built after proxy 403 + direct retry
  if (error.gravityDualFail && error.message) {
    return error.message;
  }

  const code = error.code;
  const data = error.data || [];
  const uri = typeof data[0] === 'string' ? data[0] : null;
  const status = typeof data[1] === 'number' ? data[1] : null;

  let detail = error.message || `Error code ${code ?? '?'}`;

  // NETWORK.BAD_HTTP_STATUS = 1001
  if (code === 1001) {
    if (status === 403) {
      const viaProxy =
        typeof uri === 'string' &&
        (uri.includes('/api/proxy/') || uri.startsWith('/api/proxy/'));
      detail = viaProxy
        ? 'HTTP 403 — CDN blocked the edge proxy (datacenter IP). Gravity retries direct; if this persists, set Referer/User-Agent/Authorization or use a fresh tokenized URL.'
        : 'HTTP 403 — CDN rejected the request. Set Referer / User-Agent / Authorization in Advanced Options, or refresh an expired token in the stream URL.';
    } else if (status === 401) {
      detail = 'HTTP 401 — unauthorized. Add Authorization (or Cookie) in Advanced Options.';
    } else if (status === 400) {
      const viaProxy =
        typeof uri === 'string' &&
        (uri.includes('/api/proxy/') || uri.startsWith('/api/proxy/'));
      detail = viaProxy
        ? 'HTTP 400 — CDN rejected the proxied request (bad URL, expired token, or missing header).'
        : 'HTTP 400 — CDN rejected the browser request (often Origin-sensitive; Gravity retries via edge proxy).';
    } else if (status === 404) {
      detail = 'HTTP 404 — stream URL not found (expired link or bad path)';
    } else if (status === 405) {
      detail = 'HTTP 405 — proxy rejected method (redeploy latest stream proxy)';
    } else if (status === 502 || status === 503) {
      detail = `HTTP ${status} — proxy could not reach the stream CDN`;
    } else {
      detail = `HTTP ${status ?? 'error'} loading stream`;
    }
    if (uri) {
      try {
        // Prefer unwrapped CDN URL for readability
        let display = uri;
        try {
          const u = new URL(uri, typeof window !== 'undefined' ? window.location.origin : 'http://local');
          const m = u.pathname.match(/^\/api\/proxy\/(https?)\/(.+)$/);
          if (m) display = `${m[1]}://${m[2]}${u.search}`;
        } catch {
          /* keep uri */
        }
        const short =
          display.length > 90 ? `${display.slice(0, 40)}…${display.slice(-40)}` : display;
        detail += ` — ${short}`;
      } catch {
        detail += ` (${uri.slice(0, 80)})`;
      }
    }
  } else if (code === 1002) {
    detail =
      'Network error (connection failed or CORS blocked). The CDN may not allow this site’s origin — try localhost, or a host that supports the stream proxy.';
  } else if (code === 1003) {
    detail = 'Request timed out';
  } else if (code === 4012 || code === 4032) {
    detail = 'No supported audio/video codecs in this stream for your browser';
  } else if (code === 6001 || code === 6007 || code === 6008) {
    detail = 'DRM error — check ClearKey / license settings';
  }

  return detail;
};
