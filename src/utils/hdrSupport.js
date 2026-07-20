/**
 * Display / Shaka HDR helpers.
 *
 * Shaka maps HDR10 → "PQ" (SMPTE ST 2084) and HLG → "HLG".
 * preferredVideoHdrLevel: '' = no filter, 'SDR' | 'PQ' | 'HLG' | 'AUTO'.
 *
 * AUTO uses Shaka's device check (mostly color-gamut: p3), which misses some
 * Windows/HDR monitors. We detect with (dynamic-range: high) as well and set
 * an explicit preference so HDR tracks are not filtered out incorrectly.
 */

/**
 * Whether the current display is likely HDR-capable.
 * @returns {boolean}
 */
export function supportsHdrDisplay() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    if (window.matchMedia('(dynamic-range: high)').matches) return true;
  } catch {
    /* ignore */
  }
  try {
    // Wide-gamut displays often accompany HDR (Shaka's built-in AUTO signal)
    if (window.matchMedia('(color-gamut: rec2020)').matches) return true;
    if (window.matchMedia('(color-gamut: p3)').matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Preferred Shaka HDR level for this environment.
 * - HDR display: '' (allow PQ / HLG / untagged; MediaCapabilities filters)
 * - SDR display: 'SDR' (drop tagged HDR variants when SDR exists)
 * @returns {string}
 */
export function getPreferredVideoHdrLevel() {
  return supportsHdrDisplay() ? '' : 'SDR';
}

/**
 * Codec preference list: HDR-friendly codecs first (Dolby Vision, HEVC, AV1),
 * then common SDR fallbacks. Non-listed codecs remain available.
 * @returns {string[]}
 */
export function getPreferredVideoCodecs() {
  return [
    // Dolby Vision
    'dvh1',
    'dvhe',
    // HEVC — common container for HDR10 / HLG
    'hvc1',
    'hev1',
    // AV1 HDR
    'av01',
    // VP9 HDR
    'vp09',
    // H.264 fallback
    'avc1',
    'avc3',
  ];
}

/**
 * Shaka player config fragment for HDR / high-quality video.
 * @returns {object}
 */
export function getHdrPlayerConfig() {
  return {
    // Prefer HDR when the display can show it; do not hard-block untagged tracks
    preferredVideoHdrLevel: getPreferredVideoHdrLevel(),
    preferredVideoCodecs: getPreferredVideoCodecs(),
    // Atmos / spatial when offered alongside HDR packs
    preferSpatialAudio: true,
    abr: {
      enabled: true,
      // Keep UHD/HDR variants selectable even if the player element is small
      restrictToElementSize: false,
      restrictToScreenSize: false,
      ignoreDevicePixelRatio: false,
    },
    // Soft/hard caps at Infinity so 4K HDR tracks are not rejected
    restrictions: {
      minWidth: 0,
      maxWidth: Infinity,
      minHeight: 0,
      maxHeight: Infinity,
      minPixels: 0,
      maxPixels: Infinity,
      minFrameRate: 0,
      maxFrameRate: Infinity,
      minBandwidth: 0,
      maxBandwidth: Infinity,
    },
  };
}

/**
 * Log active / available HDR-related tracks (debug aid).
 * @param {object} player Shaka player instance
 */
export function logHdrTrackInfo(player) {
  if (!player || typeof player.getVariantTracks !== 'function') return;
  try {
    const tracks = player.getVariantTracks() || [];
    const hdr = tracks.filter((t) => t.hdr && String(t.hdr).toUpperCase() !== 'SDR');
    if (!hdr.length) return;
    const active = tracks.find((t) => t.active);
    console.info(
      '[Gravity] HDR variants available:',
      hdr.map((t) => `${t.height || '?'}p ${t.hdr} ${t.codecs || ''}`.trim()),
      '| active:',
      active ? `${active.height || '?'}p ${active.hdr || 'SDR'}` : 'none',
      '| displayHdr:',
      supportsHdrDisplay()
    );
  } catch {
    /* ignore */
  }
}
