/**
 * Parse M3U / M3U8 playlists including Kodi DRM properties.
 */

const emptyItem = () => ({
  name: 'Unknown Stream',
  group: 'General',
  logo: '',
  drmScheme: '',
  clearKeys: '',
  licenseUrl: '',
  headers: {},
  userAgent: '',
  referrer: '',
  origin: '',
  authorization: '',
});

const emptyPendingOpts = () => ({
  userAgent: '',
  referrer: '',
  origin: '',
  authorization: '',
  headers: {},
});

const stripQuotes = (value) => {
  const t = String(value ?? '').trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
};

/**
 * Apply #EXTVLCOPT:key=value onto an item (or pending bag).
 * Common forms:
 *   #EXTVLCOPT:http-user-agent=Mozilla/5.0 ...
 *   #EXTVLCOPT:http-user-agent="Mozilla/5.0 ..."
 *   #EXTVLCOPT:http-user-agent=
 *   #EXTVLCOPT:http-referrer=https://example.com/
 *   #EXTVLCOPT:http-referrer=
 *   #EXTVLCOPT:http-origin=https://example.com
 *   #EXTVLCOPT:http-origin=
 *
 * Empty values are intentionally ignored so defaults / other sources can apply.
 */
const applyVlcOpt = (target, propRaw) => {
  if (!target || propRaw == null) return;
  const prop = String(propRaw).trim();
  if (!prop) return;

  const eq = prop.indexOf('=');
  if (eq === -1) return;

  const key = prop.slice(0, eq).trim().toLowerCase();
  // Keep everything after the first '=' (UA strings may contain '=')
  const value = stripQuotes(prop.slice(eq + 1));

  // Empty value (e.g. http-user-agent= / http-referrer= / http-origin=)
  // → leave unset so defaults or other headers can apply
  if (!value) return;

  if (
    key === 'http-user-agent' ||
    key === 'user-agent' ||
    key === 'http-useragent'
  ) {
    target.userAgent = value;
    return;
  }

  if (
    key === 'http-referrer' ||
    key === 'http-referer' ||
    key === 'referrer' ||
    key === 'referer'
  ) {
    target.referrer = value;
    return;
  }

  if (key === 'http-origin' || key === 'origin') {
    target.origin = value;
  }
};

const applyPendingOpts = (item, pending) => {
  if (!item || !pending) return;
  if (pending.userAgent && !item.userAgent) item.userAgent = pending.userAgent;
  if (pending.referrer && !item.referrer) item.referrer = pending.referrer;
  if (pending.origin && !item.origin) item.origin = pending.origin;
  if (pending.authorization && !item.authorization) {
    item.authorization = pending.authorization;
  }
  if (pending.headers && typeof pending.headers === 'object') {
    item.headers = { ...pending.headers, ...item.headers };
  }
};

const parseExtInf = (line, item) => {
  const commaIndex = line.lastIndexOf(',');
  if (commaIndex !== -1) {
    item.name = line.substring(commaIndex + 1).trim() || item.name;
  }

  const tvgName = line.match(/tvg-name="([^"]*)"/i);
  if (tvgName) item.name = tvgName[1];

  const logo = line.match(/tvg-logo="([^"]*)"/i);
  if (logo) item.logo = logo[1];

  const group = line.match(/group-title="([^"]*)"/i);
  if (group) item.group = group[1];

  // Soft hint only — real DRM comes from KODIPROP
  const drmAttr = line.match(/\bdrm="([^"]*)"/i);
  if (drmAttr && /^(true|1|yes)$/i.test(drmAttr[1]) && !item.drmScheme) {
    item.drmScheme = 'clearkey';
  }
};

const isLicenseUrl = (value) =>
  /^https?:\/\//i.test(value) || value.startsWith('data:');

