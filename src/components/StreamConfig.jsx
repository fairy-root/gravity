import React, { useState, useRef, useEffect } from 'react';
import { DEFAULT_USER_AGENT } from '../utils/streamHeaders';

const emptyCustomHeader = () => ({ id: crypto.randomUUID(), line: '' });

/** Convert headers object → list of editable "Key: Value" rows */
const headersToRows = (headers) => {
  if (!headers || typeof headers !== 'object') return [];
  return Object.entries(headers)
    .filter(([k, v]) => k && v != null && String(v) !== '')
    .map(([k, v]) => ({ id: crypto.randomUUID(), line: `${k}: ${v}` }));
};

/** Convert "Key: Value" rows → headers object (invalid lines skipped) */
const rowsToHeaders = (rows) => {
  const out = {};
  (rows || []).forEach((row) => {
    const raw = (row.line || '').trim();
    if (!raw) return;
    const m = raw.match(/^([A-Za-z0-9!#$%&'*+.^_`|~-]+)\s*:\s*(.*)$/s);
    if (!m) return;
    const key = m[1].trim();
    const value = m[2].trim();
    if (key && value !== '') out[key] = value;
  });
  return out;
};

const hasAdvancedValues = (config) =>
  Boolean(
    (config.userAgent && String(config.userAgent).trim()) ||
      (config.referrer && String(config.referrer).trim()) ||
      (config.origin && String(config.origin).trim()) ||
      (config.authorization && String(config.authorization).trim()) ||
      (config.headers && Object.keys(config.headers).length > 0)
  );

const StreamConfig = ({ config, onConfigChange, onSubmit, onSaveToLibrary, onImportM3U, isEditing, onCancelEdit }) => {
  const [showAdvanced, setShowAdvanced] = useState(() => hasAdvancedValues(config));
  const [importMode, setImportMode] = useState(false);
  const [m3uContent, setM3uContent] = useState('');
  const [customHeaderRows, setCustomHeaderRows] = useState(() => headersToRows(config.headers));
  const fileInputRef = useRef(null);
  const channelKeyRef = useRef(null);

  // When switching channel (edit another / cancel), refresh advanced + custom header rows.
  // Do not depend on config.headers — that would reset rows on every keystroke.
  useEffect(() => {
    const key = isEditing ? `edit:${config.id || ''}` : 'new';
    if (channelKeyRef.current === key) return;
    channelKeyRef.current = key;
    setCustomHeaderRows(headersToRows(config.headers));
    if (hasAdvancedValues(config)) {
      setShowAdvanced(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on channel identity change
  }, [config.id, isEditing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    onConfigChange((prev) => ({ ...prev, [name]: value }));
  };

  const commitCustomHeaders = (rows) => {
    setCustomHeaderRows(rows);
    onConfigChange((prev) => ({
      ...prev,
      headers: rowsToHeaders(rows),
    }));
  };

  const handleCustomHeaderChange = (id, line) => {
    const next = customHeaderRows.map((r) => (r.id === id ? { ...r, line } : r));
    commitCustomHeaders(next);
  };

  const handleAddCustomHeader = () => {
    commitCustomHeaders([...customHeaderRows, emptyCustomHeader()]);
  };

  const handleDeleteCustomHeader = (id) => {
    commitCustomHeaders(customHeaderRows.filter((r) => r.id !== id));
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
                          onConfigChange((prev) => ({
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
                <input
                  type="text"
                  name="userAgent"
                  value={config.userAgent || ''}
                  onChange={handleChange}
                  placeholder={DEFAULT_USER_AGENT}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Overrides the default when set. Applied as the real User-Agent via the stream proxy.
                </span>
              </div>
              <div className="form-group">
                <label>Referrer</label>
                <input
                  type="text"
                  name="referrer"
                  value={config.referrer || ''}
                  onChange={handleChange}
                  placeholder="https://example.com/"
                />
              </div>
              <div className="form-group">
                <label>Origin</label>
                <input
                  type="text"
                  name="origin"
                  value={config.origin || ''}
                  onChange={handleChange}
                  placeholder="https://example.com"
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Optional. From M3U <code>#EXTVLCOPT:http-origin=</code>, or derived from Referrer when empty.
                </span>
              </div>
              <div className="form-group">
                <label>Authorization</label>
                <input
                  type="text"
                  name="authorization"
                  value={config.authorization || ''}
                  onChange={handleChange}
                  placeholder="Bearer token… or Key: Value"
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Accepts a bare value (sent as Authorization) or Key: Value for a custom header name.
                </span>
              </div>

              <div className="form-group" style={{ marginBottom: '8px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginBottom: '6px'
                }}>
                  <label style={{ marginBottom: 0 }}>Custom Headers</label>
                  <button
                    type="button"
                    onClick={handleAddCustomHeader}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  >
                    + Add header
                  </button>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  Format: Key: Value (same as Authorization). Overrides defaults when set.
                </span>

                {customHeaderRows.length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 4px' }}>
                    No custom headers
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {customHeaderRows.map((row) => (
                    <div key={row.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={row.line}
                        onChange={(e) => handleCustomHeaderChange(row.id, e.target.value)}
                        placeholder="X-Api-Key: secret"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomHeader(row.id)}
                        className="btn btn-ghost"
                        title="Remove header"
                        aria-label="Remove header"
                        style={{
                          padding: '8px 10px',
                          color: 'var(--text-muted)',
                          flexShrink: 0
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
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
