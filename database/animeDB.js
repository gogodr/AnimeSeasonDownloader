import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'anime.db');

// Ensure data directory exists if needed
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
}

let db = null;

/**
 * Initializes the database connection and creates tables if they don't exist
 */
function initializeDB() {
    if (db) return db;
    
    db = new Database(dbPath);
    
    // Enable foreign keys (SQLite requires this to be enabled)
    db.pragma('foreign_keys = ON');
    
    // Create queries table to track when data was last fetched
    db.exec(`
        CREATE TABLE IF NOT EXISTS queries (
            season TEXT NOT NULL,
            year INTEGER NOT NULL,
            lastFetched INTEGER NOT NULL,
            PRIMARY KEY (season, year)
        )
    `);
    
    // Create anime table based on animeTemplate structure
    db.exec(`
        CREATE TABLE IF NOT EXISTS anime (
            id INTEGER PRIMARY KEY,
            idMal INTEGER,
            season TEXT NOT NULL,
            year INTEGER NOT NULL,
            image TEXT,
            description TEXT,
            title_romaji TEXT,
            title_english TEXT,
            title_native TEXT,
            startDate_year INTEGER,
            startDate_month INTEGER,
            startDate_day INTEGER,
            lastTorrentScan INTEGER,
            FOREIGN KEY (season, year) REFERENCES queries(season, year) ON DELETE CASCADE
        )
    `);
    
    // Add lastTorrentScan column to existing anime table if it doesn't exist (migration)
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(anime)`).all();
        const hasLastTorrentScanColumn = tableInfo.some(col => col.name === 'lastTorrentScan');
        
        if (!hasLastTorrentScanColumn) {
            db.exec(`ALTER TABLE anime ADD COLUMN lastTorrentScan INTEGER`);
        }
    } catch (error) {
        // If table doesn't exist yet, it will be created with the column above
        // This is fine, just log the error for debugging
        console.warn('Migration warning:', error.message);
    }
    
    // Create genres table
    db.exec(`
        CREATE TABLE IF NOT EXISTS genres (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
    `);
    
    // Create anime_genres junction table (many-to-many relationship)
    db.exec(`
        CREATE TABLE IF NOT EXISTS anime_genres (
            anime_id INTEGER NOT NULL,
            genre_id INTEGER NOT NULL,
            PRIMARY KEY (anime_id, genre_id),
            FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
            FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
        )
    `);
    
    // Create episodes table
    db.exec(`
        CREATE TABLE IF NOT EXISTS episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            anime_id INTEGER NOT NULL,
            episode_number INTEGER NOT NULL,
            airingAt INTEGER NOT NULL,
            FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
            UNIQUE(anime_id, episode_number)
        )
    `);
    
    // Create sub_groups table
    db.exec(`
        CREATE TABLE IF NOT EXISTS sub_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            enabled INTEGER NOT NULL DEFAULT 1
        )
    `);
    
    // Add enabled column to existing sub_groups table if it doesn't exist (migration)
    // Check if column exists by querying table info
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(sub_groups)`).all();
        const hasEnabledColumn = tableInfo.some(col => col.name === 'enabled');
        
        if (!hasEnabledColumn) {
            db.exec(`ALTER TABLE sub_groups ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`);
            // Update existing rows to have enabled = 1
            db.exec(`UPDATE sub_groups SET enabled = 1 WHERE enabled IS NULL`);
        }
    } catch (error) {
        // If table doesn't exist yet, it will be created with the column above
        // This is fine, just log the error for debugging
        console.warn('Migration warning:', error.message);
    }
    
    // Create torrents table
    db.exec(`
        CREATE TABLE IF NOT EXISTS torrents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            episode_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            link TEXT,
            date INTEGER NOT NULL,
            episode_number INTEGER,
            sub_group_id INTEGER,
            FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
            FOREIGN KEY (sub_group_id) REFERENCES sub_groups(id) ON DELETE SET NULL
        )
    `);
    
    // Create indexes for faster lookups
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_anime_season_year 
        ON anime(season, year)
    `);
    
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_episodes_anime_id 
        ON episodes(anime_id)
    `);
    
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_torrents_episode_id 
        ON torrents(episode_id)
    `);
    
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_anime_genres_anime_id 
        ON anime_genres(anime_id)
    `);
    
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_anime_genres_genre_id 
        ON anime_genres(genre_id)
    `);
    
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_genres_name 
        ON genres(name)
    `);
    
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sub_groups_name 
        ON sub_groups(name)
    `);
        
    // Create index for sub_group_id (after ensuring column exists)
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_torrents_sub_group_id 
        ON torrents(sub_group_id)
    `);
    
    // Create index for link to speed up duplicate checking
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_torrents_link 
        ON torrents(link)
    `);
    
    // Create alternative_titles table
    db.exec(`
        CREATE TABLE IF NOT EXISTS alternative_titles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            anime_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
            UNIQUE(anime_id, title)
        )
    `);
    
    // Create index for faster lookups
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_alternative_titles_anime_id 
        ON alternative_titles(anime_id)
    `);
    
    return db;
}

