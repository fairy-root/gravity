/**
 * Generates M3U playlist content from library items
 * @param {Array} items - Array of stream items from the library
 * @returns {string} - M3U formatted string
 */
export const generateM3U = (items) => {
    if (!items || items.length === 0) {
        return '#EXTM3U\n';
    }

    let content = '#EXTM3U\n';

    items.forEach((item) => {
        // Build EXTINF line with attributes
        let extinf = '#EXTINF:-1';

        if (item.name) {
            extinf += ` tvg-name="${item.name}"`;
        }
        if (item.logo) {
            extinf += ` tvg-logo="${item.logo}"`;
        }
        if (item.group) {
            extinf += ` group-title="${item.group}"`;
        }

        extinf += `,${item.name || 'Unknown Stream'}`;
        content += extinf + '\n';

        // Add KODIPROP lines for DRM
        if (item.drmScheme) {
            if (item.drmScheme === 'clearkey') {
                content += '#KODIPROP:inputstream.adaptive.license_type=clearkey\n';
                if (item.clearKeys) {
                    content += `#KODIPROP:inputstream.adaptive.license_key=${item.clearKeys}\n`;
                }
            } else if (item.drmScheme === 'widevine') {
                content += '#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha\n';
                if (item.licenseUrl) {
                    content += `#KODIPROP:inputstream.adaptive.license_key=${item.licenseUrl}\n`;
                }
            }
        }

        // Add stream URL
        if (item.manifestUrl) {
            content += item.manifestUrl + '\n';
        }
    });

    return content;
};

/**
 * Triggers a download of the M3U file
 * @param {Array} items - Array of stream items
 * @param {string} filename - Name of the file to download
 */
export const downloadM3U = (items, filename = 'gravity_playlist.m3u') => {
    const content = generateM3U(items);
    const blob = new Blob([content], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
};
