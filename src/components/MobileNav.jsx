import React from 'react';

const MobileNav = ({ onMenuToggle, currentView, drawerOpen }) => {
    return (
        <>
            {/* Mobile Header */}
            <header className="mobile-nav">
                <button
                    className="hamburger-btn"
                    onClick={onMenuToggle}
                    aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
                >
                    {drawerOpen ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    )}
                </button>
                <h1 onClick={onMenuToggle} style={{ cursor: 'pointer' }}>Gravity</h1>
                <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textTransform: 'capitalize'
                }}>
                    {currentView}
                </span>
            </header>
        </>
    );
};

export default MobileNav;
