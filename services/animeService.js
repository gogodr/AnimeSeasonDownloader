import PQueue from 'p-queue';
import { fetchUpcomingAnimeData } from '../api/anilist.js';
import { torrentSearch } from '../api/nyaa.js';
import { parseEpisode } from '../parsers/episodeParser.js';
import { parseSubGroup } from '../parsers/subGroupParser.js';
import { createAnimeFromMedia } from '../models/anime.js';
import { isCacheValid, getCachedAnime, storeAnime, getDB, getAnimeById } from '../database/animeDB.js';

/**
 * Gets the previous season and year based on current season
 * @param {string} season - Current season
 * @param {number} year - Current year
 * @returns {Object} Previous season and year
 */
function getPreviousSeason(season, year) {
    const seasonMap = {
        'WINTER': { season: 'FALL', year: year - 1 },
        'SPRING': { season: 'WINTER', year: year },
        'SUMMER': { season: 'SPRING', year: year },
        'FALL': { season: 'SUMMER', year: year }
    };
    return seasonMap[season] || { season: 'SUMMER', year: year };
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
        const database = getDB();
        const altTitlesQuery = database.prepare(`
            SELECT title
            FROM alternative_titles
            WHERE anime_id = ?
            ORDER BY title ASC
        `);
        const altTitleRecords = altTitlesQuery.all(anime.id);
        const alternativeTitles = altTitleRecords.map(at => at.title);
        
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

    // Search for torrents using all search terms
    const rssData = await Promise.all(
        searchTerms.map(term => 
            subQueue.add(() => term ? torrentSearch(term) : Promise.resolve({ items: [] }))
        )
    );

    let torrents = [];
    rssData.forEach(rss => {
        if (rss && rss.items) {
            rss.items.forEach(item => {
                torrents.push({
                    title: item.title,
                    link: item.link,
                    date: new Date(item.isoDate)
                });
            });
        }
    });

    // Deduplicate and parse episodes and subgroups
    const uniqueTorrents = {};
    torrents.forEach(torrent => {
        if (!uniqueTorrents[torrent.title]) {
            uniqueTorrents[torrent.title] = torrent;
            uniqueTorrents[torrent.title].episode = parseEpisode(torrent.title);
            uniqueTorrents[torrent.title].subGroup = parseSubGroup(torrent.title);
        }
    });

    torrents = Object.values(uniqueTorrents);
    // Sort by date descending
    torrents.sort((a, b) => b.date - a.date);
    
    console.log(`Found ${torrents.length} unique torrent(s) using ${searchTerms.length} search term(s)`);
    
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
            media.startDate.month,
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
    
    // Fetch torrents for the anime
    const torrents = await fetchAnimeTorrents(anime);
    
    // Create episodes structure
    anime.episodes = createEpisodes(media, torrents);

    return anime;
}

/**
 * Gets upcoming anime for a season and year
 * Checks cache first and only fetches if data is older than 2 weeks (unless forceRefresh is true)
 * @param {string} season - Season (WINTER, SPRING, SUMMER, FALL)
 * @param {number} year - Year
 * @param {boolean} forceRefresh - If true, bypasses cache check and always fetches fresh data
 * @returns {Promise<Array>} Array of upcoming anime
 */
export async function getUpcomingAnime(season = "FALL", year = 2025, forceRefresh = false) {
    // Check if cached data exists and is still valid (less than 2 weeks old)
    if (!forceRefresh && isCacheValid(season, year)) {
        console.log(`Using cached data for ${season} ${year}`);
        const cachedAnime = getCachedAnime(season, year);
        if (cachedAnime) {
            return cachedAnime;
        }
    }
    
    console.log(`Fetching fresh data for ${season} ${year}${forceRefresh ? ' (forced refresh)' : ' (cache expired or missing)'}`);
    
    // Fetch fresh data
    const { season: prevSeason, year: prevYear } = getPreviousSeason(season, year);
    
    const combinedMedia = await fetchUpcomingAnimeData(season, year, prevSeason, prevYear);
    
    const queue = new PQueue({ concurrency: 3 });
    
    const tasks = combinedMedia.map((media) => 
        queue.add(() => processAnime(media))
    );
    
    const upcomingAnime = await Promise.all(tasks);
    
    // Store in database for future use
    storeAnime(season, year, upcomingAnime);
    console.log(`Cached data for ${season} ${year}`);
    
    return upcomingAnime;
}

