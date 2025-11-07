import PQueue from 'p-queue';
import { fetchUpcomingAnimeData } from './anilist.js';
import { torrentSearch } from './nyaa.js';
import { getAnidbID, getAnidbGroupID, getEpisodeByCRC } from './anidb.js';
import { parseEpisode, parseSeason, parseCRC } from '../parsers/episodeParser.js';
import { parseSubGroup } from '../parsers/subGroupParser.js';
import { createAnimeFromMedia } from '../models/anime.js';
import { isCacheValid, getCachedAnime, storeAnime, getAnimeById, storeAnimeTorrents, getAlternativeTitles, deleteTorrentsForAnime, getOrCreateSubGroupId, getSubGroupByName, updateSubGroupAnidbID } from '../database/animeDB.js';
import { quarterToSeason } from '../config/constants.js';

/**
 * Gets the previous quarter and year based on current quarter
 * @param {string} quarter - Current quarter (Q1, Q2, Q3, Q4)
 * @param {number} year - Current year
 * @returns {Object} Previous quarter and year
 */
function getPreviousQuarter(quarter, year) {
    const quarterMap = {
        'Q1': { quarter: 'Q4', year: year - 1 },
        'Q2': { quarter: 'Q1', year: year },
        'Q3': { quarter: 'Q2', year: year },
        'Q4': { quarter: 'Q3', year: year }
    };
    return quarterMap[quarter] || { quarter: 'Q3', year: year };
}

/**
 * Fetches and processes torrents for an anime
 * @param {Object} anime - Anime object
 * @returns {Promise<Array>} Array of processed torrents
 */
