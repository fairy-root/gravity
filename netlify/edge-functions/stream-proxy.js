/**
 * Netlify Edge Function — stream proxy for CDN Origin/Referer blocks.
 *
 * Request:  /api/proxy/https/cdn.example.com/path/to/index.mpd
 * Forwards: https://cdn.example.com/path/to/index.mpd
 *
 * Does not send the browser's Origin, so CDNs that 403 netlify.app still work.
 */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'origin',
  'referer',
]);

function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h.endsWith('.local')) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (h === '0.0.0.0') return true;
  return false;
}

function parseTarget(requestUrl) {
  const u = new URL(requestUrl);
  // /api/proxy/https/host/path...
  const m = u.pathname.match(/^\/api\/proxy\/(https?)\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  const protocol = m[1];
  const host = m[2];
  const path = m[3] || '/';
  if (isPrivateHost(host.split(':')[0])) return null;
  return `${protocol}://${host}${path}${u.search}`;
}

export default async (request) => {
  // CORS preflight (rarely needed same-origin, but harmless)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const target = parseTarget(request.url);
  if (!target) {
    return new Response('Invalid proxy URL', { status: 400 });
  }

  const outbound = new Headers();
  const range = request.headers.get('Range');
  if (range) outbound.set('Range', range);

  const accept = request.headers.get('Accept');
  if (accept) outbound.set('Accept', accept);

  // Neutral browser-like UA; do not forward Netlify Origin
  outbound.set(
    'User-Agent',
    request.headers.get('User-Agent') ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: outbound,
      redirect: 'follow',
    });
  } catch (err) {
    return new Response(`Proxy fetch failed: ${err?.message || err}`, { status: 502 });
  }

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    // Strip CDN CORS that might conflict; we set our own
    if (key.toLowerCase().startsWith('access-control-')) return;
    headers.set(key, value);
  });

  headers.set('Access-Control-Allow-Origin', '*');
  headers.set(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, Content-Type'
  );
  // Avoid caching live manifests aggressively at the edge client
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-cache');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
};

export const config = {
  path: '/api/proxy/*',
};
