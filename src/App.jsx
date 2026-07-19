import React, { useState, useEffect, useRef } from 'react';
import Player from './components/Player';
import StreamConfig from './components/StreamConfig';
import Library from './components/Library';
import ConfirmModal from './components/ConfirmModal';
import { parseM3U } from './utils/m3uParser';

// Helper to load from localStorage
const loadLibraryFromStorage = () => {
  try {
    const saved = localStorage.getItem('gravity_library');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Failed to parse library:', e);
    return [];
  }
};

const loadCollapsedFromStorage = () => {
  try {
    const saved = localStorage.getItem('gravity_collapsed_groups');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    return {};
  }
};

const loadPrefsFromStorage = () => {
  try {
    const saved = localStorage.getItem('gravity_prefs');
    return saved ? JSON.parse(saved) : { sortMode: 'alphabetical', viewMode: 'grid', gridSize: 'medium' };
  } catch (e) {
    return { sortMode: 'alphabetical', viewMode: 'grid', gridSize: 'medium' };
  }
};

function App() {
  const [activeConfig, setActiveConfig] = useState(null);
  // Lazy initialization - loads from localStorage on first render
  const [library, setLibrary] = useState(loadLibraryFromStorage);
  const [view, setView] = useState('library');
  const [editingId, setEditingId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(loadCollapsedFromStorage);
  const [prefs, setPrefs] = useState(loadPrefsFromStorage);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isFirstRender = useRef(true);

  const closeSidebar = () => setSidebarOpen(false);

  const setViewAndClose = (nextView) => {
    setView(nextView);
    setSidebarOpen(false);
  };

  const [formConfig, setFormConfig] = useState({
    name: 'New Stream',
    manifestUrl: '',
    group: '',
    logo: '',
    drmScheme: '',
    clearKeys: '',
    licenseUrl: '',
    userAgent: '',
    referrer: '',
    authorization: ''
  });

  // Save to localStorage when library changes (skip first render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    localStorage.setItem('gravity_library', JSON.stringify(library));
  }, [library]);

  // Save collapsed groups when they change
  useEffect(() => {
    localStorage.setItem('gravity_collapsed_groups', JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  // Save prefs when they change
  useEffect(() => {
    localStorage.setItem('gravity_prefs', JSON.stringify(prefs));
  }, [prefs]);

  // Lock body scroll while mobile drawer is open
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  // Close drawer on Escape
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  // Group items by group name
  const groupedLibrary = library.reduce((acc, item) => {
    const group = item.group || 'Uncategorized';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  // Sort groups based on sortMode
  const sortedGroups = prefs.sortMode === 'alphabetical'
    ? Object.keys(groupedLibrary).sort((a, b) => a.localeCompare(b))
    : Object.keys(groupedLibrary); // default order (insertion order)

  const toggleGroup = (group) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  const collapseAll = () => {
    const allCollapsed = {};
    sortedGroups.forEach(g => allCollapsed[g] = true);
    setCollapsedGroups(allCollapsed);
  };

  const expandAll = () => {
    setCollapsedGroups({});
  };

  const handlePlay = (e) => {
    if (e) e.preventDefault();
    setActiveConfig({ ...formConfig });
    setView('player');
    setSidebarOpen(false);
  };

  const handleSaveToLibrary = () => {
    if (editingId) {
      setLibrary(prev => prev.map(item =>
        item.id === editingId ? { ...formConfig, id: editingId } : item
      ));
      setEditingId(null);
    } else {
      const newItem = { ...formConfig, id: crypto.randomUUID(), addedAt: Date.now() };
      setLibrary(prev => [...prev, newItem]);
    }
    setFormConfig({
      name: 'New Stream',
      manifestUrl: '',
      group: '',
      logo: '',
      drmScheme: '',
      clearKeys: '',
      licenseUrl: '',
      userAgent: '',
      referrer: '',
      authorization: ''
    });
    setSidebarOpen(false);
  };

  const handleImportM3U = (content) => {
    const playlists = parseM3U(content);
    if (playlists.length > 0) {
      const withTimestamp = playlists.map(p => ({ ...p, addedAt: Date.now() }));
      setLibrary(prev => [...prev, ...withTimestamp]);
      setView('library');
      setSidebarOpen(false);
    }
  };

  const handlePlayFromLibrary = (item) => {
    setActiveConfig(item);
    setView('player');
    setSidebarOpen(false);
  };

  const handleEdit = (item) => {
    setFormConfig({ ...item });
    setEditingId(item.id);
    setSidebarOpen(true);
  };

  const handleDelete = (id) => {
    const item = library.find(i => i.id === id);
    setConfirmModal({
      isOpen: true,
      title: 'Delete Channel',
      message: `Are you sure you want to delete "${item?.name || 'this channel'}"? This action cannot be undone.`,
      onConfirm: () => {
        setLibrary(prev => prev.filter(item => item.id !== id));
        if (editingId === id) setEditingId(null);
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleDeleteGroup = (groupName) => {
    const groupItems = library.filter((item) => (item.group || 'Uncategorized') === groupName);
    const count = groupItems.length;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Group',
      message: `Are you sure you want to delete the group "${groupName}" and all ${count} channel${count === 1 ? '' : 's'} in it? This action cannot be undone.`,
      onConfirm: () => {
        const groupIds = new Set(groupItems.map((item) => item.id));
        setLibrary((prev) =>
          prev.filter((item) => (item.group || 'Uncategorized') !== groupName)
        );
        if (editingId && groupIds.has(editingId)) {
          setEditingId(null);
        }
        setCollapsedGroups((prev) => {
          const next = { ...prev };
          delete next[groupName];
          return next;
        });
        // Stop playback if the active channel belonged to this group
        setActiveConfig((current) => {
          if (!current) return current;
          if (current.id && groupIds.has(current.id)) return null;
          const currentGroup = current.group || 'Uncategorized';
          return currentGroup === groupName ? null : current;
        });
        setConfirmModal({ isOpen: false });
      },
    });
  };

  const handleClearAll = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Clear Library',
      message: `Are you sure you want to delete all ${library.length} streams? This action cannot be undone.`,
      onConfirm: () => {
        setLibrary([]);
        setEditingId(null);
        setActiveConfig(null);
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormConfig({
      name: 'New Stream',
      manifestUrl: '',
      group: '',
      logo: '',
      drmScheme: '',
      clearKeys: '',
      licenseUrl: '',
      userAgent: '',
      referrer: '',
      authorization: ''
    });
  };

  return (
    <div className={`app-container${sidebarOpen ? ' sidebar-open' : ''}`}>
      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={sidebarOpen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {sidebarOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
        <h1 className="mobile-topbar-title" onClick={() => setViewAndClose('library')}>
          Gravity
        </h1>
        <span className="mobile-topbar-view">
          {view === 'library' ? 'Library' : 'Player'}
        </span>
      </header>

      {/* Drawer backdrop (mobile) */}
      <div
        className="sidebar-backdrop"
        onClick={closeSidebar}
        aria-hidden={!sidebarOpen}
      />

      {/* Sidebar / config drawer */}
      <aside className={`sidebar${sidebarOpen ? ' is-open' : ''}`} id="app-sidebar">
        <div className="sidebar-brand" style={{ marginBottom: '24px' }}>
          <div className="sidebar-brand-row">
            <h1
              style={{ cursor: 'pointer', marginBottom: '4px' }}
              onClick={() => setViewAndClose('library')}
            >
              Gravity
            </h1>
            <button
              type="button"
              className="sidebar-close-btn"
              onClick={closeSidebar}
              aria-label="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Network Stream Player</p>
        </div>

        <div className="tab-group sidebar-view-tabs" style={{ marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => setViewAndClose('library')}
            className={`tab-btn ${view === 'library' ? 'active' : ''}`}
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => setViewAndClose('player')}
            className={`tab-btn ${view === 'player' ? 'active' : ''}`}
          >
            Player {activeConfig && '●'}
          </button>
        </div>

        <StreamConfig
          config={formConfig}
          onConfigChange={setFormConfig}
          onSubmit={handlePlay}
          onSaveToLibrary={handleSaveToLibrary}
          onImportM3U={handleImportM3U}
          isEditing={!!editingId}
          onCancelEdit={handleCancelEdit}
        />
      </aside>

      {/* Main */}
      <main className="player-area" style={{ position: 'relative' }}>
        <div
          className="view-panel"
          style={{
            display: view === 'player' ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {activeConfig ? (
            <Player
              manifestUrl={activeConfig.manifestUrl}
              drmScheme={activeConfig.drmScheme}
              clearKeys={activeConfig.clearKeys}
              licenseUrl={activeConfig.licenseUrl}
              userAgent={activeConfig.userAgent}
              referrer={activeConfig.referrer}
              authorization={activeConfig.authorization}
              headers={activeConfig.headers}
              channelName={activeConfig.name}
              channelLogo={activeConfig.logo}
              autoPlay={true}
            />
          ) : (
            <div className="empty-player" style={{ textAlign: 'center', color: 'var(--text-muted)', maxWidth: '300px', padding: '0 16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📡</div>
              <h2 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'none', letterSpacing: 0 }}>
                No stream playing
              </h2>
              <p style={{ fontSize: '0.875rem' }}>
                Enter a stream URL in the menu or select one from your library
              </p>
            </div>
          )}
        </div>

        <div
          className="view-panel"
          style={{
            display: view === 'library' ? 'block' : 'none',
            overflow: 'auto'
          }}
        >
          <Library
            groupedItems={groupedLibrary}
            sortedGroups={sortedGroups}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            onToggleAll={() => {
              const allCollapsed = sortedGroups.every(g => collapsedGroups[g]);
              if (allCollapsed) {
                setCollapsedGroups({});
              } else {
                const all = {};
                sortedGroups.forEach(g => all[g] = true);
                setCollapsedGroups(all);
              }
            }}
            allCollapsed={sortedGroups.length > 0 && sortedGroups.every(g => collapsedGroups[g])}
            onPlay={handlePlayFromLibrary}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDeleteGroup={handleDeleteGroup}
            onClearAll={handleClearAll}
            totalCount={library.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            prefs={prefs}
            onPrefsChange={setPrefs}
          />
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav" aria-label="Main">
        <button
          type="button"
          className={`mobile-nav-btn ${view === 'library' ? 'active' : ''}`}
          onClick={() => setViewAndClose('library')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Library</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${view === 'player' ? 'active' : ''}`}
          onClick={() => setViewAndClose('player')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="6 3 20 12 6 21 6 3" fill={view === 'player' ? 'currentColor' : 'none'} />
          </svg>
          <span>Player{activeConfig ? ' ●' : ''}</span>
        </button>
      </nav>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false })}
      />
    </div>
  );
}

export default App;
