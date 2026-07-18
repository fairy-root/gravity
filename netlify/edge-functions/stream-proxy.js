/**
 * Netlify Edge Function — stream proxy for CDN Origin/Referer blocks.
 *
 * Request:  /api/proxy/https/cdn.example.com/path/to/index.mpd
 * Forwards: https://cdn.example.com/path/to/index.mpd
 *
 * Does not send the browser's Origin, so CDNs that 403 netlify.app still work.
 *
 * Optional client headers (set by Player networking filter):
 *   X-Stream-User-Agent  → User-Agent
 *   X-Stream-Referer     → Referer
 *   X-Stream-Origin      → Origin (upstream)
 *   X-Stream-Authorization → Authorization
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
  // Never forward our control headers upstream
  'x-stream-user-agent',
  'x-stream-referer',
  'x-stream-origin',
  'x-stream-authorization',
]);

// Hop / framing headers we always drop on the way out
const STRIP_RESPONSE = new Set([
  'transfer-encoding',
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
  const host = decodeURIComponent(m[2]);
  const path = m[3] || '/';
  if (isPrivateHost(host.split(':')[0])) return null;
  return `${protocol}://${host}${path}${u.search}`;
}

function buildOutboundHeaders(request) {
  const outbound = new Headers();

  // Range (segments / seeking)
  const range = request.headers.get('Range');
  if (range) outbound.set('Range', range);

  const accept = request.headers.get('Accept');
  if (accept) outbound.set('Accept', accept);

  // Prefer uncompressed bodies so Deno/Netlify decompress + Content-Encoding
  // cannot desync (common proxy corruption).
  outbound.set('Accept-Encoding', 'identity');

  // Stream-specific headers from the Gravity player (channel config)
  const ua =
    request.headers.get('X-Stream-User-Agent') ||
    request.headers.get('User-Agent') ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  outbound.set('User-Agent', ua);

  const referer = request.headers.get('X-Stream-Referer');
  if (referer) outbound.set('Referer', referer);

  const origin = request.headers.get('X-Stream-Origin');
  if (origin) outbound.set('Origin', origin);

  const authorization = request.headers.get('X-Stream-Authorization');
  if (authorization) outbound.set('Authorization', authorization);

  // DRM license / POST bodies
  const contentType = request.headers.get('Content-Type');
  if (contentType) outbound.set('Content-Type', contentType);

  return outbound;
}

export default async (request) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Range, Content-Type, Accept, Authorization, X-Stream-User-Agent, X-Stream-Referer, X-Stream-Origin, X-Stream-Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD', 'POST'].includes(method)) {
    return new Response('Method not allowed', { status: 405 });
  }

  const target = parseTarget(request.url);
  if (!target) {
    return new Response('Invalid proxy URL', { status: 400 });
  }

  const outbound = buildOutboundHeaders(request);

  let upstream;
  try {
    const init = {
      method,
      headers: outbound,
      redirect: 'follow',
    };
    // Forward body for license POSTs (Widevine / PlayReady)
    if (method === 'POST' && request.body) {
      init.body = request.body;
    }
    upstream = await fetch(target, init);
  } catch (err) {
    return new Response(`Proxy fetch failed: ${err?.message || err}`, {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Proxy-Target': target,
      },
    });
  }

  const headers = new Headers();
  // If runtime auto-decompressed, Content-Encoding must not stay "gzip"
  // (we request identity; still guard against mismatched encoding).
  const contentEncoding = (upstream.headers.get('Content-Encoding') || '').toLowerCase();
  const dropEncoding =
    contentEncoding && contentEncoding !== 'identity' && contentEncoding !== 'none';

  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (STRIP_RESPONSE.has(lower)) return;
    if (lower.startsWith('access-control-')) return;
    if (dropEncoding && (lower === 'content-encoding' || lower === 'content-length')) return;
    headers.set(key, value);
  });

  headers.set('Access-Control-Allow-Origin', '*');
  headers.set(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Proxy-Status, X-Proxy-Target'
  );
  headers.set('X-Proxy-Status', String(upstream.status));
  headers.set('X-Proxy-Target', target);

  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-cache');
  }

  // HEAD must not include a body
  if (method === 'HEAD') {
    return new Response(null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
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