const applyKodiProp = (item, key, value) => {
  const k = key.toLowerCase();

  if (k === 'inputstream.adaptive.license_type' || k === 'inputstream.adaptive.license_type'.toLowerCase()) {
    const v = value.toLowerCase().trim();
    if (v === 'clearkey' || v === 'org.w3.clearkey') {
      item.drmScheme = 'clearkey';
    } else if (v === 'com.widevine.alpha' || v === 'widevine') {
      item.drmScheme = 'widevine';
    } else if (v.includes('playready')) {
      item.drmScheme = 'playready';
    }
    return;
  }

  if (k === 'inputstream.adaptive.license_key') {
    // Widevine/PlayReady: license server URL
    // ClearKey: kid:key[,kid:key...]
    if (isLicenseUrl(value) || item.drmScheme === 'widevine' || item.drmScheme === 'playready') {
      if (isLicenseUrl(value)) {
        item.licenseUrl = value;
        if (!item.drmScheme) item.drmScheme = 'widevine';
      } else {
        // Some playlists put clearkey material without license_type first
        item.clearKeys = value;
        if (!item.drmScheme) item.drmScheme = 'clearkey';
      }
    } else {
      item.clearKeys = value;
      if (!item.drmScheme) item.drmScheme = 'clearkey';
    }
    return;
  }

  if (k === 'inputstream.adaptive.stream_headers' || k === 'inputstream.adaptive.manifest_headers') {
    // Format: User-Agent=Foo&Referer=Bar
    value.split('&').forEach((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return;
      const hk = pair.slice(0, eq).trim();
      let hv = pair.slice(eq + 1).trim();
      try {
        hv = decodeURIComponent(hv);
      } catch {
        /* keep raw */
      }
      hv = stripQuotes(hv);
      if (!hv) return;
      if (/^user-agent$/i.test(hk)) item.userAgent = hv;
      else if (/^referer$/i.test(hk) || /^referrer$/i.test(hk)) item.referrer = hv;
      else if (/^origin$/i.test(hk)) item.origin = hv;
      else if (/^authorization$/i.test(hk)) item.authorization = hv;
      else item.headers[hk] = hv;
    });
  }
};

export const parseM3U = (content) => {
  if (!content || typeof content !== 'string') return [];

  // Normalize BOM + line endings
  const text = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const playlists = [];
  let currentItem = null;
  // #EXTVLCOPT often appears *before* #EXTINF in IPTV lists — hold until next item
  let pendingOpts = emptyPendingOpts();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (/^#EXTINF:/i.test(line)) {
      currentItem = emptyItem();
      parseExtInf(line, currentItem);
      // Carry over VLC opts declared before this EXTINF
      applyPendingOpts(currentItem, pendingOpts);
      pendingOpts = emptyPendingOpts();
      continue;
    }

    // VLC / IPTV style options (before or after #EXTINF)
    // e.g. #EXTVLCOPT:http-user-agent=Mozilla/5.0 ...
    if (/^#EXTVLCOPT:/i.test(line)) {
      const prop = line.replace(/^#EXTVLCOPT:/i, '').trim();
      if (currentItem) {
        applyVlcOpt(currentItem, prop);
      } else {
        applyVlcOpt(pendingOpts, prop);
      }
      continue;
    }

    if (/^#EXTHTTP:/i.test(line) && currentItem) {
      try {
        const json = JSON.parse(line.replace(/^#EXTHTTP:/i, '').trim());
        Object.entries(json).forEach(([hk, hv]) => {
          if (hv == null || hv === '') return;
          const val = String(hv);
          if (/^user-agent$/i.test(hk)) currentItem.userAgent = val;
          else if (/^referer$/i.test(hk) || /^referrer$/i.test(hk)) currentItem.referrer = val;
          else if (/^origin$/i.test(hk)) currentItem.origin = val;
          else if (/^authorization$/i.test(hk)) currentItem.authorization = val;
          else currentItem.headers[hk] = val;
        });
      } catch {
        // ignore malformed EXTHTTP
      }
      continue;
    }

    if (/^#KODIPROP:/i.test(line) && currentItem) {
      const prop = line.replace(/^#KODIPROP:/i, '').trim();
      const eqIndex = prop.indexOf('=');
      if (eqIndex === -1) continue;
      const key = prop.substring(0, eqIndex).trim();
      const value = prop.substring(eqIndex + 1).trim();
      applyKodiProp(currentItem, key, value);
      continue;
    }

    // URL line — commit item
    if (!line.startsWith('#') && currentItem) {
      currentItem.manifestUrl = line;
      currentItem.id = crypto.randomUUID();
      playlists.push(currentItem);
      currentItem = null;
    }
  }

  return playlists;
};
