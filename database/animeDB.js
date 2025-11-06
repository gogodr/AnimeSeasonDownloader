import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { seasonToQuarter } from '../config/constants.js';

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
            quarter TEXT NOT NULL,
            year INTEGER NOT NULL,
            lastFetched INTEGER NOT NULL,
            PRIMARY KEY (quarter, year)
        )
    `);
    
        // Create anime table based on animeTemplate structure
        db.exec(`
            CREATE TABLE IF NOT EXISTS anime (
                id INTEGER PRIMARY KEY,
                idMal INTEGER,
                anidbID INTEGER,
                quarter TEXT NOT NULL,
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
                season INTEGER DEFAULT 1,
                FOREIGN KEY (quarter, year) REFERENCES queries(quarter, year) ON DELETE CASCADE
            )
        `);
    
    // Migration: Rename season column to quarter if it exists
    try {
        const queriesTableInfo = db.prepare(`PRAGMA table_info(queries)`).all();
        const hasSeasonColumn = queriesTableInfo.some(col => col.name === 'season');
        const hasQuarterColumn = queriesTableInfo.some(col => col.name === 'quarter');
        
        if (hasSeasonColumn && !hasQuarterColumn) {
            console.log('Migrating queries table: season -> quarter');
            // Add quarter column
            db.exec(`ALTER TABLE queries ADD COLUMN quarter TEXT`);
            // Migrate data: convert season to quarter
            const seasonMap = { 'WINTER': 'Q1', 'SPRING': 'Q2', 'SUMMER': 'Q3', 'FALL': 'Q4' };
            const updateStmt = db.prepare(`UPDATE queries SET quarter = ? WHERE season = ?`);
            for (const [season, quarter] of Object.entries(seasonMap)) {
                updateStmt.run(quarter, season);
            }
            // Create new table with correct structure
            db.exec(`
                CREATE TABLE queries_new (
                    quarter TEXT NOT NULL,
                    year INTEGER NOT NULL,
                    lastFetched INTEGER NOT NULL,
                    PRIMARY KEY (quarter, year)
                )
            `);
            db.exec(`INSERT INTO queries_new SELECT quarter, year, lastFetched FROM queries`);
            db.exec(`DROP TABLE queries`);
            db.exec(`ALTER TABLE queries_new RENAME TO queries`);
        }
    } catch (error) {
        console.warn('Migration warning (queries table):', error.message);
    }
    
    try {
        const animeTableInfo = db.prepare(`PRAGMA table_info(anime)`).all();
        const hasSeasonColumn = animeTableInfo.some(col => col.name === 'season');
        const hasQuarterColumn = animeTableInfo.some(col => col.name === 'quarter');
        
        if (hasSeasonColumn && !hasQuarterColumn) {
            console.log('Migrating anime table: season -> quarter');
            // Add quarter column
            db.exec(`ALTER TABLE anime ADD COLUMN quarter TEXT`);
            // Migrate data: convert season to quarter
            const seasonMap = { 'WINTER': 'Q1', 'SPRING': 'Q2', 'SUMMER': 'Q3', 'FALL': 'Q4' };
            const updateStmt = db.prepare(`UPDATE anime SET quarter = ? WHERE season = ?`);
            for (const [season, quarter] of Object.entries(seasonMap)) {
                updateStmt.run(quarter, season);
            }
            // Note: We can't easily drop the season column in SQLite, but it will be ignored
            // The foreign key constraint will need to be recreated
            db.exec(`DROP INDEX IF EXISTS idx_anime_season_year`);
        }
    } catch (error) {
        console.warn('Migration warning (anime table):', error.message);
    }
    
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
    
    // Add season column to existing anime table if it doesn't exist (migration)
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(anime)`).all();
        const hasSeasonColumn = tableInfo.some(col => col.name === 'season');
        
        if (!hasSeasonColumn) {
            db.exec(`ALTER TABLE anime ADD COLUMN season INTEGER DEFAULT 1`);
        }
    } catch (error) {
        // If table doesn't exist yet, it will be created with the column above
        // This is fine, just log the error for debugging
        console.warn('Migration warning (season column):', error.message);
    }
    
    // Add anidbID column to existing anime table if it doesn't exist (migration)
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(anime)`).all();
        const hasAnidbIDColumn = tableInfo.some(col => col.name === 'anidbID');
        
        if (!hasAnidbIDColumn) {
            db.exec(`ALTER TABLE anime ADD COLUMN anidbID INTEGER`);
        }
    } catch (error) {
        // If table doesn't exist yet, it will be created with the column above
        // This is fine, just log the error for debugging
        console.warn('Migration warning (anidbID column):', error.message);
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
            enabled INTEGER NOT NULL DEFAULT 0,
            anidbID INTEGER
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
    
    // Add anidbID column to existing sub_groups table if it doesn't exist (migration)
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(sub_groups)`).all();
        const hasAnidbIDColumn = tableInfo.some(col => col.name === 'anidbID');
        
        if (!hasAnidbIDColumn) {
            db.exec(`ALTER TABLE sub_groups ADD COLUMN anidbID INTEGER`);
        }
    } catch (error) {
        // If table doesn't exist yet, it will be created with the column above
        // This is fine, just log the error for debugging
        console.warn('Migration warning (anidbID column):', error.message);
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
        CREATE INDEX IF NOT EXISTS idx_anime_quarter_year 
        ON anime(quarter, year)
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
    
    // Create anidb_cache table for caching AniDB search requests
    db.exec(`
        CREATE TABLE IF NOT EXISTS anidb_cache (
            searchUrl TEXT PRIMARY KEY,
            lastQuery INTEGER NOT NULL,
            anidbID INTEGER,
            htmlContent TEXT
        )
    `);
    
    // Add htmlContent column to existing anidb_cache table if it doesn't exist (migration)
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(anidb_cache)`).all();
        const hasHtmlContentColumn = tableInfo.some(col => col.name === 'htmlContent');
        
        if (!hasHtmlContentColumn) {
            db.exec(`ALTER TABLE anidb_cache ADD COLUMN htmlContent TEXT`);
        }
    } catch (error) {
        // If table doesn't exist yet, it will be created with the column above
        // This is fine, just log the error for debugging
        console.warn('Migration warning (htmlContent column):', error.message);
    }
    
    // Create index for faster lookups by lastQuery
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_anidb_cache_lastQuery 
        ON anidb_cache(lastQuery)
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
 * Checks if cached data for a quarter/year exists and is less than 2 weeks old
 * @param {string} quarter - Quarter (Q1, Q2, Q3, Q4)
 * @param {number} year - Year
 * @returns {boolean} True if cached data is valid (less than 2 weeks old)
 */
export function isCacheValid(quarter, year) {
    const database = getDB();
    const twoWeeksInMs = 14 * 24 * 60 * 60 * 1000; // 2 weeks in milliseconds
    const now = Date.now();
    
    const query = database.prepare(`
        SELECT lastFetched 
        FROM queries 
        WHERE quarter = ? AND year = ?
    `);
    
    const result = query.get(quarter, year);
    
    if (!result) {
        return false; // No cached data exists
    }
    
    const age = now - result.lastFetched;
    return age < twoWeeksInMs;
}

/**
 * Retrieves cached anime data for a quarter and year
 * @param {string} quarter - Quarter (Q1, Q2, Q3, Q4)
 * @param {number} year - Year
 * @returns {Array|null} Array of anime objects or null if not found
 */
export function getCachedAnime(quarter, year) {
    const database = getDB();
    
    // Get anime records
    const animeQuery = database.prepare(`
        SELECT * 
        FROM anime 
        WHERE quarter = ? AND year = ?
        ORDER BY id
    `);
    
    const animeRecords = animeQuery.all(quarter, year);
    
    if (animeRecords.length === 0) {
        return null;
    }
    
    // Get genres for all anime (join with genres table to get genre names)
    const genresQuery = database.prepare(`
        SELECT ag.anime_id, g.name as genre_name
        FROM anime_genres ag
        INNER JOIN genres g ON ag.genre_id = g.id
        WHERE ag.anime_id IN (SELECT id FROM anime WHERE quarter = ? AND year = ?)
        ORDER BY ag.anime_id, g.name
    `);
    
    const genreRecords = genresQuery.all(quarter, year);
    const genresMap = {};
    genreRecords.forEach(gr => {
        if (!genresMap[gr.anime_id]) {
            genresMap[gr.anime_id] = [];
        }
        genresMap[gr.anime_id].push(gr.genre_name);
    });
    
    // Get all episodes first (to count total episodes)
    const allEpisodesQuery = database.prepare(`
        SELECT anime_id, COUNT(DISTINCT episode_number) as total
        FROM episodes
        WHERE anime_id IN (SELECT id FROM anime WHERE quarter = ? AND year = ?)
        GROUP BY anime_id
    `);
    
    const allEpisodesRecords = allEpisodesQuery.all(quarter, year);
    const totalEpisodesMap = {};
    allEpisodesRecords.forEach(er => {
        totalEpisodesMap[er.anime_id] = er.total;
    });
    
    // Get episodes with enabled subgroup torrents (for display)
    const episodesQuery = database.prepare(`
        SELECT e.*, t.id as torrent_id, t.title as torrent_title, 
               t.link as torrent_link,
               t.date as torrent_date, t.episode_number as torrent_episode_number,
               sg.name as sub_group_name
        FROM episodes e
        LEFT JOIN torrents t ON e.id = t.episode_id
        LEFT JOIN sub_groups sg ON t.sub_group_id = sg.id
        WHERE e.anime_id IN (SELECT id FROM anime WHERE quarter = ? AND year = ?)
          AND (t.sub_group_id IS NOT NULL AND sg.enabled = 1)
        ORDER BY e.anime_id, e.episode_number, t.date DESC
    `);
    
    const episodeRecords = episodesQuery.all(quarter, year);
    const episodesMap = {};
    const trackedEpisodesMap = {};
    
    episodeRecords.forEach(er => {
        if (!episodesMap[er.anime_id]) {
            episodesMap[er.anime_id] = {};
            trackedEpisodesMap[er.anime_id] = new Set();
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
            // Mark this episode as tracked
            trackedEpisodesMap[er.anime_id].add(er.episode_number);
        }
    });
    
    // Get last episode with at least 1 torrent for each anime
    const lastEpisodeQuery = database.prepare(`
        SELECT DISTINCT e.anime_id, e.episode_number, e.airingAt
        FROM episodes e
        INNER JOIN torrents t ON e.id = t.episode_id
        INNER JOIN sub_groups sg ON t.sub_group_id = sg.id
        WHERE e.anime_id IN (SELECT id FROM anime WHERE quarter = ? AND year = ?)
          AND sg.enabled = 1
          AND e.episode_number = (
              SELECT MAX(e2.episode_number)
              FROM episodes e2
              INNER JOIN torrents t2 ON e2.id = t2.episode_id
              INNER JOIN sub_groups sg2 ON t2.sub_group_id = sg2.id
              WHERE e2.anime_id = e.anime_id AND sg2.enabled = 1
          )
    `);
    
    const lastEpisodeRecords = lastEpisodeQuery.all(quarter, year);
    const lastEpisodeMap = {};
    lastEpisodeRecords.forEach(ler => {
        lastEpisodeMap[ler.anime_id] = {
            episode: ler.episode_number,
            airingAt: new Date(ler.airingAt)
        };
    });
    
    // Reconstruct anime objects
    return animeRecords.map(anime => {
        const totalEpisodes = totalEpisodesMap[anime.id] || 0;
        const episodesTracked = trackedEpisodesMap[anime.id] ? trackedEpisodesMap[anime.id].size : 0;
        const lastEpisodeData = lastEpisodeMap[anime.id] || null;
        
        const animeObj = {
            id: anime.id,
            idMal: anime.idMal,
            anidbID: anime.anidbID || null,
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
                : [],
            episodesTracked: episodesTracked,
            totalEpisodes: totalEpisodes,
            lastEpisodeWithTorrent: lastEpisodeData ? lastEpisodeData.episode : null,
            lastEpisodeAirDate: lastEpisodeData ? lastEpisodeData.airingAt : null,
            season: anime.season || 1
        };
        
        return animeObj;
    });
}

/**
 * Stores anime data for a quarter and year
 * @param {string} quarter - Quarter (Q1, Q2, Q3, Q4)
 * @param {number} year - Year
 * @param {Array} animeList - Array of anime objects to store
 */
export function storeAnime(quarter, year, animeList) {
    const database = getDB();
    
    // Collect torrents to store after main transaction
    const torrentsToStore = [];
    
    // Begin transaction for atomicity
    const transaction = database.transaction(() => {
        // Update or insert query record
        const queryStmt = database.prepare(`
            INSERT INTO queries (quarter, year, lastFetched)
            VALUES (?, ?, ?)
            ON CONFLICT(quarter, year) DO UPDATE SET lastFetched = excluded.lastFetched
        `);
        queryStmt.run(quarter, year, Date.now());
        
        // Get existing anime IDs for this quarter/year
        const getExistingAnimeIdsStmt = database.prepare(`
            SELECT id FROM anime WHERE quarter = ? AND year = ?
        `);
        const existingAnimeRecords = getExistingAnimeIdsStmt.all(quarter, year);
        const existingAnimeIds = new Set(existingAnimeRecords.map(r => r.id));
        
        // Get new anime IDs from the incoming list
        const newAnimeIds = new Set(animeList.map(anime => anime.id));
        
        // Find anime IDs that exist in database but not in new list - these should be deleted
        const animeIdsToDelete = [...existingAnimeIds].filter(id => !newAnimeIds.has(id));
        
        // Delete only anime entries that are not present in the new season
        if (animeIdsToDelete.length > 0) {
            const deleteStmt = database.prepare(`
                DELETE FROM anime WHERE id = ?
            `);
            for (const animeId of animeIdsToDelete) {
                deleteStmt.run(animeId);
            }
        }
        
        // Prepare statements for inserts and updates
        const animeInsertStmt = database.prepare(`
            INSERT INTO anime (
                id, idMal, anidbID, quarter, year, image, description,
                title_romaji, title_english, title_native,
                startDate_year, startDate_month, startDate_day, season
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const animeUpdateStmt = database.prepare(`
            UPDATE anime SET
                idMal = ?,
                anidbID = ?,
                image = ?,
                description = ?,
                title_romaji = ?,
                title_english = ?,
                title_native = ?,
                startDate_year = ?,
                startDate_month = ?,
                startDate_day = ?,
                season = ?
            WHERE id = ? AND quarter = ? AND year = ?
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
        
        // Remove old genre links for anime being updated
        const removeGenreLinksStmt = database.prepare(`
            DELETE FROM anime_genres WHERE anime_id = ?
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
        
        // Check if anime already exists (from any quarter/year)
        const checkAnimeExistsStmt = database.prepare(`
            SELECT id, quarter, year FROM anime WHERE id = ?
        `);
        
        // Process anime data
        for (const anime of animeList) {
            // Extract startDate components
            let startDate_year = null;
            let startDate_month = null;
            let startDate_day = null;
            
            if (anime.startDate instanceof Date) {
                startDate_year = anime.startDate.getFullYear();
                startDate_month = anime.startDate.getMonth();
                startDate_day = anime.startDate.getDate();
            } else if (anime.startDate && typeof anime.startDate === 'object') {
                startDate_year = anime.startDate.year || null;
                startDate_month = anime.startDate.month || null;
                startDate_day = anime.startDate.day || null;
            }
            
            // Check if anime with this ID already exists
            const existingAnime = checkAnimeExistsStmt.get(anime.id);
            
            if (existingAnime) {
                if (existingAnime.quarter === quarter && existingAnime.year === year) {
                    // Anime exists in the same quarter/year - update it
                    animeUpdateStmt.run(
                        anime.idMal || null,
                        anime.anidbID || null,
                        anime.image || null,
                        anime.description || null,
                        anime.title?.romaji || null,
                        anime.title?.english || null,
                        anime.title?.native || null,
                        startDate_year,
                        startDate_month,
                        startDate_day,
                        anime.season || 1,
                        anime.id,
                        quarter,
                        year
                    );
                    
                    // Remove old genre links before adding new ones (only for this quarter/year)
                    removeGenreLinksStmt.run(anime.id);
                } else {
                    // Anime already exists from a different quarter/year, skip inserting/updating
                    console.log(`Anime ID ${anime.id} already exists from ${existingAnime.quarter} ${existingAnime.year}, skipping anime insertion but updating episodes for ${quarter} ${year}`);
                    
                    // Don't update genres for anime from other quarters - keep their existing genres
                }
            } else {
                // New anime - insert it
                animeInsertStmt.run(
                    anime.id,
                    anime.idMal || null,
                    anime.anidbID || null,
                    quarter,
                    year,
                    anime.image || null,
                    anime.description || null,
                    anime.title?.romaji || null,
                    anime.title?.english || null,
                    anime.title?.native || null,
                    startDate_year,
                    startDate_month,
                    startDate_day,
                    anime.season || 1
                );
            }
            
            // Insert genres and create relationships (only for new anime or anime being updated in this quarter)
            // Skip genre updates for anime from other quarters
            const shouldUpdateGenres = !existingAnime || (existingAnime.quarter === quarter && existingAnime.year === year);
            
            if (shouldUpdateGenres && anime.genres && Array.isArray(anime.genres)) {
                for (const genreName of anime.genres) {
                    if (genreName) {
                        // Get or create genre and get its ID
                        const genreId = getOrCreateGenreId(genreName);
                        
                        // Link anime to genre (INSERT OR IGNORE handles duplicates)
                        genreLinkStmt.run(anime.id, genreId);
                    }
                }
            }
            
            // Insert episodes and collect torrents by episode number
            const torrentsByEpisode = {};
            if (anime.episodes && Array.isArray(anime.episodes)) {
                for (const episode of anime.episodes) {
                    const airingAtTimestamp = episode.airingAt instanceof Date 
                        ? episode.airingAt.getTime() 
                        : (episode.airingAt || 0);
                    
                    // Try to insert episode (INSERT OR IGNORE will skip if it already exists)
                    episodeStmt.run(anime.id, episode.episode, airingAtTimestamp);
                    
                    // Collect torrents for this episode
                    if (episode.torrents && Array.isArray(episode.torrents)) {
                        if (!torrentsByEpisode[episode.episode]) {
                            torrentsByEpisode[episode.episode] = [];
                        }
                        torrentsByEpisode[episode.episode].push(...episode.torrents);
                    }
                }
            }
            
            // Collect torrents to store after transaction completes
            if (Object.keys(torrentsByEpisode).length > 0) {
                torrentsToStore.push({ animeId: anime.id, torrentsByEpisode });
            }
        }
    });
    
    // Execute main transaction
    transaction();
    
    // Store torrents after main transaction (storeAnimeTorrents has its own transaction)
    for (const { animeId, torrentsByEpisode } of torrentsToStore) {
        storeAnimeTorrents(animeId, torrentsByEpisode);
    }
}

