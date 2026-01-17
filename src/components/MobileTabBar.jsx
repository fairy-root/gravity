import React from 'react';

const MobileTabBar = ({ currentView, onViewChange }) => {
    return (
        <nav className="mobile-tab-bar">
            <button
                className={currentView === 'library' ? 'active' : ''}
                onClick={() => onViewChange('library')}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                </svg>
                Library
            </button>
            <button
                className={currentView === 'player' ? 'active' : ''}
                onClick={() => onViewChange('player')}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Player
            </button>
        </nav>
    );
};

export default MobileTabBar;
