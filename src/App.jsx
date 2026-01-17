import React, { useState, useEffect, useRef } from 'react';
import Player from './components/Player';
import StreamConfig from './components/StreamConfig';
import Library from './components/Library';
import ConfirmModal from './components/ConfirmModal';
import MobileNav from './components/MobileNav';
import MobileTabBar from './components/MobileTabBar';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isFirstRender = useRef(true);

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
  };

  const handleImportM3U = (content) => {
    const playlists = parseM3U(content);
    if (playlists.length > 0) {
      const withTimestamp = playlists.map(p => ({ ...p, addedAt: Date.now() }));
      setLibrary(prev => [...prev, ...withTimestamp]);
      setView('library');
    }
  };

  const handlePlayFromLibrary = (item) => {
    setActiveConfig(item);
    setView('player');
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

  const handleClearAll = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Clear Library',
      message: `Are you sure you want to delete all ${library.length} streams? This action cannot be undone.`,
      onConfirm: () => {
        setLibrary([]);
        setEditingId(null);
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleEdit = (item) => {
    setFormConfig({ ...item });
    setEditingId(item.id);
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
    <div className="app-container">
      {/* Mobile Navigation */}
      <MobileNav
        onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        currentView={view}
        drawerOpen={mobileMenuOpen}
      />

      {/* Mobile Drawer Overlay */}
      <div
        className={`drawer-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar (desktop) / Drawer (mobile) */}
      <aside className={`sidebar ${mobileMenuOpen ? 'drawer-open' : ''}`}>
        <div style={{ marginBottom: '24px' }}>
          <h1
            style={{ cursor: 'pointer', marginBottom: '4px' }}
            onClick={() => { setView('library'); setMobileMenuOpen(false); }}
          >
            Gravity
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Network Stream Player</p>
        </div>

        <div className="tab-group" style={{ marginBottom: '24px' }}>
          <button
            type="button"
            onClick={() => { setView('library'); setMobileMenuOpen(false); }}
            className={`tab-btn ${view === 'library' ? 'active' : ''}`}
          >
            Library
          </button>
          <button
            type="button"
            onClick={() => { setView('player'); setMobileMenuOpen(false); }}
            className={`tab-btn ${view === 'player' ? 'active' : ''}`}
          >
            Player {activeConfig && '●'}
          </button>
        </div>

        <StreamConfig
          config={formConfig}
          onConfigChange={setFormConfig}
          onSubmit={(e) => { handlePlay(e); setMobileMenuOpen(false); }}
          onSaveToLibrary={() => { handleSaveToLibrary(); setMobileMenuOpen(false); }}
          onImportM3U={(content) => { handleImportM3U(content); setMobileMenuOpen(false); }}
          isEditing={!!editingId}
          onCancelEdit={handleCancelEdit}
        />
      </aside>

      {/* Main */}
      <main className="player-area" style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: view === 'player' ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {activeConfig ? (
            <Player
              manifestUrl={activeConfig.manifestUrl}
              drmScheme={activeConfig.drmScheme}
              clearKeys={activeConfig.clearKeys}
              licenseUrl={activeConfig.licenseUrl}
              userAgent={activeConfig.userAgent}
              referrer={activeConfig.referrer}
              authorization={activeConfig.authorization}
              autoPlay={true}
            />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', maxWidth: '300px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📡</div>
              <h2 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '8px', textTransform: 'none', letterSpacing: 0 }}>
                No stream playing
              </h2>
              <p style={{ fontSize: '0.875rem' }}>
                Enter a stream URL in the sidebar or select one from your library
              </p>
            </div>
          )}
        </div>

        <div style={{
          position: 'absolute',
          inset: 0,
          display: view === 'library' ? 'block' : 'none',
          overflow: 'auto'
        }}>
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
            onClearAll={handleClearAll}
            totalCount={library.length}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            prefs={prefs}
            onPrefsChange={setPrefs}
          />
        </div>
      </main>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false })}
      />

      {/* Mobile Bottom Tab Bar */}
      <MobileTabBar
        currentView={view}
        onViewChange={(newView) => { setView(newView); setMobileMenuOpen(false); }}
      />
    </div>
  );
}

export default App;
