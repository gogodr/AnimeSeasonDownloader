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

/**
 * Parses season number from torrent title
 * @param {string} title - Torrent title to parse
 * @returns {number|null} Season number or null if not found
 */
export function parseSeason(title) {
    if (!title || typeof title !== 'string') return null;
    
    const t = title.replace(/。/g, '.');
    
    // Remove all bracket contents (e.g., [Erai-raws], [1080p...], etc.)
    const withoutBrackets = t.replace(/\[.*?\]/g, '').trim();
    
    // Extract the part before a dash followed by episode info
    // Match: anime name part before "-" that might be followed by episode number
    // Example: "Nageki no Bourei wa Intai shitai Part 2 - 05" -> "Nageki no Bourei wa Intai shitai Part 2"
    const animeNameMatch = withoutBrackets.match(/^(.+?)\s*-\s*(?:\d{1,3}|Episode|Ep\.?)/);
    const animeName = animeNameMatch ? animeNameMatch[1].trim() : withoutBrackets.split('-')[0]?.trim();
    
    if (animeName) {
        // Check if anime name ends with a number (e.g., "Part 2", "Season 2", or just "2")
        const seasonMatch = animeName.match(/(\d{1,2})\s*$/);
        if (seasonMatch && seasonMatch[1]) {
            const n = parseInt(seasonMatch[1].replace(/^0+/, '') || seasonMatch[1], 10);
            if (!Number.isNaN(n)) return n;
        }
    }
    
    const patterns = [
        /\bS(\d{1,2})E\d{1,3}\b/i,  // S01E02, S1E2, etc.
        /\bSeason\s*(\d{1,2})\s*Episode\s*\d{1,3}\b/i,  // Season 1 Episode 2, etc.
        /\b(\d{1,2})(?:st|nd|rd|th)\s+Season\b/i,  // 1st Season, 2nd Season, 3rd Season, 4th Season, etc.
        /\bSeason\s*(\d{1,2})\b/i,  // Season 1, Season 01, etc.
        /\bS(\d{1,2})\b/i  // S01, S1, etc. (standalone)
    ];

    for (const re of patterns) {
        const m = re.exec(t);
        if (m && m[1]) {
            const n = parseInt(m[1].replace(/^0+/, '') || m[1], 10);
            if (!Number.isNaN(n)) return n;
        }
    }
    return 1;
}

/**
 * Parses CRC hash from torrent title
 * CRC hashes are typically enclosed in square brackets and are 8-character hexadecimal strings
 * @param {string} title - Torrent title to parse
 * @returns {string|null} CRC hash or null if not found
 */
export function parseCRC(title) {
    if (!title || typeof title !== 'string') return null;
    
    // Pattern to match [8-character hex string] - CRC format
    // Examples:
    // "[SubsPlease] One-Punch Man S3 - 02 (1080p) [6A4FD99F].mkv" -> "6A4FD99F"
    const match = title.match(/\[([A-F0-9]{8})\]/i);
    
    if (match && match[1]) {
        return match[1].toUpperCase();
    }
    
    return null;
}

