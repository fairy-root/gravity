import React, { useEffect, useRef, useState, useCallback } from 'react';
import shaka from 'shaka-player/dist/shaka-player.ui';
import 'shaka-player/dist/controls.css';
import { buildDrmConfig, formatShakaError } from '../utils/drm';
import {
  wrapStreamUrl,
  shouldUseStreamProxy,
  applyProxyRequestHeaders,
} from '../utils/streamProxy';
import {
  registerAspectRatioControl,
  applyAspectRatio,
  getStoredAspectRatio,
} from './aspectRatioControl';

/**
 * Gravity stream player.
 *
 * Architecture:
 *  - One long-lived Shaka Player + UI (created on mount)
 *  - Channel switches use unload → reconfigure → load (no destroy races)
 *  - Generation counter ignores stale async results
 *  - Live DASH/HLS tuned (duration-based live like MBC3 + SegmentTimeline like MBC2)
 *  - CMCD off by default (strict CDN CORS on hosts like edgenextcdn)
 */
const Player = ({
  manifestUrl,
  drmScheme,
  clearKeys,
  licenseUrl,
  userAgent,
  referrer,
  authorization,
  headers,
  autoPlay = false,
  channelName = '',
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const uiRef = useRef(null);
  const filterRef = useRef(null);
  const loadGenRef = useRef(0);
  const mountedRef = useRef(true);

  const [playerReady, setPlayerReady] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');

  // Latest headers for the networking filter (no re-register on every change)
  const headersRef = useRef({ userAgent, referrer, authorization, headers });
  headersRef.current = { userAgent, referrer, authorization, headers };

  const applyNetworkingFilter = useCallback((player) => {
    const engine = player.getNetworkingEngine();
    if (!engine) return;

    if (filterRef.current) {
      try {
        engine.unregisterRequestFilter(filterRef.current);
      } catch {
        /* ignore */
      }
      filterRef.current = null;
    }

    // Only rewrite media-related requests (not APP/CMCD). License POSTs are
    // allowed by the edge proxy so Widevine/PlayReady still work when hosted.
    const RT = shaka.net.NetworkingEngine.RequestType || {};
    const PROXY_TYPES = new Set(
      [
        RT.MANIFEST,
        RT.SEGMENT,
        RT.LICENSE,
        RT.TIMING,
        RT.KEY,
        RT.SERVER_CERTIFICATE,
      ].filter((v) => typeof v === 'number')
    );

    const filter = (type, request) => {
      const h = headersRef.current || {};
      const useProxy = shouldUseStreamProxy();
      // If RequestType map is incomplete, wrap all non-APP traffic
      const shouldWrap =
        useProxy && (PROXY_TYPES.size === 0 || PROXY_TYPES.has(type));

      if (shouldWrap && request.uris && request.uris.length) {
        request.uris = request.uris.map((u) => wrapStreamUrl(u));
      }

      if (useProxy && shouldWrap) {
        // Browser cannot set User-Agent; edge proxy applies X-Stream-* upstream
        applyProxyRequestHeaders(request, h);
      } else {
        // Direct (localhost): set what the browser allows
        if (h.referrer) {
          request.headers['Referer'] = h.referrer;
        }
        if (h.authorization) {
          request.headers['Authorization'] = h.authorization;
        }
        if (h.headers && typeof h.headers === 'object') {
          Object.entries(h.headers).forEach(([k, v]) => {
            if (k && v != null && !/^user-agent$/i.test(k)) {
              request.headers[k] = String(v);
            }
          });
        }
      }
    };

    engine.registerRequestFilter(filter);
    filterRef.current = filter;
  }, []);

  const buildPlayerConfig = useCallback((stream) => {
    const drm = buildDrmConfig(stream);

    return {
      drm,
      cmcd: {
        enabled: false,
      },
      manifest: {
        retryParameters: {
          maxAttempts: 4,
          baseDelay: 400,
          backoffFactor: 2,
          timeout: 30000,
          stallTimeout: 10000,
          connectionTimeout: 15000,
        },
        dash: {
          clockSyncUri: '',
          ignoreMinBufferTime: true,
          autoCorrectDrift: true,
          ignoreSuggestedPresentationDelay: true,
          ignoreEmptyAdaptationSet: true,
          // Helps live MPDs that use $Number$ + duration without SegmentTimeline
          initialSegmentLimit: 1000,
        },
        hls: {
          ignoreTextStreamFailures: true,
        },
      },
      streaming: {
        retryParameters: {
          maxAttempts: 5,
          baseDelay: 300,
          backoffFactor: 2,
          timeout: 30000,
          stallTimeout: 10000,
          connectionTimeout: 15000,
        },
        bufferingGoal: 20,
        rebufferingGoal: 2,
        bufferBehind: 30,
        inaccurateManifestTolerance: 2,
        segmentPrefetchLimit: 2,
        failureCallback: (err) => {
          console.warn('[Gravity] Streaming failure, retrying:', err?.code, err?.message);
          const player = playerRef.current;
          if (!player) return;
          try {
            player.retryStreaming(0.5);
          } catch (e) {
            console.warn('[Gravity] retryStreaming failed:', e);
          }
        },
      },
    };
  }, []);

  const seekLiveIfNeeded = useCallback(async (player, video) => {
    try {
      if (player.isLive()) {
        const seekRange = player.seekRange();
        if (seekRange && Number.isFinite(seekRange.end)) {
          // Small cushion so the edge segment is already available
          video.currentTime = Math.max(seekRange.start, seekRange.end - 3);
        }
      }
    } catch (e) {
      console.warn('[Gravity] live seek skipped:', e);
    }
  }, []);

  const loadStream = useCallback(
    async (gen) => {
      const player = playerRef.current;
      const video = videoRef.current;
      if (!player || !video || !manifestUrl) return;

      setLoading(true);
      setError(null);
      setStatusText(channelName ? `Loading ${channelName}…` : 'Loading…');

      try {
        try {
          await player.unload();
        } catch {
          /* first load or already unloaded */
        }

        if (!mountedRef.current || gen !== loadGenRef.current) return;

        applyNetworkingFilter(player);

        // Replace DRM map fields cleanly before applying the new stream config
        player.configure({
          drm: {
            servers: {},
            clearKeys: {},
            preferredKeySystems: [],
          },
        });
        player.configure(buildPlayerConfig({ drmScheme, clearKeys, licenseUrl }));

        if (!mountedRef.current || gen !== loadGenRef.current) return;

        // wrapStreamUrl also applied in networking filter for segments
        await player.load(wrapStreamUrl(manifestUrl));

        if (!mountedRef.current || gen !== loadGenRef.current) return;

        await seekLiveIfNeeded(player, video);

        if (autoPlay) {
          try {
            await video.play();
          } catch (playErr) {
            console.warn('[Gravity] autoplay blocked:', playErr?.message || playErr);
          }
        }

        if (!mountedRef.current || gen !== loadGenRef.current) return;
        setError(null);
        setLoading(false);
        setStatusText('');
      } catch (e) {
        if (!mountedRef.current || gen !== loadGenRef.current) return;
        console.error('[Gravity] Load failed:', e);
        setError(e);
        setLoading(false);
        setStatusText('');
      }
    },
    [
      manifestUrl,
      drmScheme,
      clearKeys,
      licenseUrl,
      autoPlay,
      channelName,
      applyNetworkingFilter,
      buildPlayerConfig,
      seekLiveIfNeeded,
    ]
  );

  // Create player once on mount
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let player = null;
    let ui = null;
    let onError = null;

    const init = async () => {
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        setError({ message: 'Browser not supported for media playback', code: 0 });
        return;
      }

      const video = videoRef.current;
      const container = containerRef.current;
      if (!video || !container) return;

      // Register custom controls before creating the Overlay
      registerAspectRatioControl(shaka);

      // Shaka v5: construct without mediaElement, then attach
      player = new shaka.Player();
      try {
        await player.attach(video);
      } catch (e) {
        console.error('[Gravity] player.attach failed:', e);
        setError(e);
        return;
      }

      if (cancelled) {
        try {
          await player.destroy();
        } catch {
          /* ignore */
        }
        return;
      }

      ui = new shaka.ui.Overlay(player, container, video);

      ui.configure({
        controlPanelElements: [
          'play_pause',
          'time_and_duration',
          'spacer',
          'mute',
          'volume',
          'aspect_ratio',
          'fullscreen',
          'overflow_menu',
        ],
        overflowMenuButtons: ['quality', 'language', 'playback_rate', 'captions'],
        doubleClickForFullscreen: true,
        enableFullscreenOnRotation: true,
        enableTooltips: true,
        seekBarColors: {
          base: 'rgba(255,255,255,0.25)',
          buffered: 'rgba(255,255,255,0.45)',
          played: 'rgb(139, 92, 246)',
        },
      });

      // Restore preferred aspect ratio on the container
      applyAspectRatio(container, getStoredAspectRatio());

      playerRef.current = player;
      uiRef.current = ui;
      applyNetworkingFilter(player);

      onError = (event) => {
        const detail = event?.detail || event;
        console.error('[Gravity] Shaka error:', detail);
        if (!mountedRef.current) return;
        setError(detail);
        setLoading(false);
        setStatusText('');
      };
      player.addEventListener('error', onError);

      // Mid-stream buffering: Shaka built-in spinner only

      if (shouldUseStreamProxy()) {
        console.info('[Gravity] Stream proxy enabled (hosted origin)');
      }

      setPlayerReady(true);
    };

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      loadGenRef.current += 1;
      setPlayerReady(false);
      if (player && onError) {
        try {
          player.removeEventListener('error', onError);
        } catch {
          /* ignore */
        }
      }
      try {
        ui?.destroy();
      } catch {
        /* ignore */
      }
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      uiRef.current = null;
      filterRef.current = null;
    };
  }, [applyNetworkingFilter]);

  // Load / switch when stream config changes (after player is ready)
  useEffect(() => {
    if (!playerReady) return undefined;

    if (!manifestUrl) {
      setLoading(false);
      setError(null);
      setStatusText('');
      playerRef.current?.unload().catch(() => {});
      return undefined;
    }

    const gen = ++loadGenRef.current;
    loadStream(gen);

    return () => {
      // Invalidate in-flight load when deps change
      if (loadGenRef.current === gen) {
        // only bump if we haven't already moved on
      }
      loadGenRef.current += 1;
    };
  }, [playerReady, manifestUrl, drmScheme, clearKeys, licenseUrl, userAgent, referrer, authorization, headers, autoPlay, channelName, loadStream]);

  const handleRetry = () => {
    if (!manifestUrl || !playerReady) return;
    const gen = ++loadGenRef.current;
    loadStream(gen);
  };

  const handleDoubleClick = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen().catch((err) => {
        console.error('Fullscreen error:', err);
      });
    }
  };

  const errorMessage = error ? formatShakaError(error) : null;

  return (
    <div
      className={`video-container${loading ? ' is-loading' : ''}`}
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}
    >
      {/* Initial channel load only — Shaka owns mid-stream buffering spinner */}
      {loading && !error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 900,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            pointerEvents: 'none',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: 'var(--accent-light, #a78bfa)',
              borderRadius: '50%',
              animation: 'gravity-spin 0.8s linear infinite',
            }}
          />
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem' }}>
            {statusText || 'Loading…'}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            zIndex: 1000,
            background: 'rgba(127, 29, 29, 0.92)',
            border: '1px solid rgba(248, 113, 113, 0.4)',
            padding: '14px 16px',
            borderRadius: 10,
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxWidth: 520,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Playback failed</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.9, lineHeight: 1.4 }}>{errorMessage}</div>
          {error.code != null && (
            <div style={{ fontSize: '0.75rem', opacity: 0.65 }}>
              Shaka code {error.code}
              {error.data?.[1] != null ? ` · HTTP ${error.data[1]}` : ''}
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={handleRetry}
              className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="shaka-video"
        style={{ width: '100%', height: '100%' }}
        autoPlay={autoPlay}
        playsInline
      />
    </div>
  );
};

export default Player;
