import React, { useMemo, useRef, useEffect, useState } from 'react';
import { downloadM3U } from '../utils/m3uGenerator';

/** Compact stroke icons for toolbar / card actions (16px default). */
const Icon = ({ children, size = 16, ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
    >
        {children}
    </svg>
);

const IconPlay = (p) => (
    <Icon {...p} fill="currentColor" stroke="none">
        <polygon points="6 3 20 12 6 21 6 3" />
    </Icon>
);
const IconEdit = (p) => (
    <Icon {...p}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
);
const IconTrash = (p) => (
    <Icon {...p}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
    </Icon>
);
const IconDownload = (p) => (
    <Icon {...p}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </Icon>
);
const IconExpand = (p) => (
    <Icon {...p}>
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
    </Icon>
);
const IconCollapse = (p) => (
    <Icon {...p}>
        <polyline points="4 14 10 14 10 20" />
        <polyline points="20 10 14 10 14 4" />
        <line x1="14" y1="10" x2="21" y2="3" />
        <line x1="3" y1="21" x2="10" y2="14" />
    </Icon>
);
const IconClose = (p) => (
    <Icon {...p}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
);

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
    onDeleteGroup,
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

    return (
        <div ref={containerRef} className="library-root">
            {/* Sticky Toolbar (appears on scroll) */}
            {stickyGroup && (
                <div className="library-sticky-toolbar">
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
                        type="button"
                        onClick={onToggleAll}
                        className="btn btn-secondary btn-icon-action"
                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                        title={allCollapsed ? 'Expand all' : 'Collapse all'}
                        aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}
                    >
                        {allCollapsed ? <IconExpand /> : <IconCollapse />}
                        <span className="btn-text">{allCollapsed ? 'Expand' : 'Collapse'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleExportM3U}
                        className="btn btn-secondary btn-icon-action"
                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                        title="Export library to M3U"
                        aria-label="Export library to M3U"
                    >
                        <IconDownload />
                        <span className="btn-text">Export</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClearAll}
                        className="btn btn-danger btn-icon-action"
                        style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                        title="Clear all"
                        aria-label="Clear all"
                    >
                        <IconTrash />
                        <span className="btn-text">Clear All</span>
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
                <div className="library-header-row">
                    <div>
                        <h1 style={{ fontSize: '1.75rem', marginBottom: '4px' }}>Library</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            {searchQuery ? `${filteredCount} results` : `${totalCount} streams in ${sortedGroups.length} groups`}
                        </p>
                    </div>
                    <div className="library-header-actions">
                        {displayGroups.length > 0 && (
                            <button
                                type="button"
                                onClick={onToggleAll}
                                className="btn btn-secondary btn-icon-action"
                                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                title={allCollapsed ? 'Expand all' : 'Collapse all'}
                                aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}
                            >
                                {allCollapsed ? <IconExpand /> : <IconCollapse />}
                                <span className="btn-text">{allCollapsed ? 'Expand All' : 'Collapse All'}</span>
                            </button>
                        )}
                        {totalCount > 0 && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleExportM3U}
                                    className="btn btn-secondary btn-icon-action"
                                    style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                    title="Export library to M3U file"
                                    aria-label="Export library to M3U file"
                                >
                                    <IconDownload />
                                    <span className="btn-text">Export</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={onClearAll}
                                    className="btn btn-danger btn-icon-action"
                                    style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                    title="Clear all"
                                    aria-label="Clear all"
                                >
                                    <IconTrash />
                                    <span className="btn-text">Clear All</span>
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
                            type="button"
                            onClick={() => onSearchChange('')}
                            aria-label="Clear search"
                            style={{
                                position: 'absolute',
                                right: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <IconClose size={18} />
                        </button>
                    )}
                </div>

                {/* Toolbar */}
                <div className="library-toolbar">
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
                <div className="library-empty-state" style={{
                    textAlign: 'center',
                    marginTop: 'min(120px, 18vh)',
                    opacity: 0.6,
                    padding: '0 12px'
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
                        <div
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 10px 8px 16px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-primary)',
                                marginBottom: isCollapsed ? 0 : '16px',
                                transition: 'all 0.2s'
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => onToggleGroup(group)}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'inherit',
                                    padding: '4px 0',
                                    minWidth: 0
                                }}
                            >
                                <span style={{
                                    fontSize: '0.75rem',
                                    transition: 'transform 0.2s',
                                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
                                }}>▼</span>
                                <span style={{
                                    fontWeight: 600,
                                    flex: 1,
                                    textAlign: 'left',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>{group}</span>
                                <span style={{
                                    background: 'var(--accent-glow)',
                                    color: 'var(--accent-light)',
                                    padding: '2px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.75rem',
                                    fontWeight: 600
                                }}>{items.length}</span>
                            </button>
                            {onDeleteGroup && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteGroup(group);
                                    }}
                                    className="btn btn-danger btn-icon-action"
                                    title={`Delete group "${group}"`}
                                    aria-label={`Delete group ${group}`}
                                    style={{
                                        padding: '6px 10px',
                                        fontSize: '0.75rem',
                                        flexShrink: 0
                                    }}
                                >
                                    <IconTrash />
                                    <span className="btn-text">Delete</span>
                                </button>
                            )}
                        </div>

                        {/* Group Items */}
                        {!isCollapsed && (
                            prefs.viewMode === 'grid' ? (
                                <div className={`library-grid grid-${prefs.gridSize || 'medium'}`}>
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
                                            <div className="stream-card-actions" style={{ display: 'flex', gap: prefs.gridSize === 'small' ? '4px' : '8px', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => onPlay(item)}
                                                    className="btn btn-primary btn-icon-action"
                                                    title="Play"
                                                    aria-label={`Play ${item.name || 'stream'}`}
                                                    style={prefs.gridSize === 'small' ? { flex: 1, padding: '6px 8px', fontSize: '0.75rem' } : { flex: 1 }}
                                                >
                                                    <IconPlay />
                                                    <span className="btn-text">Play</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit(item)}
                                                    className="btn btn-secondary btn-icon-action"
                                                    title="Edit"
                                                    aria-label={`Edit ${item.name || 'stream'}`}
                                                    style={prefs.gridSize === 'small' ? { padding: '6px 8px', fontSize: '0.75rem' } : {}}
                                                >
                                                    <IconEdit />
                                                    <span className="btn-text">Edit</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDelete(item.id)}
                                                    className="btn btn-danger btn-icon-action"
                                                    title="Delete"
                                                    aria-label={`Delete ${item.name || 'stream'}`}
                                                    style={prefs.gridSize === 'small' ? { padding: '6px 8px', fontSize: '0.75rem' } : { padding: '10px 12px' }}
                                                >
                                                    <IconTrash />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                /* List View */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: 0 }}>
                                    {items.map(item => (
                                        <div
                                            key={item.id}
                                            className="list-item-hover library-list-item"
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
                                            <div className="library-list-actions">
                                                <button
                                                    type="button"
                                                    onClick={() => onPlay(item)}
                                                    className="btn btn-primary btn-icon-action"
                                                    title="Play"
                                                    aria-label={`Play ${item.name || 'stream'}`}
                                                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                                >
                                                    <IconPlay />
                                                    <span className="btn-text">Play</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit(item)}
                                                    className="btn btn-secondary btn-icon-action"
                                                    title="Edit"
                                                    aria-label={`Edit ${item.name || 'stream'}`}
                                                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                                >
                                                    <IconEdit />
                                                    <span className="btn-text">Edit</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDelete(item.id)}
                                                    className="btn btn-danger btn-icon-action"
                                                    title="Delete"
                                                    aria-label={`Delete ${item.name || 'stream'}`}
                                                    style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                                                >
                                                    <IconTrash />
                                                </button>
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
