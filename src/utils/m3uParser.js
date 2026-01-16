export const parseM3U = (content) => {
    const lines = content.split('\n');
    const playlists = [];
    let currentItem = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            // Start a new item
            currentItem = {
                name: 'Unknown Stream',
                group: 'General',
                logo: '',
                drmScheme: '',
                clearKeys: '',
                licenseUrl: '',
                headers: {},
                userAgent: '',
                referrer: ''
            };

            // Parse name after comma
            const commaIndex = line.lastIndexOf(',');
            if (commaIndex !== -1) {
                currentItem.name = line.substring(commaIndex + 1).trim();
            }

            // Extract Attributes
            const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
            if (tvgNameMatch) currentItem.name = tvgNameMatch[1];

            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            if (logoMatch) currentItem.logo = logoMatch[1];

            const groupMatch = line.match(/group-title="([^"]*)"/);
            if (groupMatch) currentItem.group = groupMatch[1];
        
        } else if (line.startsWith('#KODIPROP:') && currentItem) {
            const prop = line.substring(10).trim();
            const eqIndex = prop.indexOf('=');
            if (eqIndex === -1) continue;
            
            const key = prop.substring(0, eqIndex);
            const value = prop.substring(eqIndex + 1);
            
            if (key === 'inputstream.adaptive.license_type') {
                if (value === 'clearkey') currentItem.drmScheme = 'clearkey';
                else if (value === 'com.widevine.alpha') currentItem.drmScheme = 'widevine';
            } else if (key === 'inputstream.adaptive.license_key') {
                currentItem.clearKeys = value; 
            }
        
        } else if (!line.startsWith('#') && currentItem) {
            // It's a URL - commit the item
            currentItem.manifestUrl = line;
            currentItem.id = crypto.randomUUID();
            playlists.push(currentItem);
            currentItem = null; // Reset for next item
        }
    }

    return playlists;
};