/**
 * Scans and updates torrents for a specific anime by ID
 * @param {number} animeId - Anime ID
 * @returns {Promise<Object>} Result object with success status and message
 */
export async function scanAnimeTorrents(animeId) {
    const database = getDB();
    
    // Get anime from database
    const anime = getAnimeById(animeId);
    if (!anime) {
        throw new Error('Anime not found');
    }
    
    console.log(`Scanning torrents for anime ID ${animeId}: ${anime.title.english || anime.title.romaji}`);
    
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
    
    // Update database with new torrents
    const transaction = database.transaction(() => {
        // Get or create subgroup function
        const getSubGroupIdStmt = database.prepare(`SELECT id FROM sub_groups WHERE name = ?`);
        const createSubGroupStmt = database.prepare(`INSERT INTO sub_groups (name) VALUES (?)`);
        
        function getOrCreateSubGroupId(subGroupName) {
            if (!subGroupName) return null;
            
            let subGroupResult = getSubGroupIdStmt.get(subGroupName);
            if (!subGroupResult) {
                const insertResult = createSubGroupStmt.run(subGroupName);
                return insertResult.lastInsertRowid;
            }
            return subGroupResult.id;
        }
        
        // Get episode ID statement
        const getEpisodeIdStmt = database.prepare(`
            SELECT id FROM episodes WHERE anime_id = ? AND episode_number = ?
        `);
        
        // Create episode if it doesn't exist
        const createEpisodeStmt = database.prepare(`
            INSERT OR IGNORE INTO episodes (anime_id, episode_number, airingAt)
            VALUES (?, ?, ?)
        `);
        
        // Insert torrent statement
        const torrentStmt = database.prepare(`
            INSERT INTO torrents (episode_id, title, link, date, episode_number, sub_group_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        // Check if torrent already exists
        const checkTorrentExistsStmt = database.prepare(`SELECT id FROM torrents WHERE link = ?`);
        
        // Process each episode
        for (const [episodeNumStr, episodeTorrents] of Object.entries(torrentsByEpisode)) {
            const episodeNumber = parseInt(episodeNumStr, 10);
            
            // Get or create episode
            let episodeId = null;
            const existingEpisode = getEpisodeIdStmt.get(animeId, episodeNumber);
            
            if (existingEpisode) {
                episodeId = existingEpisode.id;
            } else {
                // Create episode with estimated airing date (use current date as fallback)
                const estimatedAiringAt = Date.now();
                createEpisodeStmt.run(animeId, episodeNumber, estimatedAiringAt);
                const newEpisode = getEpisodeIdStmt.get(animeId, episodeNumber);
                if (newEpisode) {
                    episodeId = newEpisode.id;
                }
            }
            
            if (!episodeId) continue;
            
            // Add torrents for this episode
            for (const torrent of episodeTorrents) {
                // Skip if link is missing
                if (!torrent.link) continue;
                
                // Check if torrent already exists
                const existingTorrent = checkTorrentExistsStmt.get(torrent.link);
                if (existingTorrent) {
                    continue; // Skip duplicates
                }
                
                const torrentDate = torrent.date instanceof Date 
                    ? torrent.date.getTime() 
                    : (torrent.date || Date.now());
                
                // Get or create subgroup
                const subGroupId = getOrCreateSubGroupId(torrent.subGroup);
                
                // Insert torrent
                torrentStmt.run(
                    episodeId,
                    torrent.title || "",
                    torrent.link,
                    torrentDate,
                    torrent.episode || null,
                    subGroupId
                );
            }
        }
        
        // Update lastTorrentScan timestamp
        const updateScanTimeStmt = database.prepare(`
            UPDATE anime SET lastTorrentScan = ? WHERE id = ?
        `);
        updateScanTimeStmt.run(Date.now(), animeId);
    });
    
    transaction();
    
    const newTorrentsCount = Object.values(torrentsByEpisode).reduce((sum, torrents) => sum + torrents.length, 0);
    
    return {
        success: true,
        message: `Successfully scanned torrents. Found ${newTorrentsCount} torrent(s)`,
        torrentsFound: newTorrentsCount
    };
}

