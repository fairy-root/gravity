import React, { useState, useRef } from 'react';

const StreamConfig = ({ config, onConfigChange, onSubmit, onSaveToLibrary, onImportM3U, isEditing, onCancelEdit }) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [importMode, setImportMode] = useState(false);
    const [m3uContent, setM3uContent] = useState('');
    const fileInputRef = useRef(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        onConfigChange(prev => ({ ...prev, [name]: value }));
    };

    const handleImportClick = () => {
        if (m3uContent.includes('#EXTINF')) {
            onImportM3U(m3uContent);
            setM3uContent('');
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            if (content.includes('#EXTINF') || content.includes('#EXTM3U')) {
                onImportM3U(content);
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>

            {/* Edit Banner */}
            {isEditing && (
                <div style={{
                    background: 'var(--accent-glow)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid var(--accent)'
                }}>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-light)', fontWeight: 500 }}>EDITING</span>
                        <p style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '2px' }}>{config.name}</p>
                    </div>
                    <button onClick={onCancelEdit} className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
                        Cancel
                    </button>
                </div>
            )}

            {/* Mode Toggle */}
            {!isEditing && (
                <div className="tab-group" style={{ marginBottom: '20px' }}>
                    <button
                        type="button"
                        onClick={() => setImportMode(false)}
                        className={`tab-btn ${!importMode ? 'active' : ''}`}
                    >
                        Single Stream
                    </button>
                    <button
                        type="button"
                        onClick={() => setImportMode(true)}
                        className={`tab-btn ${importMode ? 'active' : ''}`}
                    >
                        Import M3U
                    </button>
                </div>
            )}

            {importMode && !isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>
                    {/* File Upload */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept=".m3u,.m3u8,.txt"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-secondary"
                        style={{ width: '100%', padding: '14px' }}
                    >
                        Load M3U File
                    </button>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        color: 'var(--text-muted)',
                        fontSize: '0.8rem'
                    }}>
                        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }}></span>
                        or paste content
                        <span style={{ flex: 1, height: '1px', background: 'var(--border)' }}></span>
                    </div>

                    <textarea
                        style={{ flex: 1, minHeight: '140px' }}
                        placeholder={`#EXTM3U
#EXTINF:-1 tvg-name="Channel" group-title="Group",Channel Name
#KODIPROP:inputstream.adaptive.license_key=kid:key
https://stream.url/manifest.mpd`}
                        value={m3uContent}
                        onChange={(e) => setM3uContent(e.target.value)}
                    />
                    <button type="button" onClick={handleImportClick} className="btn btn-primary" style={{ marginTop: 'auto' }}>
                        Import to Library
                    </button>
                </div>
            ) : (
                <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div className="form-group">
                        <label>Name</label>
                        <input
                            type="text"
                            name="name"
                            value={config.name || ''}
                            onChange={handleChange}
                            placeholder="My Stream"
                        />
                    </div>

                    <div className="form-group">
                        <label>Group <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                        <input
                            type="text"
                            name="group"
                            value={config.group || ''}
                            onChange={handleChange}
                            placeholder="Sports, Movies, MBC..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Logo URL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                        <input
                            type="text"
                            name="logo"
                            value={config.logo || ''}
                            onChange={handleChange}
                            placeholder="https://example.com/logo.png"
                        />
                    </div>

                    <div className="form-group">
                        <label>Manifest URL</label>
                        <input
                            type="text"
                            name="manifestUrl"
                            value={config.manifestUrl || ''}
                            onChange={handleChange}
                            placeholder="https://example.com/stream.mpd"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>DRM Protection</label>
                        <select name="drmScheme" value={config.drmScheme || ''} onChange={handleChange}>
                            <option value="">None</option>
                            <option value="clearkey">ClearKey</option>
                            <option value="widevine">Widevine</option>
                            <option value="playready">PlayReady</option>
                        </select>
                    </div>

                    {config.drmScheme === 'clearkey' && (
                        <div className="form-group">
                            <label>Clear Keys</label>
                            <textarea
                                name="clearKeys"
                                value={config.clearKeys || ''}
                                onChange={handleChange}
                                placeholder="keyId:key"
                                style={{ minHeight: '60px' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Format: kid:key (hex). Multiple: kid1:key1,kid2:key2
                            </span>
                        </div>
                    )}

                    {(config.drmScheme === 'widevine' || config.drmScheme === 'playready') && (
                        <>
                            <div className="form-group">
                                <label>License Server URL</label>
                                <input
                                    type="text"
                                    name="licenseUrl"
                                    value={config.licenseUrl || ''}
                                    onChange={handleChange}
                                    placeholder="https://license.server.com/..."
                                />
                            </div>
                            <div className="form-group">
                                <label>
                                    {config.drmScheme === 'widevine' ? 'WVD Device File' : 'PlayReady Device File'} (Optional)
                                </label>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        name="deviceFile"
                                        value={config.deviceFile || ''}
                                        onChange={handleChange}
                                        placeholder={config.drmScheme === 'widevine' ? 'device.wvd' : 'device.prd'}
                                        style={{ flex: 1 }}
                                        readOnly
                                    />
                                    <input
                                        type="file"
                                        id="deviceFileInput"
                                        accept={config.drmScheme === 'widevine' ? '.wvd' : '.prd,.xml'}
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (event) => {
                                                    onConfigChange(prev => ({
                                                        ...prev,
                                                        deviceFile: file.name,
                                                        deviceFileData: event.target.result
                                                    }));
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                            e.target.value = '';
                                        }}
                                        style={{ display: 'none' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('deviceFileInput')?.click()}
                                        className="btn btn-secondary"
                                        style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}
                                    >
                                        Browse
                                    </button>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                    {config.drmScheme === 'widevine'
                                        ? 'Load .wvd file for custom CDM (requires proxy server)'
                                        : 'Load PlayReady device file (requires proxy server)'
                                    }
                                </span>
                            </div>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="btn btn-ghost"
                        style={{
                            justifyContent: 'flex-start',
                            padding: '8px 0',
                            marginBottom: '8px',
                            color: 'var(--accent-light)',
                            fontSize: '0.8rem'
                        }}
                    >
                        <span style={{ fontSize: '0.7rem' }}>{showAdvanced ? '▼' : '▶'}</span>
                        Advanced Options
                    </button>

                    {showAdvanced && (
                        <div style={{
                            paddingLeft: '12px',
                            borderLeft: '2px solid var(--border-light)',
                            marginBottom: '16px'
                        }}>
                            <div className="form-group">
                                <label>User Agent</label>
                                <input type="text" name="userAgent" value={config.userAgent || ''} onChange={handleChange} placeholder="Mozilla/5.0..." />
                            </div>
                            <div className="form-group">
                                <label>Referrer</label>
                                <input type="text" name="referrer" value={config.referrer || ''} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Authorization</label>
                                <input type="text" name="authorization" value={config.authorization || ''} onChange={handleChange} placeholder="Bearer token..." />
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                        <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                            ▶ Play
                        </button>
                        <button
                            type="button"
                            onClick={onSaveToLibrary}
                            className={`btn ${isEditing ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ flex: 1 }}
                        >
                            {isEditing ? 'Update' : 'Save'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default StreamConfig;
