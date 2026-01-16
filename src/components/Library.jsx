import React, { useMemo, useRef, useEffect, useState } from 'react';
import { downloadM3U } from '../utils/m3uGenerator';

const Library = ({
    groupedItems,
    sortedGroups,
    collapsedGroups,
    onToggleGroup,
    onToggleAll,
    allCollapsed,
    onPlay,
    onEdit,
    onDelete,
    onClearAll,
    totalCount,
    searchQuery,
    onSearchChange,
    prefs,
    onPrefsChange
}) => {
    const containerRef = useRef(null);
    const [stickyGroup, setStickyGroup] = useState(null);
    const groupRefs = useRef({});

    // Filter items based on search query
    const filteredData = useMemo(() => {
        if (!searchQuery.trim()) {
            return { groups: sortedGroups, items: groupedItems };
        }

        const query = searchQuery.toLowerCase();
        const filtered = {};

        sortedGroups.forEach(group => {
            const groupMatches = group.toLowerCase().includes(query);
            const matchingItems = (groupedItems[group] || []).filter(item =>
                item.name?.toLowerCase().includes(query)
            );

            if (groupMatches || matchingItems.length > 0) {
                filtered[group] = groupMatches ? groupedItems[group] : matchingItems;
            }
        });

        return {
            groups: Object.keys(filtered),
            items: filtered
        };
    }, [searchQuery, sortedGroups, groupedItems]);

    const displayGroups = filteredData.groups;
    const displayItems = filteredData.items;
    const filteredCount = displayGroups.reduce((acc, g) => acc + (displayItems[g]?.length || 0), 0);

    // Handle sticky header on scroll
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const scrollTop = container.scrollTop;
            let currentSticky = null;

            for (const group of displayGroups) {
                const ref = groupRefs.current[group];
                if (ref && ref.offsetTop <= scrollTop + 80) {
                    currentSticky = group;
                }
            }
            setStickyGroup(currentSticky);
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [displayGroups]);

    const handleExportM3U = () => {
        const allItems = sortedGroups.flatMap(group => groupedItems[group] || []);
        downloadM3U(allItems, 'gravity_playlist.m3u');
    };

    const gridCols = {
        small: 'repeat(auto-fill, minmax(200px, 1fr))',
        medium: 'repeat(auto-fill, minmax(280px, 1fr))',
        large: 'repeat(auto-fill, minmax(380px, 1fr))'
    };

    return (
        <div
            ref={containerRef}
            style={{
                padding: '32px 40px',
                width: '100%',
                height: '100%',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.03) 0%, transparent 30%)',
                position: 'relative'
            }}
        >
            {/* Sticky Toolbar (appears on scroll) */}
            {stickyGroup && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 340,
                        right: 0,
                        zIndex: 100,
                        background: 'var(--bg-primary)',
                        padding: '10px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        borderBottom: '1px solid var(--border)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                    }}
                >
                    {/* Compact Search */}
                    <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 34px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)',
                                fontSize: '0.8rem'
                            }}
                        />
                        <svg
                            style={{
                                position: 'absolute',
                                left: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: '14px',
                                height: '14px'
                            }}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--text-muted)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>
                    </div>

                    {/* Current Category Toggle */}
                    <button
                        onClick={() => onToggleGroup(stickyGroup)}
                        style={{
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '6px 12px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <span style={{ fontSize: '0.65rem', transition: 'transform 0.2s', transform: collapsedGroups[stickyGroup] ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                        {stickyGroup}
                        <span style={{
                            background: 'var(--accent-glow)',
                            color: 'var(--accent-light)',
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.65rem'
                        }}>
                            {displayItems[stickyGroup]?.length || 0}
                        </span>
                    </button>

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Action Buttons */}
                    <button
                        onClick={onToggleAll}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                        {allCollapsed ? 'Expand' : 'Collapse'}
                    </button>
                    <button
                        onClick={handleExportM3U}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                        ⬇ Export
                    </button>
                    <button
                        onClick={onClearAll}
                        className="btn btn-danger"
                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                        Clear All
                    </button>
                </div>
            )}

            {/* Header */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                marginBottom: '24px',
                paddingBottom: '20px',
                borderBottom: '1px solid var(--border)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', marginBottom: '4px' }}>Library</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {searchQuery ? `${filteredCount} results` : `${totalCount} streams in ${sortedGroups.length} groups`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {displayGroups.length > 0 && (
                            <button
                                onClick={onToggleAll}
                                className="btn btn-secondary"
                                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                            >
                                {allCollapsed ? 'Expand All' : 'Collapse All'}
                            </button>
                        )}
                        {totalCount > 0 && (
                            <>
                                <button
                                    onClick={handleExportM3U}
                                    className="btn btn-secondary"
                                    style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                    title="Export library to M3U file"
                                >
                                    ⬇ Export
                                </button>
                                <button onClick={onClearAll} className="btn btn-danger" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>
                                    Clear All
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Search Bar */}
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Search channels or groups..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px 16px 12px 44px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem'
                        }}
                    />
                    <svg
                        style={{
                            position: 'absolute',
                            left: '14px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '18px',
                            height: '18px'
                        }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--text-muted)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                    {searchQuery && (
                        <button
                            onClick={() => onSearchChange('')}
                            style={{
                                position: 'absolute',
                                right: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '1.1rem',
                                padding: '4px'
                            }}
                        >✕</button>
                    )}
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Sort */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sort:</span>
                        <select
                            value={prefs.sortMode}
                            onChange={(e) => onPrefsChange({ ...prefs, sortMode: e.target.value })}
                            style={{
                                padding: '6px 10px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)',
                                fontSize: '0.8rem',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="alphabetical">A-Z</option>
                            <option value="default">Default</option>
                        </select>
                    </div>

                    {/* View Mode */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>View:</span>
                        <div style={{
                            display: 'flex',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            overflow: 'hidden'
                        }}>
                            <button
                                onClick={() => onPrefsChange({ ...prefs, viewMode: 'grid' })}
                                style={{
                                    padding: '6px 10px',
                                    background: prefs.viewMode === 'grid' ? 'var(--accent-glow)' : 'transparent',
                                    border: 'none',
                                    color: prefs.viewMode === 'grid' ? 'var(--accent-light)' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem'
                                }}
                                title="Grid view"
                            >⊞</button>
                            <button
                                onClick={() => onPrefsChange({ ...prefs, viewMode: 'list' })}
                                style={{
                                    padding: '6px 10px',
                                    background: prefs.viewMode === 'list' ? 'var(--accent-glow)' : 'transparent',
                                    border: 'none',
                                    color: prefs.viewMode === 'list' ? 'var(--accent-light)' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem'
                                }}
                                title="List view"
                            >☰</button>
                        </div>
                    </div>

                    {/* Grid Size (only in grid mode) */}
                    {prefs.viewMode === 'grid' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Size:</span>
                            <div style={{
                                display: 'flex',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)',
                                overflow: 'hidden'
                            }}>
                                {['small', 'medium', 'large'].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => onPrefsChange({ ...prefs, gridSize: size })}
                                        style={{
                                            padding: '6px 10px',
                                            background: prefs.gridSize === size ? 'var(--accent-glow)' : 'transparent',
                                            border: 'none',
                                            color: prefs.gridSize === size ? 'var(--accent-light)' : 'var(--text-muted)',
                                            cursor: 'pointer',
                                            fontSize: '0.75rem',
                                            textTransform: 'capitalize'
                                        }}
                                    >{size[0].toUpperCase()}</button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Empty State */}
            {totalCount === 0 && (
                <div style={{
                    textAlign: 'center',
                    marginTop: '120px',
                    opacity: 0.6
                }}>
                    <div style={{
                        width: '80px', height: '80px',
                        margin: '0 auto 20px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '32px'
                    }}>📺</div>
                    <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: 0, textTransform: 'none' }}>
                        No streams yet
                    </h2>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Add a stream or import an M3U playlist to get started
                    </p>
                </div>
            )}

            {/* No Results */}
            {totalCount > 0 && displayGroups.length === 0 && searchQuery && (
                <div style={{ textAlign: 'center', marginTop: '80px', opacity: 0.6 }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                    <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
                        No results found
                    </h2>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Try a different search term
                    </p>
                </div>
            )}

            {/* Groups */}
            {displayGroups.map(group => {
                const items = displayItems[group] || [];
                const isCollapsed = collapsedGroups[group] && !searchQuery;

                return (
                    <div
                        key={group}
                        ref={el => groupRefs.current[group] = el}
                        style={{ marginBottom: '24px' }}
                    >
                        {/* Group Header */}
                        <button
                            onClick={() => onToggleGroup(group)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 16px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                color: 'var(--text-primary)',
                                marginBottom: isCollapsed ? 0 : '16px',
                                transition: 'all 0.2s'
                            }}
                        >
                            <span style={{
                                fontSize: '0.75rem',
                                transition: 'transform 0.2s',
                                transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
                            }}>▼</span>
                            <span style={{ fontWeight: 600, flex: 1, textAlign: 'left' }}>{group}</span>
                            <span style={{
                                background: 'var(--accent-glow)',
                                color: 'var(--accent-light)',
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.75rem',
                                fontWeight: 600
                            }}>{items.length}</span>
                        </button>

                        {/* Group Items */}
                        {!isCollapsed && (
                            prefs.viewMode === 'grid' ? (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: gridCols[prefs.gridSize],
                                    gap: '16px',
                                    paddingLeft: '8px'
                                }}>
                                    {items.map(item => (
                                        <div
                                            key={item.id}
                                            className="stream-card"
                                            style={{
                                                ...(prefs.gridSize === 'small' ? { padding: '12px' } : {}),
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            {/* Background Logo */}
                                            {item.logo && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '-10%',
                                                    right: '0%',
                                                    width: '70%',
                                                    height: '120%',
                                                    opacity: 0.08,
                                                    pointerEvents: 'none',
                                                    maskImage: 'radial-gradient(ellipse 80% 80% at 70% 30%, black 0%, transparent 70%)',
                                                    WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 70% 30%, black 0%, transparent 70%)'
                                                }}>
                                                    <img
                                                        src={item.logo}
                                                        alt=""
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'contain',
                                                            objectPosition: 'top right',
                                                            filter: 'grayscale(30%)'
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            {/* Background Gravity Watermark for no-logo channels */}
                                            {!item.logo && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '8px',
                                                    right: '8px',
                                                    fontSize: prefs.gridSize === 'small' ? '2rem' : '3rem',
                                                    fontWeight: 900,
                                                    color: 'rgba(255,255,255,0.04)',
                                                    letterSpacing: '0.1em',
                                                    textTransform: 'uppercase',
                                                    pointerEvents: 'none',
                                                    whiteSpace: 'nowrap',
                                                    userSelect: 'none'
                                                }}>
                                                    GRAVITY
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: prefs.gridSize === 'small' ? '10px' : '14px', marginBottom: prefs.gridSize === 'small' ? '10px' : '14px', position: 'relative', zIndex: 1 }}>
                                                {/* Channel Logo */}
                                                <div style={{
                                                    width: prefs.gridSize === 'small' ? '40px' : prefs.gridSize === 'large' ? '64px' : '52px',
                                                    height: prefs.gridSize === 'small' ? '40px' : prefs.gridSize === 'large' ? '64px' : '52px',
                                                    flexShrink: 0,
                                                    borderRadius: 'var(--radius-md)',
                                                    background: item.logo ? 'var(--bg-tertiary)' : `linear-gradient(135deg, hsl(${(item.name?.charCodeAt(0) || 0) * 3}, 60%, 45%) 0%, hsl(${(item.name?.charCodeAt(0) || 0) * 3 + 40}, 50%, 35%) 100%)`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: prefs.gridSize === 'small' ? '16px' : prefs.gridSize === 'large' ? '24px' : '20px',
                                                    fontWeight: 700,
                                                    color: 'white',
                                                    overflow: 'hidden',
                                                    boxShadow: item.logo
                                                        ? '0 2px 8px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.1)'
                                                        : '0 4px 12px rgba(0,0,0,0.3)',
                                                    border: item.logo ? '1px solid rgba(255,255,255,0.08)' : 'none',
                                                    position: 'relative'
                                                }}>
                                                    {item.logo ? (
                                                        <img
                                                            src={item.logo}
                                                            alt=""
                                                            style={{
                                                                width: '85%',
                                                                height: '85%',
                                                                objectFit: 'contain',
                                                                borderRadius: '4px'
                                                            }}
                                                            onError={(e) => {
                                                                e.target.style.display = 'none';
                                                                e.target.parentElement.style.background = `linear-gradient(135deg, hsl(${(item.name?.charCodeAt(0) || 0) * 3}, 60%, 45%) 0%, hsl(${(item.name?.charCodeAt(0) || 0) * 3 + 40}, 50%, 35%) 100%)`;
                                                            }}
                                                        />
                                                    ) : (
                                                        /* Modern Monitor Icon SVG */
                                                        <svg
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            style={{
                                                                width: '55%',
                                                                height: '55%',
                                                                opacity: 0.9,
                                                                filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))'
                                                            }}
                                                        >
                                                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                                            <line x1="8" y1="21" x2="16" y2="21" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <h3 style={{
                                                        fontSize: prefs.gridSize === 'small' ? '0.85rem' : '1rem',
                                                        fontWeight: 600,
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        marginBottom: '4px'
                                                    }}>{item.name}</h3>
                                                    {item.drmScheme && (
                                                        <span className="badge" style={prefs.gridSize === 'small' ? { fontSize: '0.6rem', padding: '2px 5px' } : {}}>{item.drmScheme}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: prefs.gridSize === 'small' ? '4px' : '8px', flexWrap: 'wrap' }}>
                                                <button onClick={() => onPlay(item)} className="btn btn-primary" style={prefs.gridSize === 'small' ? { flex: 1, padding: '6px 8px', fontSize: '0.75rem' } : { flex: 1 }}>
                                                    <span>▶</span>{prefs.gridSize !== 'small' && ' Play'}
                                                </button>
                                                <button onClick={() => onEdit(item)} className="btn btn-secondary" style={prefs.gridSize === 'small' ? { padding: '6px 8px', fontSize: '0.75rem' } : {}}>
                                                    {prefs.gridSize === 'small' ? '✎' : 'Edit'}
                                                </button>
                                                <button onClick={() => onDelete(item.id)} className="btn btn-danger" style={prefs.gridSize === 'small' ? { padding: '6px 8px', fontSize: '0.75rem' } : { padding: '10px 12px' }}>✕</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                /* List View */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px' }}>
                                    {items.map(item => (
                                        <div
                                            key={item.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '10px 14px',
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 'var(--radius-md)',
                                                transition: 'border-color 0.2s'
                                            }}
                                            className="list-item-hover"
                                        >
                                            <div style={{
                                                width: '40px', height: '40px', flexShrink: 0,
                                                borderRadius: 'var(--radius-sm)',
                                                background: item.logo ? 'var(--bg-tertiary)' : `linear-gradient(135deg, hsl(${(item.name?.charCodeAt(0) || 0) * 3}, 60%, 45%) 0%, hsl(${(item.name?.charCodeAt(0) || 0) * 3 + 40}, 50%, 35%) 100%)`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '16px',
                                                fontWeight: 700,
                                                color: 'white',
                                                overflow: 'hidden',
                                                border: item.logo ? '1px solid rgba(255,255,255,0.08)' : 'none',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                                            }}>
                                                {item.logo ? (
                                                    <img
                                                        src={item.logo}
                                                        alt=""
                                                        style={{ width: '80%', height: '80%', objectFit: 'contain' }}
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            e.target.parentElement.style.background = `linear-gradient(135deg, hsl(${(item.name?.charCodeAt(0) || 0) * 3}, 60%, 45%) 0%, hsl(${(item.name?.charCodeAt(0) || 0) * 3 + 40}, 50%, 35%) 100%)`;
                                                        }}
                                                    />
                                                ) : (
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        style={{ width: '55%', height: '55%', opacity: 0.9 }}
                                                    >
                                                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                                        <line x1="8" y1="21" x2="16" y2="21" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span style={{ flex: 1, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.name}
                                            </span>
                                            {item.drmScheme && (
                                                <span className="badge" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>{item.drmScheme}</span>
                                            )}
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button onClick={() => onPlay(item)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>▶ Play</button>
                                                <button onClick={() => onEdit(item)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Edit</button>
                                                <button onClick={() => onDelete(item.id)} className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>✕</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default Library;
