/**
 * Stream request header helpers.
 *
 * Advanced channel options (userAgent, referrer, authorization, headers)
 * are primary and override defaults when set.
 */

/** Default User-Agent when none is set on the channel / M3U entry. */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

/**
 * Parse a "Key: Value" line, or treat the whole string as a bare value.
 * @param {string} input
 * @returns {{ key: string|null, value: string }}
 */
export function parseHeaderLine(input) {
  if (input == null) return { key: null, value: '' };
  const raw = String(input).trim();
  if (!raw) return { key: null, value: '' };

  // "Key: Value" — key must look like a header name (no spaces before colon)
  const m = raw.match(/^([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*:\s*(.*)$/s);
  if (m) {
    return { key: m[1].trim(), value: m[2].trim() };
  }
  return { key: null, value: raw };
}

/**
 * Authorization field accepts either:
 *  - bare value → header name "Authorization"
 *  - "Key: Value" → custom header name + value
 * @param {string} input
 * @returns {{ name: string, value: string }|null} null if empty
 */
export function parseAuthorizationField(input) {
  if (input == null || !String(input).trim()) return null;
  const { key, value } = parseHeaderLine(input);
  if (!value && !key) return null;
  if (key) {
    return { name: key, value: value || '' };
  }
  return { name: 'Authorization', value: String(input).trim() };
}

/**
 * Normalize a headers map (object or entries) to a plain { [name]: value }.
 * @param {object|Array} headers
 * @returns {Record<string, string>}
 */
export function normalizeHeadersMap(headers) {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    const out = {};
    headers.forEach((entry) => {
      if (!entry) return;
      if (typeof entry === 'string') {
        const { key, value } = parseHeaderLine(entry);
        if (key && value != null && value !== '') out[key] = value;
        return;
      }
      const k = entry.key ?? entry.name;
      const v = entry.value;
      if (k && v != null && String(v) !== '') out[String(k).trim()] = String(v);
    });
    return out;
  }
  if (typeof headers === 'object') {
    const out = {};
    Object.entries(headers).forEach(([k, v]) => {
      if (!k || v == null || String(v) === '') return;
      out[String(k).trim()] = String(v);
    });
    return out;
  }
  return {};
}

/**
 * Resolve the final set of stream headers for a channel.
 * Advanced / M3U fields override defaults when set.
 *
 * Priority for User-Agent:
 *   1. channel.userAgent (form / M3U dedicated field)
 *   2. headers map "User-Agent"
 *   3. DEFAULT_USER_AGENT
 *
 * @param {{
 *   userAgent?: string,
 *   referrer?: string,
 *   authorization?: string,
 *   headers?: object|Array
 * }} channel
 * @returns {{
 *   userAgent: string,
 *   referrer: string,
 *   authHeader: { name: string, value: string }|null,
 *   customHeaders: Record<string, string>
 * }}
 */
export function resolveStreamHeaders(channel = {}) {
  const customHeaders = normalizeHeadersMap(channel.headers);
  const dedicatedUa = channel.userAgent && String(channel.userAgent).trim();
  const mapUa =
    customHeaders['User-Agent'] ||
    customHeaders['user-agent'] ||
    customHeaders['User-agent'] ||
    '';

  const resolvedUa = dedicatedUa || (mapUa && String(mapUa).trim()) || DEFAULT_USER_AGENT;

  const dedicatedReferrer = channel.referrer && String(channel.referrer).trim();
  const mapReferrer =
    customHeaders['Referer'] ||
    customHeaders['Referrer'] ||
    customHeaders['referer'] ||
    customHeaders['referrer'] ||
    '';
  const resolvedReferrer = dedicatedReferrer || (mapReferrer && String(mapReferrer).trim()) || '';

  // Dedicated authorization field is primary; map Authorization only if field empty
  let authHeader = parseAuthorizationField(channel.authorization);
  if (!authHeader) {
    const mapAuth =
      customHeaders['Authorization'] || customHeaders['authorization'];
    if (mapAuth) {
      authHeader = { name: 'Authorization', value: String(mapAuth) };
    }
  }

  // Strip headers applied via dedicated fields so they are not double-sent
  const cleaned = { ...customHeaders };
  Object.keys(cleaned).forEach((k) => {
    if (/^user-agent$/i.test(k)) delete cleaned[k];
    if (/^referer$/i.test(k) || /^referrer$/i.test(k)) delete cleaned[k];
    if (/^authorization$/i.test(k)) delete cleaned[k];
  });

  return {
    userAgent: resolvedUa,
    referrer: resolvedReferrer,
    authHeader,
    customHeaders: cleaned,
  };
}
