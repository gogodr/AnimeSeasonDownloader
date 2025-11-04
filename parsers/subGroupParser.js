/**
 * Parses subgroup name from torrent title
 * Subgroups are typically enclosed in square brackets at the start of the title
 * @param {string} title - Torrent title to parse
 * @returns {string|null} Subgroup name or null if not found
 */
export function parseSubGroup(title) {
    if (!title || typeof title !== 'string') return null;
    
    // Pattern to match [SubGroupName] at the beginning of the title
    // Examples:
    // "[ToonsHub] TOUGEN ANKI..." -> "ToonsHub"
    // "[SubsPlease] Tougen Anki..." -> "SubsPlease"
    const match = title.match(/^\[([^\]]+)\]/);
    
    if (match && match[1]) {
        return match[1].trim();
    }
    
    return null;
}

