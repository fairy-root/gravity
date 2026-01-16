import React, { useEffect, useRef, useState } from 'react';
import shaka from 'shaka-player/dist/shaka-player.ui';
import 'shaka-player/dist/controls.css';

const Player = ({ manifestUrl, drmScheme, clearKeys, licenseUrl, userAgent, referrer, authorization, autoPlay = false }) => {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const uiRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const initPlayer = async () => {
            if (!videoRef.current || !containerRef.current) return;

            if (playerRef.current) {
                await playerRef.current.destroy();
                playerRef.current = null;
            }
            if (uiRef.current) {
                uiRef.current.destroy();
                uiRef.current = null;
            }

            const player = new shaka.Player(videoRef.current);
            const ui = new shaka.ui.Overlay(player, containerRef.current, videoRef.current);

            // Configure UI for proper fullscreen
            const uiConfig = {
                'controlPanelElements': ['play_pause', 'time_and_duration', 'spacer', 'mute', 'volume', 'fullscreen', 'overflow_menu'],
                'overflowMenuButtons': ['quality', 'playback_rate', 'captions'],
                'doubleClickForFullscreen': true,
                'enableFullscreenOnRotation': true,
            };
            ui.configure(uiConfig);

            playerRef.current = player;
            uiRef.current = ui;

            player.addEventListener('error', (event) => {
                console.error('Shaka Error:', event.detail);
                setError(event.detail);
            });

            player.getNetworkingEngine().registerRequestFilter((type, request) => {
                if (userAgent) {
                    request.headers['User-Agent'] = userAgent;
                }
                if (referrer) {
                    request.headers['Referer'] = referrer;
                }
                if (authorization) {
                    request.headers['Authorization'] = authorization;
                }
            });

            const config = {
                drm: {
                    servers: {},
                    clearKeys: {}
                }
            };

            if (drmScheme === 'clearkey' && clearKeys) {
                config.drm.clearKeys = {};
                const parts = clearKeys.split(',');
                parts.forEach(part => {
                    const [kId, k] = part.trim().split(':');
                    if (kId && k) {
                        config.drm.clearKeys[kId] = k;
                    }
                });
            } else if (drmScheme === 'widevine' && licenseUrl) {
                config.drm.servers['com.widevine.alpha'] = licenseUrl;
            } else if (drmScheme === 'playready' && licenseUrl) {
                config.drm.servers['com.microsoft.playready'] = licenseUrl;
            }

            player.configure(config);

            if (manifestUrl) {
                try {
                    await player.load(manifestUrl);
                    if (autoPlay) {
                        videoRef.current.play();
                    }
                    setError(null);
                } catch (e) {
                    console.error('Load Error:', e);
                    setError(e);
                }
            }
        };

        const timer = setTimeout(initPlayer, 100);

        return () => {
            clearTimeout(timer);
            if (uiRef.current) {
                uiRef.current.destroy();
            }
            if (playerRef.current) {
                playerRef.current.destroy();
            }
        };
    }, [manifestUrl, drmScheme, clearKeys, licenseUrl, userAgent, referrer, authorization]);

    // Handle double-click for native fullscreen
    const handleDoubleClick = () => {
        const container = containerRef.current;
        if (!container) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            container.requestFullscreen().catch(err => {
                console.error('Fullscreen error:', err);
            });
        }
    };

    return (
        <div
            className="video-container"
            ref={containerRef}
            onDoubleClick={handleDoubleClick}
            style={{ width: '100%', height: '100%', background: '#000' }}
        >
            {error && (
                <div style={{
                    position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1000,
                    background: 'rgba(255, 0, 0, 0.7)', padding: '10px', borderRadius: '4px', color: 'white'
                }}>
                    Error: {error.message || 'Unknown error code ' + error.code}
                </div>
            )}
            <video
                ref={videoRef}
                className="shaka-video"
                style={{ width: '100%', height: '100%' }}
                autoPlay={autoPlay}
            />
        </div>
    );
};

export default Player;