/**
 * Gets alternative titles for an anime
 * @param {number} animeId - Anime ID
 * @returns {Array<string>} Array of alternative titles
 */
export function getAlternativeTitles(animeId) {
    const database = getDB();
    const altTitlesQuery = database.prepare(`
        SELECT title
        FROM alternative_titles
        WHERE anime_id = ?
        ORDER BY title ASC
    `);
    const altTitleRecords = altTitlesQuery.all(animeId);
    return altTitleRecords.map(at => at.title);
}

/**
 * Stores torrents for an anime (used by scanAnimeTorrents)
 * @param {number} animeId - Anime ID
 * @param {Object} torrentsByEpisode - Object mapping episode numbers to arrays of torrent objects
 * @returns {number} Number of torrents processed
 */
export function storeAnimeTorrents(animeId, torrentsByEpisode) {
    const database = getDB();
    
    const transaction = database.transaction(() => {
        // Use the exported getOrCreateSubGroupId function
        // Note: We can't call it directly here since it opens its own DB connection
        // So we'll use the local version for transaction consistency
        const getSubGroupIdStmt = database.prepare(`SELECT id FROM sub_groups WHERE name = ?`);
        const createSubGroupStmt = database.prepare(`INSERT INTO sub_groups (name, enabled) VALUES (?, 0)`);
        
        function getOrCreateSubGroupIdLocal(subGroupName) {
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
        
        // Update torrent statement (updates all fields except link)
        const torrentUpdateStmt = database.prepare(`
            UPDATE torrents SET
                episode_id = ?,
                title = ?,
                date = ?,
                episode_number = ?,
                sub_group_id = ?
            WHERE link = ?
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
                
                const torrentDate = torrent.date instanceof Date 
                    ? torrent.date.getTime() 
                    : (torrent.date || Date.now());
                
                // Get or create subgroup
                const subGroupId = getOrCreateSubGroupIdLocal(torrent.subGroup);
                
                // Check if torrent already exists
                const existingTorrent = checkTorrentExistsStmt.get(torrent.link);
                if (existingTorrent) {
                    // Torrent with this link already exists, update all fields except link
                    torrentUpdateStmt.run(
                        episodeId,
                        torrent.title || "",
                        torrentDate,
                        torrent.episode || null,
                        subGroupId,
                        torrent.link
                    );
                } else {
                    // New torrent - insert it
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
        
        // Update lastTorrentScan timestamp
        const updateScanTimeStmt = database.prepare(`
            UPDATE anime SET lastTorrentScan = ? WHERE id = ?
        `);
        updateScanTimeStmt.run(Date.now(), animeId);
    });
    
    transaction();
    
    // Return count of all torrents processed
    return Object.values(torrentsByEpisode).reduce((sum, torrents) => sum + torrents.length, 0);
}

/**
 * Deletes all torrents associated with an anime
 * @param {number} animeId - Anime ID
 * @returns {number} Number of torrents deleted
 */
export function deleteTorrentsForAnime(animeId) {
    const database = getDB();
    
    const deleteStmt = database.prepare(`
        DELETE FROM torrents
        WHERE episode_id IN (
            SELECT id FROM episodes WHERE anime_id = ?
        )
    `);
    
    const result = deleteStmt.run(animeId);
    return result.changes;
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
    const trackedEpisodeNumbers = new Set();
    
    allEpisodes.forEach(ep => {
        const hasTorrents = torrentsByEpisodeId[ep.id] && torrentsByEpisodeId[ep.id].length > 0;
        if (hasTorrents) {
            trackedEpisodeNumbers.add(ep.episode_number);
        }
        
        episodesMap[ep.episode_number] = {
            episode: ep.episode_number,
            airingAt: new Date(ep.airingAt),
            torrents: torrentsByEpisodeId[ep.id] || []
        };
    });
    
    // Calculate counts
    const totalEpisodes = allEpisodes.length;
    const episodesTracked = trackedEpisodeNumbers.size;
    
    // Reconstruct anime object
    const animeObj = {
        id: animeRecord.id,
        idMal: animeRecord.idMal,
        anidbID: animeRecord.anidbID || null,
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
        episodes: Object.values(episodesMap).sort((a, b) => a.episode - b.episode),
        episodesTracked: episodesTracked,
        totalEpisodes: totalEpisodes,
        season: animeRecord.season || 1
    };
    
    return animeObj;
}

/**
 * Gets or creates a subgroup and returns its ID
 * @param {string} subGroupName - Name of the subgroup
 * @returns {number|null} Subgroup ID or null if name is empty
 */
export function getOrCreateSubGroupId(subGroupName) {
    if (!subGroupName) return null;
    
    const database = getDB();
    const getSubGroupIdStmt = database.prepare(`SELECT id FROM sub_groups WHERE name = ?`);
    const createSubGroupStmt = database.prepare(`INSERT INTO sub_groups (name, enabled) VALUES (?, 0)`);
    
    let subGroupResult = getSubGroupIdStmt.get(subGroupName);
    if (!subGroupResult) {
        const insertResult = createSubGroupStmt.run(subGroupName);
        return insertResult.lastInsertRowid;
    }
    return subGroupResult.id;
}

/**
 * Gets a subgroup by name
 * @param {string} subGroupName - Name of the subgroup
 * @returns {Object|null} Subgroup object with id, name, enabled, and anidbID, or null if not found
 */
export function getSubGroupByName(subGroupName) {
    if (!subGroupName) return null;
    
    const database = getDB();
    const getSubGroupStmt = database.prepare(`SELECT id, name, enabled, anidbID FROM sub_groups WHERE name = ?`);
    return getSubGroupStmt.get(subGroupName) || null;
}

/**
 * Updates a subgroup's anidbID
 * @param {number} subGroupId - ID of the subgroup
 * @param {number|null} anidbID - AniDB ID to set
 */
export function updateSubGroupAnidbID(subGroupId, anidbID) {
    if (!subGroupId) return;
    
    const database = getDB();
    const updateStmt = database.prepare(`UPDATE sub_groups SET anidbID = ? WHERE id = ?`);
    updateStmt.run(anidbID, subGroupId);
}

/**
 * Gets cached AniDB result if it exists and is less than 1 week old
 * @param {string} searchUrl - The search URL used as cache key
 * @returns {number|null|undefined} Cached anidbID if valid cache exists, undefined if cache expired or doesn't exist
 */
export function getCachedAnidbResult(searchUrl) {
    if (!searchUrl) return undefined;
    
    const database = getDB();
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
    const now = Date.now();
    
    const query = database.prepare(`
        SELECT lastQuery, anidbID 
        FROM anidb_cache 
        WHERE searchUrl = ?
    `);
    
    const result = query.get(searchUrl);
    
    if (!result) {
        return undefined; // No cache exists
    }
    
    const age = now - result.lastQuery;
    if (age >= oneWeekInMs) {
        return undefined; // Cache expired
    }
    
    // Return cached result (can be null if not found previously)
    return result.anidbID;
}

/**
 * Stores AniDB search result in cache
 * @param {string} searchUrl - The search URL used as cache key
 * @param {number|null} anidbID - The resulting anidbID or null if not found
 * @param {string|null} htmlContent - Optional HTML content to store
 */
export function storeAnidbCache(searchUrl, anidbID, htmlContent = null) {
    if (!searchUrl) return;
    
    const database = getDB();
    const insertStmt = database.prepare(`
        INSERT INTO anidb_cache (searchUrl, lastQuery, anidbID, htmlContent)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(searchUrl) DO UPDATE SET 
            lastQuery = excluded.lastQuery,
            anidbID = excluded.anidbID,
            htmlContent = excluded.htmlContent
    `);
    
    insertStmt.run(searchUrl, Date.now(), anidbID, htmlContent);
}

/**
 * Gets cached AniDB HTML content if it exists and is less than the specified expiration time old
 * @param {string} searchUrl - The search URL used as cache key
 * @param {number} expirationMs - Expiration time in milliseconds (default: 1 week)
 * @returns {string|undefined} Cached HTML content if valid cache exists, undefined if cache expired or doesn't exist
 */
export function getCachedAnidbHtml(searchUrl, expirationMs = 7 * 24 * 60 * 60 * 1000) {
    if (!searchUrl) return undefined;
    
    const database = getDB();
    const now = Date.now();
    
    const query = database.prepare(`
        SELECT lastQuery, htmlContent 
        FROM anidb_cache 
        WHERE searchUrl = ?
    `);
    
    const result = query.get(searchUrl);
    
    if (!result) {
        return undefined; // No cache exists
    }
    
    const age = now - result.lastQuery;
    if (age >= expirationMs) {
        return undefined; // Cache expired
    }
    
    // Return cached HTML content (can be null if not stored previously)
    return result.htmlContent || undefined;
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

