export const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co/';
export const NYAA_BASE_URL = 'https://nyaa.si';

export const RATE_LIMIT_DELAY = 500; // milliseconds
export const CACHE_EXPIRATION_DAYS = 14; // 2 weeks

/**
 * Quarter to Season mapping (for AniList API)
 * Q1 = Winter, Q2 = Spring, Q3 = Summer, Q4 = Fall
 */
export const QUARTER_TO_SEASON = {
    'Q1': 'WINTER',
    'Q2': 'SPRING',
    'Q3': 'SUMMER',
    'Q4': 'FALL'
};

export const SEASON_TO_QUARTER = {
    'WINTER': 'Q1',
    'SPRING': 'Q2',
    'SUMMER': 'Q3',
    'FALL': 'Q4'
};

/**
 * Converts quarter (Q1-Q4) to season name (WINTER/SPRING/SUMMER/FALL) for AniList API
 * @param {string} quarter - Quarter (Q1, Q2, Q3, Q4)
 * @returns {string} Season name (WINTER, SPRING, SUMMER, FALL)
 */
export function quarterToSeason(quarter) {
    return QUARTER_TO_SEASON[quarter] || 'WINTER';
}

/**
 * Converts season name (WINTER/SPRING/SUMMER/FALL) to quarter (Q1-Q4)
 * @param {string} season - Season name (WINTER, SPRING, SUMMER, FALL)
 * @returns {string} Quarter (Q1, Q2, Q3, Q4)
 */
export function seasonToQuarter(season) {
    return SEASON_TO_QUARTER[season] || 'Q1';
}

/**
 * Formats quarter name for display (Q1, Q2, Q3, Q4)
 * @param {string} quarter - Quarter (Q1, Q2, Q3, Q4)
 * @returns {string} Formatted quarter name
 */
export function formatQuarterName(quarter) {
    return quarter || 'Q1';
}

/**
 * Formats quarter name with season name for display (e.g., "Q4 (Fall)")
 * @param {string} quarter - Quarter (Q1, Q2, Q3, Q4)
 * @returns {string} Formatted quarter name with season (e.g., "Q4 (Fall)")
 */
export function formatQuarterWithSeason(quarter) {
    if (!quarter) return 'Q1 (Winter)';
    const season = QUARTER_TO_SEASON[quarter] || 'WINTER';
    const seasonName = season.charAt(0) + season.slice(1).toLowerCase();
    return `${quarter} (${seasonName})`;
}

