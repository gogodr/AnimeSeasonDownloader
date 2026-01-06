import { ANILIST_GRAPHQL_URL } from '../config/constants.js';

/**
 * Fetches data from AniList GraphQL API
 * @param {Object} payload - GraphQL query payload
 * @returns {Promise<Object>} Response data
 */
export async function fetchAnime(payload) {
    const response = await fetch(ANILIST_GRAPHQL_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(payload)
    });
    return await response.json();
}

/**
 * Creates GraphQL query payload for fetching upcoming anime
 * @param {string} season - Season (WINTER, SPRING, SUMMER, FALL)
 * @param {number} year - Year
 * @param {Object} options - Additional query options
 * @returns {Object} GraphQL payload
 */
function createAnimeQueryPayload(season, year, options = {}) {
    const {
        format,
        excludeFormat,
        minEpisodes,
        page = 1
    } = options;

    return {
        query: `query (
            $season: MediaSeason,
            $year: Int,
            $format: MediaFormat,
            $excludeFormat: MediaFormat,
            $status: MediaStatus,
            $minEpisodes: Int,
            $page: Int,
        ) {
            Page(page: $page) {
                pageInfo {
                    hasNextPage
                    total
                }
                media(
                    season: $season
                    seasonYear: $year
                    format: $format
                    format_not: $excludeFormat
                    status: $status
                    episodes_greater: $minEpisodes
                    isAdult: false
                    type: ANIME
                    sort: TITLE_ROMAJI
                ) {
                    id
                    idMal
                    title {
                        romaji
                        native
                        english
                    }
                    startDate {
                        year
                        month
                        day
                    }
                    endDate {
                        year
                        month
                        day
                    }
                    status
                    season
                    format
                    genres
                    duration
                    episodes
                    siteUrl
                    description
                    bannerImage
                    isAdult
                    coverImage {
                        extraLarge
                        color
                    }
                    airingSchedule {
                        nodes {
                            episode
                            airingAt
                        }
                    }
                }
            }
        }`,
        variables: {
            season,
            year,
            format,
            excludeFormat,
            minEpisodes,
            page
        }
    };
}

/**
 * Fetches upcoming anime for a specific season and year
 * @param {string} season - Season (WINTER, SPRING, SUMMER, FALL)
 * @param {number} year - Year
 * @param {string} prevSeason - Previous season
 * @param {number} prevYear - Previous year
 * @returns {Promise<Array>} Combined media results
 */
export async function fetchUpcomingAnimeData(season, year, prevSeason, prevYear) {
    const payload1 = createAnimeQueryPayload(season, year, { format: 'TV', page: 1 });
    const payload2 = createAnimeQueryPayload(season, year, { excludeFormat: 'TV', page: 1 });
    const payload3 = createAnimeQueryPayload(prevSeason, prevYear, { minEpisodes: 16, page: 1 });

    const [data1, data2, data3] = await Promise.all([
        fetchAnime(payload1),
        fetchAnime(payload2),
        fetchAnime(payload3)
    ]);

    return [
        ...data1.data.Page.media,
        ...data2.data.Page.media,
        ...data3.data.Page.media
    ];
}