async function fetchAnimeTorrents(anime) {
    console.log(`Fetching torrents for ${anime.title.english || anime.title.romaji}`);
    const subQueue = new PQueue({ concurrency: 2 });

    // Build search terms list
    const searchTerms = [];
    
    // Add romaji and english titles if they exist
    if (anime.title?.romaji) {
        searchTerms.push(anime.title.romaji);
    }
    if (anime.title?.english) {
        searchTerms.push(anime.title.english);
    }
    
    // Get alternative titles from database if anime has an ID
    if (anime.id) {
        const alternativeTitles = getAlternativeTitles(anime.id);
        
        // Add alternative titles to search terms, avoiding duplicates
        alternativeTitles.forEach(altTitle => {
            const normalizedAlt = altTitle.trim().toLowerCase();
            const isDuplicate = searchTerms.some(term => 
                term && term.trim().toLowerCase() === normalizedAlt
            );
            if (!isDuplicate && altTitle) {
                searchTerms.push(altTitle);
            }
        });
    }
    
    // Deduplicate search terms (case-insensitive comparison)
    const uniqueSearchTerms = [];
    const seenTerms = new Set();
    
    searchTerms.forEach(term => {
        if (!term) return;
        
        const normalized = term.trim().toLowerCase();
        if (normalized && !seenTerms.has(normalized)) {
            seenTerms.add(normalized);
            uniqueSearchTerms.push(term);
        }
    });
    
    console.log(`Search terms: ${uniqueSearchTerms}`);
    
    // Search for torrents using all search terms
    const torrentsData = await Promise.all(
        uniqueSearchTerms.map(term => 
            subQueue.add(() => term ? torrentSearch(term) : Promise.resolve({ items: [] }))
        )
    );

    // Flatten torrents data using flatMap for optimal performance
    let torrents = torrentsData.flatMap(torrentList => torrentList?.items || []);

    // Deduplicate torrents by title (case-insensitive)
    const uniqueTorrentsMap = new Map();
    torrents.forEach(torrent => {
        const titleKey = torrent.title.toLowerCase();
        if (!uniqueTorrentsMap.has(titleKey)) {
            uniqueTorrentsMap.set(titleKey, torrent);
        }
    });

    // Process each unique torrent asynchronously: parse and fetch subGroup AniDB ID
    const processQueue = new PQueue({ concurrency: 1 });
    const processedTorrents = await Promise.all(
        Array.from(uniqueTorrentsMap.values()).map(torrent =>
            processQueue.add(async () => {
                // Parse episode
                torrent.episode = parseEpisode(torrent.title);
                
                // Parse season from title
                let parsedSeason = parseSeason(torrent.title);
                
                // Check if torrent title contains an exact match of any search term
                const titleLower = torrent.title.toLowerCase();
                const hasExactMatch = uniqueSearchTerms.some(term => {
                    if (!term) return false;
                    const termLower = term.trim().toLowerCase();
                    return titleLower.includes(termLower);
                });
                
                // If exact match found, override season with anime season
                if (hasExactMatch) {
                    parsedSeason = anime.season;
                }
                
                torrent.season = parsedSeason;
                
                // Parse subGroup
                const subGroupName = parseSubGroup(torrent.title);
                torrent.subGroup = subGroupName;
                
                
                // Fetch AniDB ID for subGroup if it exists
                let existingSubGroup = null;
                if (subGroupName) {
                    try {
                        // Check if subGroup exists in database
                        existingSubGroup = getSubGroupByName(subGroupName);
                        
                        // If subGroup doesn't exist or doesn't have anidbID, search for it
                        if (!existingSubGroup || !existingSubGroup.anidbID) {
                            console.log(`Searching AniDB for subGroup: ${subGroupName}`);
                            const anidbID = await getAnidbGroupID(subGroupName);
                            
                            if (anidbID) {
                                // Get or create the subGroup ID
                                const subGroupId = getOrCreateSubGroupId(subGroupName);
                                if (subGroupId) {
                                    // Update the subGroup with anidbID
                                    updateSubGroupAnidbID(subGroupId, anidbID);
                                    console.log(`Updated subGroup ${subGroupName} with AniDB ID: ${anidbID}`);
                                    // Update existingSubGroup reference with the new anidbID
                                    existingSubGroup = getSubGroupByName(subGroupName);
                                }
                            } else {
                                // Ensure subGroup exists even if no AniDB ID found
                                getOrCreateSubGroupId(subGroupName);
                                console.log(`SubGroup: ${subGroupName} created without AniDB ID`);
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing subGroup ${subGroupName}:`, error.message);
                    }
                }
                
                // If anime has anidbID, subGroup has anidbID, and title has CRC hash, try to get episode from AniDB
                if (anime.anidbID && existingSubGroup?.anidbID) {
                    const crcHash = parseCRC(torrent.title);
                    if (crcHash) {
                        try {
                            const episodeDataFromCRC = await getEpisodeByCRC(
                                existingSubGroup.anidbID,
                                anime.anidbID,
                                crcHash
                            );
                            if (episodeDataFromCRC) {
                                if (episodeDataFromCRC.episode !== null) {
                                    console.log(`Overriding episode ${torrent.episode} with ${episodeDataFromCRC.episode} from CRC ${crcHash}`);
                                    torrent.episode = episodeDataFromCRC.episode;
                                }

                                if (episodeDataFromCRC.season !== null && episodeDataFromCRC.season !== undefined) {
                                    torrent.season = episodeDataFromCRC.season;
                                }
                            }
                        } catch (error) {
                            console.error(`Error fetching episode by CRC ${crcHash}:`, error.message);
                        }
                    }
                }

                console.log(torrent);
                
                return torrent;
            })
        )
    );

    torrents = processedTorrents;
    
    // Filter torrents by season if anime season is 2 or greater
    if (anime.season >= 2) {
        const beforeFilter = torrents.length;
        torrents = torrents.filter(torrent => {
            // Keep torrents with matching season or no season specified
            return torrent.season === null || torrent.season === anime.season;
        });
        const filteredOut = beforeFilter - torrents.length;
        if (filteredOut > 0) {
            console.log(`Filtered out ${filteredOut} torrent(s) with non-matching season (anime season: ${anime.season})`);
        }
    }
    
    // Sort by date descending
    torrents.sort((a, b) => b.date - a.date);
    
    console.log(`Found ${torrents.length} unique torrent(s) using ${uniqueSearchTerms.length} search term(s)`);
   
    return torrents;
}

/**
 * Creates episode structure for anime
 * @param {Object} media - Media data from AniList
 * @param {Array} torrents - Processed torrents
 * @returns {Array} Array of episode objects
 */
function createEpisodes(media, torrents) {
    const episodes = [];
    const episodeCount = media.episodes || 12;
    
    for (let i = 0; i < episodeCount; i++) {
        const airingAt = new Date(
            media.startDate.year,
            media.startDate.month - 1,
            media.startDate.day + i * 7
        );
        const episode = {
            episode: i + 1,
            airingAt: airingAt,
            torrents: torrents.filter(t => t.episode === (i + 1))
        };
        episodes.push(episode);
    }
    
    return episodes;
}

/**
 * Processes a single anime media item
 * @param {Object} media - Media data from AniList
 * @returns {Promise<Object>} Processed anime object
 */
async function processAnime(media) {
    const anime = createAnimeFromMedia(media);
    
    // Search for AniDB ID using the anime title (prefer english, fallback to romaji)
    const searchTitle = anime.title.english || anime.title.romaji || anime.title.native;
    if (searchTitle) {
        anime.anidbID = await getAnidbID(searchTitle);
    }
    
    // Fetch torrents for the anime
    const torrents = await fetchAnimeTorrents(anime);
    
    // Create episodes structure
    anime.episodes = createEpisodes(media, torrents);

    return anime;
}

/**
 * Gets upcoming anime for a quarter and year
 * Checks cache first and only fetches if data is older than 2 weeks (unless forceRefresh is true)
 * @param {string} quarter - Quarter (Q1, Q2, Q3, Q4)
 * @param {number} year - Year
 * @param {boolean} forceRefresh - If true, bypasses cache check and always fetches fresh data
 * @returns {Promise<Array>} Array of upcoming anime
 */
export async function getUpcomingAnime(quarter = "Q4", year = 2025, forceRefresh = false) {
    // Check if cached data exists and is still valid (less than 2 weeks old)
    if (!forceRefresh && isCacheValid(quarter, year)) {
        console.log(`Using cached data for ${quarter} ${year}`);
        const cachedAnime = getCachedAnime(quarter, year);
        if (cachedAnime) {
            return cachedAnime;
        }
    }
    
    console.log(`Fetching fresh data for ${quarter} ${year}${forceRefresh ? ' (forced refresh)' : ' (cache expired or missing)'}`);
    
    // Fetch fresh data - convert quarters to seasons for AniList API
    const { quarter: prevQuarter, year: prevYear } = getPreviousQuarter(quarter, year);
    const season = quarterToSeason(quarter);
    const prevSeason = quarterToSeason(prevQuarter);
    
    const combinedMedia = await fetchUpcomingAnimeData(season, year, prevSeason, prevYear);
    
    const queue = new PQueue({ concurrency: 3 });
    
    const tasks = combinedMedia.map((media) => 
        queue.add(() => processAnime(media))
    );
    
    const upcomingAnime = await Promise.all(tasks);
    
    // Store in database for future use
    storeAnime(quarter, year, upcomingAnime);
    console.log(`Cached data for ${quarter} ${year}`);
    
    return upcomingAnime;
}

/**
 * Scans and updates torrents for a specific anime by ID
 * @param {number} animeId - Anime ID
 * @param {boolean} wipePrevious - If true, delete all existing torrents before scanning
 * @returns {Promise<Object>} Result object with success status and message
 */
export async function scanAnimeTorrents(animeId, wipePrevious = false) {
    // Get anime from database
    const anime = getAnimeById(animeId);
    if (!anime) {
        throw new Error('Anime not found');
    }
    
    console.log(`Scanning torrents for anime ID ${animeId}: ${anime.title.english || anime.title.romaji}`);
    
    // Delete existing torrents if wipePrevious is true
    let deletedCount = 0;
    if (wipePrevious) {
        deletedCount = deleteTorrentsForAnime(animeId);
        console.log(`Deleted ${deletedCount} existing torrent(s) before scanning`);
    }
    
    // Fetch torrents for the anime
    const torrents = await fetchAnimeTorrents(anime);
    
    // Group torrents by episode number
    const torrentsByEpisode = {};
    torrents.forEach(torrent => {
        if (torrent.episode) {
            if (!torrentsByEpisode[torrent.episode]) {
                torrentsByEpisode[torrent.episode] = [];
            }
            torrentsByEpisode[torrent.episode].push(torrent);
        }
    });
    
    // Store torrents in database
    const torrentsCount = storeAnimeTorrents(animeId, torrentsByEpisode);
    
    let message = `Successfully scanned torrents. Found ${torrentsCount} torrent(s)`;
    if (wipePrevious && deletedCount > 0) {
        message += ` (deleted ${deletedCount} previous torrent(s))`;
    }
    
    return {
        success: true,
        message: message,
        torrentsFound: torrentsCount,
        deletedCount: deletedCount
    };
}

