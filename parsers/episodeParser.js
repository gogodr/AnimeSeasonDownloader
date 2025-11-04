/**
 * Parses episode number from torrent title
 * @param {string} title - Torrent title to parse
 * @returns {number|null} Episode number or null if not found
 */
export function parseEpisode(title) {
    if (!title || typeof title !== 'string') return null;
    
    const t = title.replace(/。/g, '.');
    const patterns = [
        /\bS\d{1,2}E(\d{1,3})\b/i,
        /\bSeason\s*\d{1,2}\s*Episode\s*(\d{1,3})\b/i,
        /\bEpisode\s*(\d{1,3})\b/i,
        /\bEp(?:isode)?\.?\s*(\d{1,3})\b/i,
        /-\s*(\d{1,3})(?=\s*(?:\(|\[|1080p|720p|480p|AV1|WEB|HEVC|BILI|VOSTFR|$))/i,
        /\b-?\s*(?:#)?(\d{1,3})\b(?=\s*(?:v\d+|\(|\[|$))/i
    ];

    for (const re of patterns) {
        const m = re.exec(t);
        if (m && m[1]) {
            const n = parseInt(m[1].replace(/^0+/, '') || m[1], 10);
            if (!Number.isNaN(n)) return n;
        }
    }
    return null;
}

