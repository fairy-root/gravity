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
  authorization: '',
});

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
      const hv = decodeURIComponent(pair.slice(eq + 1).trim());
      if (/^user-agent$/i.test(hk)) item.userAgent = hv;
      else if (/^referer$/i.test(hk) || /^referrer$/i.test(hk)) item.referrer = hv;
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      currentItem = emptyItem();
      parseExtInf(line, currentItem);
      continue;
    }

    // VLC / IPTV style user-agent
    if (line.startsWith('#EXTVLCOPT:') && currentItem) {
      const prop = line.substring(11).trim();
      if (/^http-user-agent=/i.test(prop)) {
        currentItem.userAgent = prop.split('=').slice(1).join('=');
      } else if (/^http-referrer=/i.test(prop) || /^http-referer=/i.test(prop)) {
        currentItem.referrer = prop.split('=').slice(1).join('=');
      }
      continue;
    }

    if (line.startsWith('#EXTHTTP:') && currentItem) {
      try {
        const json = JSON.parse(line.substring(9).trim());
        if (json['User-Agent']) currentItem.userAgent = json['User-Agent'];
        if (json.Referer || json.Referrer) currentItem.referrer = json.Referer || json.Referrer;
        if (json.Authorization) currentItem.authorization = json.Authorization;
      } catch {
        // ignore malformed EXTHTTP
      }
      continue;
    }

    if (line.startsWith('#KODIPROP:') && currentItem) {
      const prop = line.substring(10).trim();
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
