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

  const code = error.code;
  const data = error.data || [];
  const uri = typeof data[0] === 'string' ? data[0] : null;
  const status = typeof data[1] === 'number' ? data[1] : null;

  let detail = error.message || `Error code ${code ?? '?'}`;

  // NETWORK.BAD_HTTP_STATUS = 1001
  if (code === 1001) {
    if (status === 403) {
      detail =
        'HTTP 403 — stream CDN blocked this site’s origin. Redeploy with the Netlify stream proxy, or play from localhost.';
    } else {
      detail = `HTTP ${status ?? 'error'} loading stream`;
    }
    if (uri) {
      try {
        const path = new URL(uri, 'http://local').pathname;
        const short = path.split('/').filter(Boolean).slice(-2).join('/');
        detail += ` (${short || path})`;
      } catch {
        detail += ` (${uri.slice(0, 80)})`;
      }
    }
  } else if (code === 1002) {
    detail = 'Network error (connection failed or CORS blocked)';
  } else if (code === 1003) {
    detail = 'Request timed out';
  } else if (code === 6001 || code === 6007 || code === 6008) {
    detail = 'DRM error — check ClearKey / license settings';
  }

  return detail;
};