/**
 * Gets the database instance
 * @returns {Database} Database instance
 */
export function getDB() {
    return initializeDB();
}

/**
 * Checks if cached data for a season/year exists and is less than 2 weeks old
 * @param {string} season - Season (WINTER, SPRING, SUMMER, FALL)
 * @param {number} year - Year
 * @returns {boolean} True if cached data is valid (less than 2 weeks old)
 */
export function isCacheValid(season, year) {
    const database = getDB();
    const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000; // 2 weeks in milliseconds
    const now = Date.now();
    
    const query = database.prepare(`
        SELECT lastFetched 
        FROM queries 
        WHERE season = ? AND year = ?
    `);
    
    const result = query.get(season, year);
    
    if (!result) {
        return false; // No cached data exists
    }
    
    const age = now - result.lastFetched;
    return age < twoWeeksInMs;
}

/**
 * Retrieves cached anime data for a season and year
 * @param {string} season - Season (WINTER, SPRING, SUMMER, FALL)
 * @param {number} year - Year
 * @returns {Array|null} Array of anime objects or null if not found
 */
export function getCachedAnime(season, year) {
    const database = getDB();
    
    // Get anime records
    const animeQuery = database.prepare(`
        SELECT * 
        FROM anime 
        WHERE season = ? AND year = ?
        ORDER BY id
    `);
    
    const animeRecords = animeQuery.all(season, year);
    
    if (animeRecords.length === 0) {
        return null;
    }
    
    // Get genres for all anime (join with genres table to get genre names)
    const genresQuery = database.prepare(`
        SELECT ag.anime_id, g.name as genre_name
        FROM anime_genres ag
        INNER JOIN genres g ON ag.genre_id = g.id
        WHERE ag.anime_id IN (SELECT id FROM anime WHERE season = ? AND year = ?)
        ORDER BY ag.anime_id, g.name
    `);
    
    const genreRecords = genresQuery.all(season, year);
    const genresMap = {};
    genreRecords.forEach(gr => {
        if (!genresMap[gr.anime_id]) {
            genresMap[gr.anime_id] = [];
        }
        genresMap[gr.anime_id].push(gr.genre_name);
    });
    
    // Get episodes for all anime (with subgroups, filtered by enabled subgroups only)
    const episodesQuery = database.prepare(`
        SELECT e.*, t.id as torrent_id, t.title as torrent_title, 
               t.link as torrent_link,
               t.date as torrent_date, t.episode_number as torrent_episode_number,
               sg.name as sub_group_name
        FROM episodes e
        LEFT JOIN torrents t ON e.id = t.episode_id
        LEFT JOIN sub_groups sg ON t.sub_group_id = sg.id
        WHERE e.anime_id IN (SELECT id FROM anime WHERE season = ? AND year = ?)
          AND (t.sub_group_id IS NOT NULL AND sg.enabled = 1)
        ORDER BY e.anime_id, e.episode_number, t.date DESC
    `);
    
    const episodeRecords = episodesQuery.all(season, year);
    const episodesMap = {};
    
    episodeRecords.forEach(er => {
        if (!episodesMap[er.anime_id]) {
            episodesMap[er.anime_id] = {};
        }
        if (!episodesMap[er.anime_id][er.episode_number]) {
            episodesMap[er.anime_id][er.episode_number] = {
                episode: er.episode_number,
                airingAt: new Date(er.airingAt),
                torrents: []
            };
        }
        
        // Add torrent if it exists
        if (er.torrent_id) {
            episodesMap[er.anime_id][er.episode_number].torrents.push({
                title: er.torrent_title,
                link: er.torrent_link,
                date: new Date(er.torrent_date),
                episode: er.torrent_episode_number,
                subGroup: er.sub_group_name || null
            });
        }
    });
    
    // Reconstruct anime objects
    return animeRecords.map(anime => {
        const animeObj = {
            id: anime.id,
            idMal: anime.idMal,
            image: anime.image,
            description: anime.description,
            title: {
                romaji: anime.title_romaji || "",
                english: anime.title_english || "",
                native: anime.title_native || ""
            },
            startDate: anime.startDate_year !== null && anime.startDate_month !== null && anime.startDate_day !== null
                ? new Date(anime.startDate_year, anime.startDate_month - 1, anime.startDate_day)
                : null,
            genres: genresMap[anime.id] || [],
            episodes: episodesMap[anime.id] 
                ? Object.values(episodesMap[anime.id]).sort((a, b) => a.episode - b.episode)
                : []
        };
        
        return animeObj;
    });
}

