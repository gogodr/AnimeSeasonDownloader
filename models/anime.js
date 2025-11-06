/**
 * Anime data template structure
 */
export const animeTemplate = {
    id: 0,
    idMal: 0,
    anidbID: null,
    episodes: [
        {
            episode: 0,
            airingAt: 0,
            torrents: [{
                url: "",
                name: "",
                subGroup: "",
            }]
        }
    ],
    startDate: { year: 0, month: 0, day: 0 },
    image: "",
    title: { romaji: "", english: "", native: "" },
    description: "",
    genres: [""],
    season: 1,
};

/**
 * Extracts season number from anime title and description
 * @param {Object} title - Title object with romaji, english, native
 * @param {string} description - Description text
 * @returns {number} Season number (defaults to 1 if not found)
 */
export function extractSeason(title, description) {
    // Combine all title variants for searching
    const titleTexts = [
        title?.romaji || '',
        title?.english || '',
        title?.native || ''
    ].join(' ').toLowerCase();

    const descText = (description || '').toLowerCase();

    // Check title for "Season X" pattern
    const seasonMatch = titleTexts.match(/\bseason\s+(\d+)\b/i);
    if (seasonMatch) {
        return parseInt(seasonMatch[1], 10);
    }

    // Check title for ordinal seasons: "Second Season", "Third Season", etc.
    const ordinalMap = {
        'first': 1,
        'second': 2,
        'third': 3,
        'fourth': 4,
        'fifth': 5,
        'sixth': 6,
        'seventh': 7,
        'eighth': 8,
        'ninth': 9,
        'tenth': 10
    };

    for (const [ordinal, seasonNum] of Object.entries(ordinalMap)) {
        if (titleTexts.includes(`${ordinal} season`)) {
            return seasonNum;
        }
    }

    // Check if title ends with a number (e.g., "Tondemo Skill de Isekai Hourou Meshi 2")
    const titleEndMatch = titleTexts.match(/\s+(\d+)\s*$/);
    if (titleEndMatch) {
        const num = parseInt(titleEndMatch[1], 10);
        // Only consider it a season if it's a reasonable number (1-20)
        if (num >= 1 && num <= 20) {
            return num;
        }
    }

    // Check description for patterns like "the X and final season of" (e.g., "the eighth and final season of")
    const descFinalSeasonMatch = descText.match(/\bthe\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\s+and\s+final\s+season\s+of\b/i);
    if (descFinalSeasonMatch) {
        const ordinal = descFinalSeasonMatch[1].toLowerCase();
        if (ordinal === 'first') return 1;
        if (ordinal === 'second') return 2;
        if (ordinal === 'third') return 3;
        if (ordinal === 'fourth') return 4;
        if (ordinal === 'fifth') return 5;
        if (ordinal === 'sixth') return 6;
        if (ordinal === 'seventh') return 7;
        if (ordinal === 'eighth') return 8;
        if (ordinal === 'ninth') return 9;
        if (ordinal === 'tenth') return 10;
        if (ordinal === 'eleventh') return 11;
        if (ordinal === 'twelfth') return 12;
        if (ordinal === 'thirteenth') return 13;
        if (ordinal === 'fourteenth') return 14;
        if (ordinal === 'fifteenth') return 15;
        if (ordinal === 'sixteenth') return 16;
        if (ordinal === 'seventeenth') return 17;
        if (ordinal === 'eighteenth') return 18;
        if (ordinal === 'nineteenth') return 19;
        if (ordinal === 'twentieth') return 20;
    }

    // Check description for patterns like "the second season of", "the third season of", etc.
    const descSeasonMatch = descText.match(/\bthe\s+(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|first)\s+season\s+of\b/i);
    if (descSeasonMatch) {
        const ordinal = descSeasonMatch[1].toLowerCase();
        if (ordinal === 'first') return 1;
        if (ordinal === 'second') return 2;
        if (ordinal === 'third') return 3;
        if (ordinal === 'fourth') return 4;
        if (ordinal === 'fifth') return 5;
        if (ordinal === 'sixth') return 6;
        if (ordinal === 'seventh') return 7;
        if (ordinal === 'eighth') return 8;
        if (ordinal === 'ninth') return 9;
        if (ordinal === 'tenth') return 10;
    }

    // Check description for "the second part of", "the third part of", etc.
    const descPartMatch = descText.match(/\bthe\s+(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|first)\s+part\s+of\b/i);
    if (descPartMatch) {
        const ordinal = descPartMatch[1].toLowerCase();
        if (ordinal === 'first') return 1;
        if (ordinal === 'second') return 2;
        if (ordinal === 'third') return 3;
        if (ordinal === 'fourth') return 4;
        if (ordinal === 'fifth') return 5;
        if (ordinal === 'sixth') return 6;
        if (ordinal === 'seventh') return 7;
        if (ordinal === 'eighth') return 8;
        if (ordinal === 'ninth') return 9;
        if (ordinal === 'tenth') return 10;
    }

    // Check description for "the second half of", "the third half of", etc.
    const descHalfMatch = descText.match(/\bthe\s+(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|first)\s+half\s+of\b/i);
    if (descHalfMatch) {
        const ordinal = descHalfMatch[1].toLowerCase();
        if (ordinal === 'first') return 1;
        if (ordinal === 'second') return 2;
        if (ordinal === 'third') return 3;
        if (ordinal === 'fourth') return 4;
        if (ordinal === 'fifth') return 5;
        if (ordinal === 'sixth') return 6;
        if (ordinal === 'seventh') return 7;
        if (ordinal === 'eighth') return 8;
        if (ordinal === 'ninth') return 9;
        if (ordinal === 'tenth') return 10;
    }

    // Default to season 1 if no indicators found
    return 1;
}

/**
 * Creates an anime object from media data
 * @param {Object} media - Media data from AniList API
 * @returns {Object} Anime object
 */
export function createAnimeFromMedia(media) {
    const season = extractSeason(media.title, media.description);
    
    return {
        id: media.id,
        idMal: media.idMal,
        anidbID: null,
        startDate: new Date(media.startDate.year, media.startDate.month, media.startDate.day),
        image: media.coverImage.extraLarge,
        title: media.title,
        description: media.description,
        genres: media.genres,
        episodes: [],
        season: season
    };
}

