import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import shaka from 'shaka-player/dist/shaka-player.ui';
import 'shaka-player/dist/controls.css';
import { buildDrmConfig, formatShakaError } from '../utils/drm';
import {
  wrapStreamUrl,
  shouldUseStreamProxy,
  applyProxyRequestHeaders,
  applyDirectRequestHeaders,
  handleProxyHttpError,
  isProxiedUrl,
} from '../utils/streamProxy';
import { getHdrPlayerConfig, logHdrTrackInfo, supportsHdrDisplay } from '../utils/hdrSupport';
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
  origin,
  authorization,
  headers,
  autoPlay = false,
  channelName = '',
  channelLogo = '',
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
  const [logoFailed, setLogoFailed] = useState(false);
  /** Host node inside Shaka controls so the banner shares UI show/hide */
  const [bannerHost, setBannerHost] = useState(null);

  // Reset broken-logo state when channel (or logo URL) changes
  useEffect(() => {
    setLogoFailed(false);
  }, [channelLogo, channelName]);

  // Mount channel banner host inside .shaka-controls-container (after UI is ready)
  useEffect(() => {
    if (!playerReady) {
      setBannerHost(null);
      return undefined;
    }
    const container = containerRef.current;
    if (!container) return undefined;

    const attachHost = () => {
      const controlsEl =
        uiRef.current?.getControls?.()?.getControlsContainer?.() ||
        container.querySelector('.shaka-controls-container');
      if (!controlsEl) return false;

      let host = controlsEl.querySelector(':scope > .player-channel-banner-host');
      if (!host) {
        host = document.createElement('div');
        host.className = 'player-channel-banner-host';
        controlsEl.insertBefore(host, controlsEl.firstChild);
      }
      setBannerHost(host);
      return true;
    };

    if (attachHost()) {
      return () => {
        const host = container.querySelector('.player-channel-banner-host');
        host?.remove();
        setBannerHost(null);
      };
    }

    // Controls may not be in the DOM on the first tick
    const raf = requestAnimationFrame(() => {
      attachHost();
    });
    return () => {
      cancelAnimationFrame(raf);
      const host = container.querySelector('.player-channel-banner-host');
      host?.remove();
      setBannerHost(null);
    };
  }, [playerReady]);

  // Latest headers for the networking filter (no re-register on every change)
  const headersRef = useRef({ userAgent, referrer, origin, authorization, headers });
  headersRef.current = { userAgent, referrer, origin, authorization, headers };

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
      // If RequestType map is incomplete, consider all types
      const typeOk = PROXY_TYPES.size === 0 || PROXY_TYPES.has(type);

      if (typeOk && request.uris && request.uris.length) {
        request.uris = request.uris.map((u) => wrapStreamUrl(u));
      }

      const anyProxied =
        typeOk &&
        (request.uris || []).some(
          (u) => isProxiedUrl(u) || (typeof u === 'string' && u.includes('/api/proxy/'))
        );

      if (anyProxied) {
        // Browser cannot set User-Agent; edge proxy maps X-Stream-* → real headers
        applyProxyRequestHeaders(request, h);
      } else {
        // Direct fetch (localhost, or CDN that blocks edge IPs but allows CORS).
        // User-Agent still cannot be overridden by the browser.
        applyDirectRequestHeaders(request, h);
      }
    };

    engine.registerRequestFilter(filter);
    filterRef.current = filter;
  }, []);

  const buildPlayerConfig = useCallback((stream) => {
    const drm = buildDrmConfig(stream);
    const hdr = getHdrPlayerConfig();

    return {
      drm,
      // HDR10 (PQ), HLG, Dolby Vision when the channel + display support them
      preferredVideoHdrLevel: hdr.preferredVideoHdrLevel,
      preferredVideoCodecs: hdr.preferredVideoCodecs,
      preferSpatialAudio: hdr.preferSpatialAudio,
      abr: hdr.abr,
      restrictions: hdr.restrictions,
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

  /**
   * If the display is HDR-capable and the manifest has PQ/HLG/HDR tracks,
   * nudge ABR toward the highest playable HDR variant (bandwidth permitting).
   */
  const preferHdrVariantIfAvailable = useCallback((player) => {
    if (!player || !supportsHdrDisplay()) return;
    try {
      const tracks = player.getVariantTracks?.() || [];
      if (!tracks.length) return;

      const isHdr = (t) => {
        const h = (t.hdr || '').toString().toUpperCase();
        return h === 'PQ' || h === 'HLG' || h === 'HDR' || h === 'HDR10' || h === 'HDR10+' || h === 'DV';
      };

      const hdrTracks = tracks.filter(isHdr);
      logHdrTrackInfo(player);
      if (!hdrTracks.length) return;

      const active = tracks.find((t) => t.active);
      if (active && isHdr(active)) return;

      // Highest resolution / bandwidth HDR track that is still allowed
      const best = [...hdrTracks].sort((a, b) => {
        const ph = (a.height || 0) * (a.width || 0);
        const qh = (b.height || 0) * (b.width || 0);
        if (qh !== ph) return qh - ph;
        return (b.bandwidth || 0) - (a.bandwidth || 0);
      })[0];

      if (best && !best.active) {
        player.selectVariantTrack(best, /* clearBuffer= */ false);
        console.info(
          '[Gravity] Selected HDR variant:',
          best.hdr,
          `${best.height || '?'}p`,
          best.codecs || ''
        );
      }
    } catch (e) {
      console.warn('[Gravity] HDR track selection skipped:', e);
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

      const tryLoad = async () => {
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

        // Prefer an HDR/HDR10/HLG variant when the display and stream support it
        preferHdrVariantIfAvailable(player);

        // Re-apply persisted aspect ratio after each load (channel switch must not reset it)
        applyAspectRatio(containerRef.current, getStoredAspectRatio());

        if (autoPlay) {
          try {
            await video.play();
          } catch (playErr) {
            console.warn('[Gravity] autoplay blocked:', playErr?.message || playErr);
          }
        }
      };

      try {
        await tryLoad();

        if (!mountedRef.current || gen !== loadGenRef.current) return;
        setError(null);
        setLoading(false);
        setStatusText('');
      } catch (e) {
        if (!mountedRef.current || gen !== loadGenRef.current) return;

        // Medianova/Starz-style: edge proxy IP blocked, but browser CORS works.
        // Mark host for direct fetch and retry once.
        if (handleProxyHttpError(e)) {
          console.warn('[Gravity] Proxy 403 — retrying direct (no edge proxy)…');
          setStatusText(channelName ? `Retrying ${channelName}…` : 'Retrying…');
          try {
            await tryLoad();
            if (!mountedRef.current || gen !== loadGenRef.current) return;
            setError(null);
            setLoading(false);
            setStatusText('');
            return;
          } catch (e2) {
            if (!mountedRef.current || gen !== loadGenRef.current) return;
            console.error('[Gravity] Load failed (direct retry):', e2);
            setError(e2);
            setLoading(false);
            setStatusText('');
            return;
          }
        }

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
      preferHdrVariantIfAvailable,
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

      // Tooltips stick after tap on touch devices (:hover never clears) — only
      // enable on fine-pointer hover environments (desktop mouse).
      let enableTooltips = true;
      try {
        enableTooltips = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      } catch {
        enableTooltips = true;
      }

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
        enableTooltips,
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
        console.info(
          '[Gravity] Stream proxy enabled (hosted origin). CDNs that block edge IPs (e.g. Starz/Medianova) use direct fetch.'
        );
      }
      console.info(
        '[Gravity] HDR display support:',
        supportsHdrDisplay() ? 'yes (HDR/HDR10/HLG tracks allowed)' : 'no (prefer SDR variants)'
      );

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
  }, [playerReady, manifestUrl, drmScheme, clearKeys, licenseUrl, userAgent, referrer, origin, authorization, headers, autoPlay, channelName, loadStream]);

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

  // Include aspect class in React className so re-renders (loading, errors, channel
  // switch) do not wipe the mode applied via classList / localStorage.
  const aspectClass = `aspect-${getStoredAspectRatio()}`;
  const showChannelChrome = Boolean(channelName || channelLogo);
  const showLogoImg = Boolean(channelLogo) && !logoFailed;
  const nameInitial = (channelName || '?').trim().charAt(0).toUpperCase() || '?';
  const hue = ((channelName || '').charCodeAt(0) || 0) * 3;

  const channelBanner =
    showChannelChrome && bannerHost
      ? createPortal(
          <div className="player-channel-banner" aria-hidden="true">
            <div className="player-channel-info">
              <div
                className={`player-channel-logo${showLogoImg ? ' has-image' : ''}`}
                style={
                  showLogoImg
                    ? undefined
                    : {
                        background: `linear-gradient(135deg, hsl(${hue}, 60%, 45%) 0%, hsl(${hue + 40}, 50%, 35%) 100%)`,
                      }
                }
              >
                {showLogoImg ? (
                  <img
                    src={channelLogo}
                    alt=""
                    onError={() => setLogoFailed(true)}
                  />
                ) : (
                  <span className="player-channel-logo-initial">{nameInitial}</span>
                )}
              </div>
              {channelName ? (
                <div className="player-channel-title" title={channelName}>
                  {channelName}
                </div>
              ) : null}
            </div>
          </div>,
          bannerHost
        )
      : null;

  return (
    <div
      className={`video-container ${aspectClass}${loading ? ' is-loading' : ''}`}
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}
    >
      {channelBanner}

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