/**
 * Stores anime data for a season and year
 * @param {string} season - Season (WINTER, SPRING, SUMMER, FALL)
 * @param {number} year - Year
 * @param {Array} animeList - Array of anime objects to store
 */
export function storeAnime(season, year, animeList) {
    const database = getDB();
    
    // Begin transaction for atomicity
    const transaction = database.transaction(() => {
        // Update or insert query record
        const queryStmt = database.prepare(`
            INSERT INTO queries (season, year, lastFetched)
            VALUES (?, ?, ?)
            ON CONFLICT(season, year) DO UPDATE SET lastFetched = excluded.lastFetched
        `);
        queryStmt.run(season, year, Date.now());
        
        // Delete old anime data for this season/year (cascade will handle related records)
        const deleteStmt = database.prepare(`
            DELETE FROM anime WHERE season = ? AND year = ?
        `);
        deleteStmt.run(season, year);
        
        // Prepare statements for inserts
        const animeStmt = database.prepare(`
            INSERT INTO anime (
                id, idMal, season, year, image, description,
                title_romaji, title_english, title_native,
                startDate_year, startDate_month, startDate_day
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        // Genre management: get or create genre, then link
        const getGenreIdStmt = database.prepare(`
            SELECT id FROM genres WHERE name = ?
        `);
        
        const createGenreStmt = database.prepare(`
            INSERT INTO genres (name)
            VALUES (?)
        `);
        
        const genreLinkStmt = database.prepare(`
            INSERT OR IGNORE INTO anime_genres (anime_id, genre_id)
            VALUES (?, ?)
        `);
        
        /**
         * Gets or creates a genre and returns its ID
         * @param {string} genreName - Name of the genre
         * @returns {number} Genre ID
         */
        function getOrCreateGenreId(genreName) {
            let genreResult = getGenreIdStmt.get(genreName);
            
            if (!genreResult) {
                // Genre doesn't exist, create it
                const insertResult = createGenreStmt.run(genreName);
                return insertResult.lastInsertRowid;
            }
            
            return genreResult.id;
        }
        
        const episodeStmt = database.prepare(`
            INSERT OR IGNORE INTO episodes (anime_id, episode_number, airingAt)
            VALUES (?, ?, ?)
        `);
        
        // Subgroup management: get or create subgroup, then link
        const getSubGroupIdStmt = database.prepare(`
            SELECT id FROM sub_groups WHERE name = ?
        `);
        
        const createSubGroupStmt = database.prepare(`
            INSERT INTO sub_groups (name)
            VALUES (?)
        `);
        
        /**
         * Gets or creates a subgroup and returns its ID
         * @param {string} subGroupName - Name of the subgroup
         * @returns {number|null} Subgroup ID or null if name is empty/null
         */
        function getOrCreateSubGroupId(subGroupName) {
            if (!subGroupName) return null;
            
            let subGroupResult = getSubGroupIdStmt.get(subGroupName);
            
            if (!subGroupResult) {
                // Subgroup doesn't exist, create it
                const insertResult = createSubGroupStmt.run(subGroupName);
                return insertResult.lastInsertRowid;
            }
            
            return subGroupResult.id;
        }
        
        const torrentStmt = database.prepare(`
            INSERT INTO torrents (
                episode_id, title, link, date, episode_number, sub_group_id
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        // Check if a torrent with the same link already exists
        const checkTorrentExistsStmt = database.prepare(`
            SELECT id FROM torrents WHERE link = ?
        `);
        
        // Check if anime already exists (from any season/year)
        const checkAnimeExistsStmt = database.prepare(`
            SELECT id, season, year FROM anime WHERE id = ?
        `);
        
        // Get or check episode ID for existing episodes
        const getEpisodeIdStmt = database.prepare(`
            SELECT id FROM episodes WHERE anime_id = ? AND episode_number = ?
        `);
        
        // Insert anime data
        for (const anime of animeList) {
            // Check if anime with this ID already exists from a previous season
            const existingAnime = checkAnimeExistsStmt.get(anime.id);
            
            if (existingAnime) {
                // Anime already exists from a different season/year, skip inserting new record
                console.log(`Anime ID ${anime.id} already exists from ${existingAnime.season} ${existingAnime.year}, skipping anime insertion but updating episodes for ${season} ${year}`);
            } else {
                // Extract startDate components
                let startDate_year = null;
                let startDate_month = null;
                let startDate_day = null;
                
                if (anime.startDate instanceof Date) {
                    startDate_year = anime.startDate.getFullYear();
                    startDate_month = anime.startDate.getMonth() + 1;
                    startDate_day = anime.startDate.getDate();
                } else if (anime.startDate && typeof anime.startDate === 'object') {
                    startDate_year = anime.startDate.year || null;
                    startDate_month = anime.startDate.month || null;
                    startDate_day = anime.startDate.day || null;
                }
                
                // Insert anime record (only if it doesn't exist)
                animeStmt.run(
                    anime.id,
                    anime.idMal || null,
                    season,
                    year,
                    anime.image || null,
                    anime.description || null,
                    anime.title?.romaji || null,
                    anime.title?.english || null,
                    anime.title?.native || null,
                    startDate_year,
                    startDate_month,
                    startDate_day
                );
            }
            
            // Insert genres and create relationships (for both new and existing anime)
            if (anime.genres && Array.isArray(anime.genres)) {
                for (const genreName of anime.genres) {
                    if (genreName) {
                        // Get or create genre and get its ID
                        const genreId = getOrCreateGenreId(genreName);
                        
                        // Link anime to genre (INSERT OR IGNORE handles duplicates)
                        genreLinkStmt.run(anime.id, genreId);
                    }
                }
            }
            
            // Insert episodes (for both new and existing anime)
            if (anime.episodes && Array.isArray(anime.episodes)) {
                for (const episode of anime.episodes) {
                    const airingAtTimestamp = episode.airingAt instanceof Date 
                        ? episode.airingAt.getTime() 
                        : (episode.airingAt || 0);
                    
                    // Try to insert episode (INSERT OR IGNORE will skip if it already exists)
                    const episodeResult = episodeStmt.run(anime.id, episode.episode, airingAtTimestamp);
                    let episodeId = episodeResult.lastInsertRowid;
                    
                    // If episode already existed, get its ID
                    if (!episodeId) {
                        const existingEpisode = getEpisodeIdStmt.get(anime.id, episode.episode);
                        if (existingEpisode) {
                            episodeId = existingEpisode.id;
                        }
                    }
                    
                    // Insert torrents for this episode (only if we have an episode ID)
                    if (episodeId && episode.torrents && Array.isArray(episode.torrents)) {
                        for (const torrent of episode.torrents) {
                            // Skip if link is missing
                            if (!torrent.link) {
                                continue;
                            }
                            
                            // Check if a torrent with the same link already exists
                            const existingTorrent = checkTorrentExistsStmt.get(torrent.link);
                            if (existingTorrent) {
                                // Torrent with this link already exists, skip insertion
                                continue;
                            }
                            
                            const torrentDate = torrent.date instanceof Date 
                                ? torrent.date.getTime() 
                                : (torrent.date || Date.now());
                            
                            // Get or create subgroup and get its ID
                            const subGroupId = getOrCreateSubGroupId(torrent.subGroup);
                            
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
                }
            }
        }
    });
    
    transaction();
}

/**
 * Retrieves a single anime by ID with all episodes and torrents
 * @param {number} animeId - Anime ID
 * @returns {Object|null} Anime object or null if not found
 */
export function getAnimeById(animeId) {
    const database = getDB();
    
    // Get anime record
    const animeQuery = database.prepare(`
        SELECT * 
        FROM anime 
        WHERE id = ?
    `);
    
    const animeRecord = animeQuery.get(animeId);
    
    if (!animeRecord) {
        return null;
    }
    
    // Get genres for the anime
    const genresQuery = database.prepare(`
        SELECT g.name as genre_name
        FROM anime_genres ag
        INNER JOIN genres g ON ag.genre_id = g.id
        WHERE ag.anime_id = ?
        ORDER BY g.name
    `);
    
    const genreRecords = genresQuery.all(animeId);
    const genres = genreRecords.map(gr => gr.genre_name);
    
    // Get alternative titles for the anime
    const altTitlesQuery = database.prepare(`
        SELECT title
        FROM alternative_titles
        WHERE anime_id = ?
        ORDER BY title ASC
    `);
    
    const altTitleRecords = altTitlesQuery.all(animeId);
    const alternativeTitles = altTitleRecords.map(at => at.title);
    
    // Get all episodes first (regardless of torrents)
    const allEpisodesQuery = database.prepare(`
        SELECT * FROM episodes
        WHERE anime_id = ?
        ORDER BY episode_number ASC
    `);
    
    const allEpisodes = allEpisodesQuery.all(animeId);
    
    // Get torrents with enabled subgroups only
    const torrentsQuery = database.prepare(`
        SELECT t.id as torrent_id, t.title as torrent_title, 
               t.link as torrent_link,
               t.date as torrent_date, t.episode_number as torrent_episode_number,
               t.episode_id,
               sg.name as sub_group_name
        FROM torrents t
        LEFT JOIN sub_groups sg ON t.sub_group_id = sg.id
        WHERE t.episode_id IN (SELECT id FROM episodes WHERE anime_id = ?)
          AND (t.sub_group_id IS NOT NULL AND sg.enabled = 1)
        ORDER BY t.episode_id, t.date DESC
    `);
    
    const torrentRecords = torrentsQuery.all(animeId);
    
    // Group torrents by episode_id
    const torrentsByEpisodeId = {};
    torrentRecords.forEach(tr => {
        if (!torrentsByEpisodeId[tr.episode_id]) {
            torrentsByEpisodeId[tr.episode_id] = [];
        }
        torrentsByEpisodeId[tr.episode_id].push({
            title: tr.torrent_title,
            link: tr.torrent_link,
            date: new Date(tr.torrent_date),
            episode: tr.torrent_episode_number,
            subGroup: tr.sub_group_name || null
        });
    });
    
    // Build episodes map with all episodes, attaching torrents where available
    const episodesMap = {};
    allEpisodes.forEach(ep => {
        episodesMap[ep.episode_number] = {
            episode: ep.episode_number,
            airingAt: new Date(ep.airingAt),
            torrents: torrentsByEpisodeId[ep.id] || []
        };
    });
    
    // Reconstruct anime object
    const animeObj = {
        id: animeRecord.id,
        idMal: animeRecord.idMal,
        image: animeRecord.image,
        description: animeRecord.description,
        title: {
            romaji: animeRecord.title_romaji || "",
            english: animeRecord.title_english || "",
            native: animeRecord.title_native || ""
        },
        startDate: animeRecord.startDate_year !== null && animeRecord.startDate_month !== null && animeRecord.startDate_day !== null
            ? new Date(animeRecord.startDate_year, animeRecord.startDate_month - 1, animeRecord.startDate_day)
            : null,
        genres: genres,
        alternativeTitles: alternativeTitles,
        lastTorrentScan: animeRecord.lastTorrentScan ? new Date(animeRecord.lastTorrentScan) : null,
        episodes: Object.values(episodesMap).sort((a, b) => a.episode - b.episode)
    };
    
    return animeObj;
}

/**
 * Closes the database connection
 */
export function closeDB() {
    if (db) {
        db.close();
        db = null;
    }
}

