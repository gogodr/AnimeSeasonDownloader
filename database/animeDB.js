import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { seasonToQuarter } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'anime.db');

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
                autodownload INTEGER NOT NULL DEFAULT 0,
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
    
    // Add autodownload column to existing anime table if it doesn't exist (migration)
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(anime)`).all();
        const hasAutodownloadColumn = tableInfo.some(col => col.name === 'autodownload');
        
        if (!hasAutodownloadColumn) {
            db.exec(`ALTER TABLE anime ADD COLUMN autodownload INTEGER NOT NULL DEFAULT 0`);
        }
    } catch (error) {
        // If table doesn't exist yet, it will be created with the column above
        // This is fine, just log the error for debugging
        console.warn('Migration warning (autodownload column):', error.message);
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
    
    // Create tasks table to track background jobs
    db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            anime_id INTEGER,
            payload TEXT,
            result TEXT,
            error TEXT,
            createdAt INTEGER NOT NULL,
            updatedAt INTEGER NOT NULL,
            FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE SET NULL
        )
    `);

    // Create sub_groups table
    db.exec(`
        CREATE TABLE IF NOT EXISTS sub_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            anidbID INTEGER,
            default_enabled INTEGER NOT NULL DEFAULT 0
        )
    `);

    // Migration: remove legacy enabled column if it still exists
    try {
        let tableInfo = db.prepare(`PRAGMA table_info(sub_groups)`).all();
        const hasEnabledColumn = tableInfo.some(col => col.name === 'enabled');

        if (hasEnabledColumn) {
            console.log('Migrating sub_groups table: removing enabled column');
            db.exec('PRAGMA foreign_keys=OFF');
            db.exec('BEGIN TRANSACTION');
            try {
                db.exec(`
                    CREATE TABLE sub_groups_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL UNIQUE,
                        anidbID INTEGER,
                        default_enabled INTEGER NOT NULL DEFAULT 0
                    )
                `);
                db.exec(`
                    INSERT INTO sub_groups_new (id, name, anidbID, default_enabled)
                    SELECT id, name, anidbID, 0
                    FROM sub_groups
                `);
                db.exec('DROP TABLE sub_groups');
                db.exec('ALTER TABLE sub_groups_new RENAME TO sub_groups');
                db.exec('COMMIT');
            } catch (migrationError) {
                db.exec('ROLLBACK');
                throw migrationError;
            } finally {
                db.exec('PRAGMA foreign_keys=ON');
            }

            tableInfo = db.prepare(`PRAGMA table_info(sub_groups)`).all();
        }

        const hasDefaultEnabledColumn = tableInfo.some(col => col.name === 'default_enabled');

        if (!hasDefaultEnabledColumn) {
            db.exec(`ALTER TABLE sub_groups ADD COLUMN default_enabled INTEGER NOT NULL DEFAULT 0`);
        }
    } catch (error) {
        console.warn('Migration warning (sub_groups table):', error.message);
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS anime_sub_groups (
            anime_id INTEGER NOT NULL,
            sub_group_id INTEGER NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (anime_id, sub_group_id),
            FOREIGN KEY (anime_id) REFERENCES anime(id) ON DELETE CASCADE,
            FOREIGN KEY (sub_group_id) REFERENCES sub_groups(id) ON DELETE CASCADE
        )
    `);

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
        CREATE INDEX IF NOT EXISTS idx_anime_sub_groups_anime_id
        ON anime_sub_groups(anime_id)
    `);

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_anime_sub_groups_sub_group_id
        ON anime_sub_groups(sub_group_id)
    `);

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_status 
        ON tasks(status)
    `);

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_anime_id 
        ON tasks(anime_id)
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
    
    // Create file_torrent_download table to track downloaded files
    db.exec(`
        CREATE TABLE IF NOT EXISTS file_torrent_download (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            torrent_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            scanned_at INTEGER NOT NULL,
            FOREIGN KEY (torrent_id) REFERENCES torrents(id) ON DELETE CASCADE,
            UNIQUE(torrent_id, file_path)
        )
    `);
    
    // Create indexes for file_torrent_download
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_file_torrent_download_torrent_id 
        ON file_torrent_download(torrent_id)
    `);
    
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_file_torrent_download_file_path 
        ON file_torrent_download(file_path)
    `);
    
    // Create configuration table (single row table for app settings)
    db.exec(`
        CREATE TABLE IF NOT EXISTS configuration (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            anime_location TEXT,
            enable_automatic_anime_folder_classification INTEGER NOT NULL DEFAULT 0
        )
    `);
    
    // Migration: Add max_download_speed and max_upload_speed columns if they don't exist
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(configuration)`).all();
        const hasMaxDownloadSpeed = tableInfo.some(col => col.name === 'max_download_speed');
        const hasMaxUploadSpeed = tableInfo.some(col => col.name === 'max_upload_speed');
        
        if (!hasMaxDownloadSpeed) {
            db.exec(`ALTER TABLE configuration ADD COLUMN max_download_speed INTEGER`);
        }
        if (!hasMaxUploadSpeed) {
            db.exec(`ALTER TABLE configuration ADD COLUMN max_upload_speed INTEGER`);
        }
    } catch (error) {
        console.warn('Migration warning (configuration table speed limits):', error.message);
    }
    
    // Migration: Add setup column if it doesn't exist
    try {
        const tableInfo = db.prepare(`PRAGMA table_info(configuration)`).all();
        const hasSetup = tableInfo.some(col => col.name === 'setup');
        
        if (!hasSetup) {
            db.exec(`ALTER TABLE configuration ADD COLUMN setup INTEGER NOT NULL DEFAULT 1`);
        }
    } catch (error) {
        console.warn('Migration warning (configuration table setup):', error.message);
    }
    
    // Initialize configuration with default values if it doesn't exist
    const configExists = db.prepare(`SELECT id FROM configuration WHERE id = 1`).get();
    if (!configExists) {
        db.exec(`
            INSERT INTO configuration (
                id,
                anime_location,
                enable_automatic_anime_folder_classification,
                max_download_speed,
                max_upload_speed,
                setup
            ) VALUES (1, NULL, 0, NULL, NULL, 1)
        `);
    }
    
    // Create scheduled_jobs table
    db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            job_type TEXT NOT NULL,
            cron_schedule TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            job_config TEXT,
            last_run INTEGER,
            next_run INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `);
    
    // Create index for enabled jobs
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled 
        ON scheduled_jobs(enabled)
    `);
    
    // Create index for next_run
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run 
        ON scheduled_jobs(next_run)
    `);
    

    // Backfill anime_sub_groups relationships for existing torrents
    db.exec(`
        INSERT OR IGNORE INTO anime_sub_groups (anime_id, sub_group_id, enabled)
        SELECT DISTINCT e.anime_id,
                        t.sub_group_id,
                        COALESCE(sg.default_enabled, 0)
        FROM torrents t
        INNER JOIN episodes e ON t.episode_id = e.id
        LEFT JOIN sub_groups sg ON sg.id = t.sub_group_id
        WHERE t.sub_group_id IS NOT NULL
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
    
    // Get episodes with subgroup torrents (for display)
    const episodesQuery = database.prepare(`
        SELECT e.*, t.id as torrent_id, t.title as torrent_title,
               t.link as torrent_link,
               t.date as torrent_date, t.episode_number as torrent_episode_number,
               sg.name as sub_group_name,
               asg.enabled as sub_group_enabled
        FROM episodes e
        LEFT JOIN torrents t ON e.id = t.episode_id
        LEFT JOIN sub_groups sg ON t.sub_group_id = sg.id
        LEFT JOIN anime_sub_groups asg ON asg.anime_id = e.anime_id AND asg.sub_group_id = t.sub_group_id
        WHERE e.anime_id IN (SELECT id FROM anime WHERE quarter = ? AND year = ?)
          AND t.id IS NOT NULL
          AND (t.sub_group_id IS NULL OR asg.enabled = 1)
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
        WHERE e.anime_id IN (SELECT id FROM anime WHERE quarter = ? AND year = ?)
          AND (t.sub_group_id IS NULL OR EXISTS (
              SELECT 1
              FROM anime_sub_groups asg
              WHERE asg.anime_id = e.anime_id
                AND asg.sub_group_id = t.sub_group_id
                AND asg.enabled = 1
          ))
          AND e.episode_number = (
              SELECT MAX(e2.episode_number)
              FROM episodes e2
              INNER JOIN torrents t2 ON e2.id = t2.episode_id
              WHERE e2.anime_id = e.anime_id
                AND (t2.sub_group_id IS NULL OR EXISTS (
                    SELECT 1
                    FROM anime_sub_groups asg2
                    WHERE asg2.anime_id = e2.anime_id
                      AND asg2.sub_group_id = t2.sub_group_id
                      AND asg2.enabled = 1
                ))
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
            season: anime.season || 1,
            autodownload: Boolean(anime.autodownload || 0)
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
 * Stores alternative titles for an anime
 * @param {number} animeId - Anime ID
 * @param {Array<string>} titles - Array of alternative titles to store
 */
export function storeAlternativeTitles(animeId, titles) {
    const database = getDB();
    const insertStmt = database.prepare(`
        INSERT OR IGNORE INTO alternative_titles (anime_id, title)
        VALUES (?, ?)
    `);
    
    for (const title of titles) {
        if (title && title.trim()) {
            insertStmt.run(animeId, title.trim());
        }
    }
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
        const createSubGroupStmt = database.prepare(`INSERT INTO sub_groups (name) VALUES (?)`);
        
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
        
        const ensureAnimeSubGroupStmt = database.prepare(`
            INSERT OR IGNORE INTO anime_sub_groups (anime_id, sub_group_id, enabled)
            VALUES (?, ?, COALESCE((SELECT default_enabled FROM sub_groups WHERE id = ?), 0))
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

                if (subGroupId) {
                    ensureAnimeSubGroupStmt.run(animeId, subGroupId, subGroupId);
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
    
    // Get torrents with subgroups
    const torrentsQuery = database.prepare(`
        SELECT t.id as torrent_id, t.title as torrent_title,
               t.link as torrent_link,
               t.date as torrent_date, t.episode_number as torrent_episode_number,
               t.episode_id,
               sg.name as sub_group_name
        FROM torrents t
        INNER JOIN episodes e ON t.episode_id = e.id
        LEFT JOIN sub_groups sg ON t.sub_group_id = sg.id
        LEFT JOIN anime_sub_groups asg ON asg.anime_id = e.anime_id AND asg.sub_group_id = t.sub_group_id
        WHERE e.anime_id = ?
          AND (asg.enabled = 1)
        ORDER BY t.episode_id, t.date DESC
    `);
    
    const torrentRecords = torrentsQuery.all(animeId);

    const animeSubGroups = getAnimeSubGroups(animeId);
    
    // Group torrents by episode_id
    const torrentsByEpisodeId = {};
    torrentRecords.forEach(tr => {
        if (!torrentsByEpisodeId[tr.episode_id]) {
            torrentsByEpisodeId[tr.episode_id] = [];
        }
        torrentsByEpisodeId[tr.episode_id].push({
            id: tr.torrent_id,
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
        season: animeRecord.season || 1,
        subGroups: animeSubGroups,
        autodownload: Boolean(animeRecord.autodownload || 0)
    };
    
    return animeObj;
}


/**
 * Retrieves the season value for an anime using its AniDB ID
 * @param {number} anidbID - AniDB identifier associated with the anime
 * @returns {number|null} Season number if found, otherwise null
 */
export function getAnimeSeasonByAnidbId(anidbID) {
    if (!anidbID) {
        return null;
    }

    const database = getDB();
    const query = database.prepare(`
        SELECT season
        FROM anime
        WHERE anidbID = ?
        LIMIT 1
    `);

    const result = query.get(anidbID);

    if (!result) {
        return null;
    }

    return result.season ?? null;
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
        const createSubGroupStmt = database.prepare(`INSERT INTO sub_groups (name) VALUES (?)`);
    
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
 * @returns {Object|null} Subgroup object with id, name, and anidbID, or null if not found
 */
export function getSubGroupByName(subGroupName) {
    if (!subGroupName) return null;
    
    const database = getDB();
    const getSubGroupStmt = database.prepare(`SELECT id, name, anidbID FROM sub_groups WHERE name = ?`);
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

export function updateSubGroupDefaultEnabled(subGroupId, defaultEnabled) {
    if (!subGroupId) {
        throw new Error('Subgroup ID is required');
    }

    const database = getDB();
    const subgroup = database.prepare(`SELECT id FROM sub_groups WHERE id = ?`).get(subGroupId);

    if (!subgroup) {
        throw new Error('Subgroup not found');
    }

    const normalizedDefault = defaultEnabled ? 1 : 0;
    const updateStmt = database.prepare(`UPDATE sub_groups SET default_enabled = ? WHERE id = ?`);
    updateStmt.run(normalizedDefault, subGroupId);

    // When enabling a subgroup, enable it for all animes that have at least one episode with a torrent from that subgroup
    if (defaultEnabled) {
        // Find all animes that have at least one episode with a torrent from this subgroup
        const findAnimesQuery = database.prepare(`
            SELECT DISTINCT e.anime_id
            FROM torrents t
            INNER JOIN episodes e ON t.episode_id = e.id
            WHERE t.sub_group_id = ?
        `);
        
        const animeIds = findAnimesQuery.all(subGroupId).map(row => row.anime_id);
        
        // Enable the subgroup for all those animes
        if (animeIds.length > 0) {
            const enableSubGroupStmt = database.prepare(`
                INSERT INTO anime_sub_groups (anime_id, sub_group_id, enabled)
                VALUES (?, ?, 1)
                ON CONFLICT(anime_id, sub_group_id) DO UPDATE SET enabled = 1
            `);
            
            for (const animeId of animeIds) {
                enableSubGroupStmt.run(animeId, subGroupId);
            }
            
            console.log(`Enabled subgroup ${subGroupId} for ${animeIds.length} anime(s) that have torrents from this subgroup`);
        }
    }

    return {
        subGroupId,
        defaultEnabled: Boolean(normalizedDefault)
    };
}

export function getAnimeSubGroups(animeId) {
    if (!animeId) {
        return [];
    }

    const database = getDB();
    const query = database.prepare(`
        SELECT sg.id, sg.name, sg.anidbID, asg.enabled
        FROM anime_sub_groups asg
        INNER JOIN sub_groups sg ON asg.sub_group_id = sg.id
        WHERE asg.anime_id = ?
        ORDER BY sg.name ASC
    `);

    const rows = query.all(animeId);
    return rows.map(row => ({
        id: row.id,
        name: row.name,
        anidbID: row.anidbID || null,
        enabled: Boolean(row.enabled)
    }));
}

export function setAnimeSubGroupEnabled(animeId, subGroupId, enabled) {
    if (!animeId) {
        throw new Error('Anime ID is required');
    }

    if (!subGroupId) {
        throw new Error('Subgroup ID is required');
    }

    const database = getDB();

    const animeExists = database.prepare(`SELECT id FROM anime WHERE id = ?`).get(animeId);
    if (!animeExists) {
        throw new Error('Anime not found');
    }

    const subGroupExists = database.prepare(`SELECT id FROM sub_groups WHERE id = ?`).get(subGroupId);
    if (!subGroupExists) {
        throw new Error('Subgroup not found');
    }

    const normalizedEnabled = enabled ? 1 : 0;

    const upsertStmt = database.prepare(`
        INSERT INTO anime_sub_groups (anime_id, sub_group_id, enabled)
        VALUES (?, ?, ?)
        ON CONFLICT(anime_id, sub_group_id) DO UPDATE SET enabled = excluded.enabled
    `);

    upsertStmt.run(animeId, subGroupId, normalizedEnabled);

    return {
        animeId,
        subGroupId,
        enabled: Boolean(normalizedEnabled)
    };
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
 * Gets the current configuration
 * @returns {Object} Configuration object with all settings
 */
export function getConfiguration() {
    const database = getDB();
    const query = database.prepare(`
        SELECT 
            anime_location,
            enable_automatic_anime_folder_classification,
            max_download_speed,
            max_upload_speed,
            setup
        FROM configuration
        WHERE id = 1
    `);
    
    const result = query.get();
    
    // Check if animeLocation is set via environment variable
    const animeLocationFromEnv = process.env.animeLocation !== undefined && process.env.animeLocation !== null && process.env.animeLocation !== '';
    const envAnimeLocation = animeLocationFromEnv ? process.env.animeLocation : null;
    
    if (!result) {
        // Return defaults if no config exists
        return {
            animeLocation: envAnimeLocation || null,
            animeLocationFromEnv: animeLocationFromEnv,
            enableAutomaticAnimeFolderClassification: false,
            maxDownloadSpeed: null,
            maxUploadSpeed: null,
            setup: true
        };
    }
    
    return {
        animeLocation: envAnimeLocation || result.anime_location || null,
        animeLocationFromEnv: animeLocationFromEnv,
        enableAutomaticAnimeFolderClassification: Boolean(result.enable_automatic_anime_folder_classification),
        maxDownloadSpeed: result.max_download_speed || null,
        maxUploadSpeed: result.max_upload_speed || null,
        setup: result.setup !== undefined ? Boolean(result.setup) : true
    };
}

/**
 * Gets the actual anime location path to use for file operations
 * When animeLocation comes from an environment variable (Docker), use /app/anime (container path)
 * Otherwise, use the configured path
 * @returns {string|null} The actual path to use for file operations, or null if not configured
 */
export function getAnimeLocationForOperations() {
    const config = getConfiguration();
    
    if (!config.animeLocation) {
        return null;
    }
    
    // If location comes from environment variable (Docker), use container path
    if (config.animeLocationFromEnv) {
        return '/app/anime';
    }
    
    // Otherwise, use the configured path
    return config.animeLocation;
}

/**
 * Saves the configuration
 * @param {Object} config - Configuration object with settings
 * @returns {Object} Saved configuration object
 */
export function saveConfiguration(config) {
    const database = getDB();
    
    // Build dynamic UPDATE statement only for fields that are defined
    const fields = [];
    const values = [];
    
    if (config.animeLocation !== undefined) {
        fields.push('anime_location = ?');
        values.push(config.animeLocation || null);
    }
    
    if (config.enableAutomaticAnimeFolderClassification !== undefined) {
        fields.push('enable_automatic_anime_folder_classification = ?');
        values.push(config.enableAutomaticAnimeFolderClassification ? 1 : 0);
    }
    
    if (config.maxDownloadSpeed !== undefined) {
        fields.push('max_download_speed = ?');
        values.push(config.maxDownloadSpeed !== null ? config.maxDownloadSpeed : null);
    }
    
    if (config.maxUploadSpeed !== undefined) {
        fields.push('max_upload_speed = ?');
        values.push(config.maxUploadSpeed !== null ? config.maxUploadSpeed : null);
    }
    
    if (config.setup !== undefined) {
        fields.push('setup = ?');
        values.push(config.setup ? 1 : 0);
    }
    
    if (fields.length === 0) {
        // No fields to update, just return current config
        return getConfiguration();
    }
    
    const updateStmt = database.prepare(`
        UPDATE configuration SET
            ${fields.join(', ')}
        WHERE id = 1
    `);
    
    updateStmt.run(...values);
    
    return getConfiguration();
}

/**
 * Inserts or updates a file_torrent_download record
 * Updates existing record if same file_path or same torrent_id exists
 * @param {number} torrentId - Torrent ID
 * @param {string} filePath - Full file path
 * @param {string} fileName - File name
 */
export function upsertFileTorrentDownload(torrentId, filePath, fileName) {
    const database = getDB();
    const scannedAt = Date.now();
    
    // Check if record exists with the same file_path
    const findByFilePathStmt = database.prepare(`
        SELECT id FROM file_torrent_download WHERE file_path = ?
    `);
    const existingByFilePath = findByFilePathStmt.get(filePath);
    
    // Check if record exists with the same torrent_id
    const findByTorrentIdStmt = database.prepare(`
        SELECT id FROM file_torrent_download WHERE torrent_id = ?
    `);
    const existingByTorrentId = findByTorrentIdStmt.get(torrentId);
    
    if (existingByFilePath) {
        // Update existing record with same file_path
        const updateStmt = database.prepare(`
            UPDATE file_torrent_download 
            SET torrent_id = ?, file_name = ?, scanned_at = ?
            WHERE id = ?
        `);
        updateStmt.run(torrentId, fileName, scannedAt, existingByFilePath.id);
    } else if (existingByTorrentId) {
        // Update existing record with same torrent_id
        const updateStmt = database.prepare(`
            UPDATE file_torrent_download 
            SET file_path = ?, file_name = ?, scanned_at = ?
            WHERE id = ?
        `);
        updateStmt.run(filePath, fileName, scannedAt, existingByTorrentId.id);
    } else {
        // Insert new record
        const insertStmt = database.prepare(`
            INSERT INTO file_torrent_download (torrent_id, file_path, file_name, scanned_at)
            VALUES (?, ?, ?, ?)
        `);
        insertStmt.run(torrentId, filePath, fileName, scannedAt);
    }
}

/**
 * Gets paginated list of file_torrent_download records with anime and episode info
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Number of records per page
 * @returns {Object} Object with records and total count
 */
export function getFileTorrentDownloads(page = 1, pageSize = 25) {
    const database = getDB();
    const offset = (page - 1) * pageSize;
    
    // Get total count
    const countQuery = database.prepare(`
        SELECT COUNT(*) as total
        FROM file_torrent_download
    `);
    const totalResult = countQuery.get();
    const total = totalResult ? totalResult.total : 0;
    
    // Get paginated records with anime and episode info
    const query = database.prepare(`
        SELECT 
            ftd.id,
            ftd.torrent_id,
            ftd.file_path,
            ftd.file_name,
            ftd.scanned_at,
            t.title as torrent_title,
            t.episode_number,
            e.anime_id,
            a.title_romaji,
            a.title_english,
            a.title_native,
            sg.name as sub_group_name
        FROM file_torrent_download ftd
        INNER JOIN torrents t ON ftd.torrent_id = t.id
        INNER JOIN episodes e ON t.episode_id = e.id
        INNER JOIN anime a ON e.anime_id = a.id
        LEFT JOIN sub_groups sg ON t.sub_group_id = sg.id
        ORDER BY ftd.scanned_at DESC
        LIMIT ? OFFSET ?
    `);
    
    const records = query.all(pageSize, offset);
    
    return {
        records: records.map(row => ({
            id: row.id,
            torrentId: row.torrent_id,
            filePath: row.file_path,
            fileName: row.file_name,
            scannedAt: new Date(row.scanned_at),
            torrentTitle: row.torrent_title,
            episodeNumber: row.episode_number,
            animeId: row.anime_id,
            animeTitle: row.title_romaji || row.title_english || row.title_native || `Anime ${row.anime_id}`,
            subGroupName: row.sub_group_name || null
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
}

/**
 * Clears all file_torrent_download records
 */
export function clearFileTorrentDownloads() {
    const database = getDB();
    database.exec(`DELETE FROM file_torrent_download`);
}

/**
 * Gets set of downloaded torrent IDs for an anime
 * @param {number} animeId - Anime ID
 * @returns {Set<number>} Set of torrent IDs that have been downloaded
 */
export function getDownloadedTorrentIdsForAnime(animeId) {
    const database = getDB();
    const query = database.prepare(`
        SELECT DISTINCT ftd.torrent_id
        FROM file_torrent_download ftd
        INNER JOIN torrents t ON ftd.torrent_id = t.id
        INNER JOIN episodes e ON t.episode_id = e.id
        WHERE e.anime_id = ?
    `);
    
    const results = query.all(animeId);
    return new Set(results.map(row => row.torrent_id));
}

/**
 * Toggles the autodownload setting for an anime
 * @param {number} animeId - Anime ID
 * @param {boolean} autodownload - Whether autodownload should be enabled
 * @returns {Object} Updated anime autodownload setting
 */
export async function setAnimeAutodownload(animeId, autodownload) {
    if (!animeId) {
        throw new Error('Anime ID is required');
    }

    const database = getDB();

    const animeExists = database.prepare(`SELECT id FROM anime WHERE id = ?`).get(animeId);
    if (!animeExists) {
        throw new Error('Anime not found');
    }

    const normalizedAutodownload = autodownload ? 1 : 0;

    const updateStmt = database.prepare(`UPDATE anime SET autodownload = ? WHERE id = ?`);
    updateStmt.run(normalizedAutodownload, animeId);

    // If enabling autodownload, check if required scheduled jobs exist and create them if not
    if (autodownload) {
        const allJobs = getAllScheduledJobs();
        const hasScanJob = allJobs.some(job => job.jobType === 'SCAN_AUTODOWNLOAD');
        const hasQueueJob = allJobs.some(job => job.jobType === 'QUEUE_AUTODOWNLOAD');

        let jobsCreated = false;

        // Import services only if needed
        if (!hasScanJob || !hasQueueJob) {
            const { calculateNextRun, reloadScheduledJobs } = await import('../services/scheduledJobsService.js');

            if (!hasScanJob) {
                const nextRun = calculateNextRun('0 */8 * * *');
                
                createScheduledJob({
                    name: 'Default - Scan Auto-Download',
                    jobType: 'SCAN_AUTODOWNLOAD',
                    cronSchedule: '0 */8 * * *',
                    jobConfig: null,
                    nextRun: nextRun
                });
                console.log('Created default scheduled job: Scan Auto-Download (0 */8 * * *)');
                jobsCreated = true;
            }

            if (!hasQueueJob) {
                const nextRun = calculateNextRun('0 */2 * * *');
                
                createScheduledJob({
                    name: 'Default - Queue Auto-Download',
                    jobType: 'QUEUE_AUTODOWNLOAD',
                    cronSchedule: '0 */2 * * *',
                    jobConfig: null,
                    nextRun: nextRun
                });
                console.log('Created default scheduled job: Queue Auto-Download (0 */2 * * *)');
                jobsCreated = true;
            }

            // Reload scheduled jobs if any were created
            if (jobsCreated) {
                reloadScheduledJobs();
            }
        }
    }

    return {
        animeId,
        autodownload: Boolean(normalizedAutodownload)
    };
}

/**
 * Gets all animes with autodownload enabled
 * Returns anime name, episodes tracked/total, and next episode airing date
 * Only shows next episode if previous episodes are tracked
 * @returns {Array} Array of anime objects with autodownload info
 */
export function getAutodownloadAnimes() {
    const database = getDB();
    
    // Get all animes with autodownload enabled
    const animeQuery = database.prepare(`
        SELECT 
            a.id,
            a.title_romaji,
            a.title_english,
            a.title_native
        FROM anime a
        WHERE a.autodownload = 1
        ORDER BY a.title_romaji ASC, a.title_english ASC
    `);
    
    const animeRecords = animeQuery.all();
    
    // For each anime, get episode counts and next airing date
    const getTotalEpisodesStmt = database.prepare(`
        SELECT COUNT(*) as total
        FROM episodes
        WHERE anime_id = ?
    `);
    
    const getTrackedEpisodesStmt = database.prepare(`
        SELECT COUNT(DISTINCT e.episode_number) as tracked
        FROM episodes e
        INNER JOIN torrents t ON e.id = t.episode_id
        LEFT JOIN anime_sub_groups asg ON asg.anime_id = e.anime_id AND asg.sub_group_id = t.sub_group_id
        WHERE e.anime_id = ?
          AND (t.sub_group_id IS NULL OR asg.enabled = 1)
    `);
    
    // Get the highest tracked episode number
    const getHighestTrackedEpisodeStmt = database.prepare(`
        SELECT MAX(e.episode_number) as max_episode
        FROM episodes e
        INNER JOIN torrents t ON e.id = t.episode_id
        LEFT JOIN anime_sub_groups asg ON asg.anime_id = e.anime_id AND asg.sub_group_id = t.sub_group_id
        WHERE e.anime_id = ?
          AND (t.sub_group_id IS NULL OR asg.enabled = 1)
    `);
    
    // Get all episodes that should have aired but haven't been tracked
    const getMissingEpisodesStmt = database.prepare(`
        SELECT e.episode_number, e.airingAt
        FROM episodes e
        WHERE e.anime_id = ?
          AND e.airingAt <= ?
          AND NOT EXISTS (
              SELECT 1
              FROM torrents t
              INNER JOIN episodes e2 ON t.episode_id = e2.id
              LEFT JOIN anime_sub_groups asg ON asg.anime_id = e2.anime_id AND asg.sub_group_id = t.sub_group_id
              WHERE e2.anime_id = e.anime_id
                AND e2.episode_number = e.episode_number
                AND (t.sub_group_id IS NULL OR asg.enabled = 1)
          )
        ORDER BY e.episode_number ASC
        LIMIT 1
    `);
    
    // Get next future episode (only if all previous are tracked)
    // Ignore episodes that already have a tracked torrent
    const getNextEpisodeStmt = database.prepare(`
        SELECT e.episode_number, e.airingAt
        FROM episodes e
        WHERE e.anime_id = ?
          AND e.airingAt > ?
          AND NOT EXISTS (
              SELECT 1
              FROM torrents t
              INNER JOIN episodes e2 ON t.episode_id = e2.id
              LEFT JOIN anime_sub_groups asg ON asg.anime_id = e2.anime_id AND asg.sub_group_id = t.sub_group_id
              WHERE e2.anime_id = e.anime_id
                AND e2.episode_number = e.episode_number
                AND (t.sub_group_id IS NULL OR asg.enabled = 1)
          )
        ORDER BY e.airingAt ASC
        LIMIT 1
    `);
    
    const now = Date.now();
    
    return animeRecords.map(anime => {
        const totalResult = getTotalEpisodesStmt.get(anime.id);
        const totalEpisodes = totalResult ? totalResult.total : 0;
        
        const trackedResult = getTrackedEpisodesStmt.get(anime.id);
        const episodesTracked = trackedResult ? trackedResult.tracked : 0;
        
        // Check for missing episodes (should have aired but not tracked)
        const missingEpisodeResult = getMissingEpisodesStmt.get(anime.id, now);
        
        if (missingEpisodeResult) {
            // There's a missing episode - return it
            const missingAiringAt = new Date(missingEpisodeResult.airingAt);
            return {
                id: anime.id,
                title: anime.title_english || anime.title_romaji || anime.title_native || 'Unknown',
                episodesTracked: episodesTracked,
                totalEpisodes: totalEpisodes,
                nextEpisodeAiringAt: missingAiringAt,
                nextEpisodeNumber: missingEpisodeResult.episode_number,
                isMissing: true
            };
        }
        
        // No missing episodes - check if we can show the next episode
        // Get the highest tracked episode number
        const highestTrackedResult = getHighestTrackedEpisodeStmt.get(anime.id);
        const highestTrackedEpisode = highestTrackedResult ? highestTrackedResult.max_episode : null;
        
        // Get the next episode
        const nextEpisodeResult = getNextEpisodeStmt.get(anime.id, now);

        console.log('show next episode for anime ', anime.title_english || anime.title_romaji || anime.title_native || 'Unknown', nextEpisodeResult);
        console.log('highestTrackedEpisode', highestTrackedEpisode);
        console.log('nextEpisodeResult', nextEpisodeResult);
        console.log('episodesTracked', episodesTracked);
        console.log('totalEpisodes', totalEpisodes);
        
        if (nextEpisodeResult) {
            const nextEpisodeNumber = nextEpisodeResult.episode_number;
            const nextAiringAt = new Date(nextEpisodeResult.airingAt);
            
            // Only show next episode if it's the immediate next one (previous episode is tracked)
            // If no episodes are tracked yet, only show episode 1
            if (highestTrackedEpisode === null) {
                // No episodes tracked - only show episode 1
                if (nextEpisodeNumber === 1) {
                    return {
                        id: anime.id,
                        title: anime.title_english || anime.title_romaji || anime.title_native || 'Unknown',
                        episodesTracked: episodesTracked,
                        totalEpisodes: totalEpisodes,
                        nextEpisodeAiringAt: nextAiringAt,
                        nextEpisodeNumber: nextEpisodeNumber,
                        isMissing: false
                    };
                }
            } else if (nextEpisodeNumber === highestTrackedEpisode + 1) {
                // Next episode is the immediate next one
                return {
                    id: anime.id,
                    title: anime.title_english || anime.title_romaji || anime.title_native || 'Unknown',
                    episodesTracked: episodesTracked,
                    totalEpisodes: totalEpisodes,
                    nextEpisodeAiringAt: nextAiringAt,
                    nextEpisodeNumber: nextEpisodeNumber,
                    isMissing: false
                };
            }
        }
        
        // No valid next episode to show
        return {
            id: anime.id,
            title: anime.title_english || anime.title_romaji || anime.title_native || 'Unknown',
            episodesTracked: episodesTracked,
            totalEpisodes: totalEpisodes,
            nextEpisodeAiringAt: null,
            nextEpisodeNumber: null,
            isMissing: false
        };
    });
}

/**
 * Gets all scheduled jobs
 * @returns {Array} Array of scheduled job objects
 */
export function getAllScheduledJobs() {
    const database = getDB();
    const query = database.prepare(`
        SELECT * FROM scheduled_jobs
        ORDER BY created_at DESC
    `);
    
    const rows = query.all();
    return rows.map(row => ({
        id: row.id,
        name: row.name,
        jobType: row.job_type,
        cronSchedule: row.cron_schedule,
        enabled: Boolean(row.enabled),
        jobConfig: row.job_config ? JSON.parse(row.job_config) : null,
        lastRun: row.last_run ? new Date(row.last_run) : null,
        nextRun: row.next_run ? new Date(row.next_run) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
    }));
}

/**
 * Gets a scheduled job by ID
 * @param {number} id - Job ID
 * @returns {Object|null} Scheduled job object or null
 */
export function getScheduledJobById(id) {
    if (!id) {
        return null;
    }
    
    const database = getDB();
    const query = database.prepare(`
        SELECT * FROM scheduled_jobs WHERE id = ?
    `);
    
    const row = query.get(id);
    if (!row) {
        return null;
    }
    
    return {
        id: row.id,
        name: row.name,
        jobType: row.job_type,
        cronSchedule: row.cron_schedule,
        enabled: Boolean(row.enabled),
        jobConfig: row.job_config ? JSON.parse(row.job_config) : null,
        lastRun: row.last_run ? new Date(row.last_run) : null,
        nextRun: row.next_run ? new Date(row.next_run) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
    };
}

/**
 * Creates a new scheduled job
 * @param {Object} job - Job object with name, jobType, cronSchedule, jobConfig
 * @returns {Object} Created job object
 */
export function createScheduledJob({ name, jobType, cronSchedule, jobConfig = null, nextRun = null }) {
    if (!name || !jobType || !cronSchedule) {
        throw new Error('name, jobType, and cronSchedule are required');
    }
    
    const database = getDB();
    const now = Date.now();
    const jobConfigSerialized = jobConfig ? JSON.stringify(jobConfig) : null;
    
    // Calculate next run time if not provided
    const nextRunTimestamp = nextRun || null;
    
    const insertStmt = database.prepare(`
        INSERT INTO scheduled_jobs (
            name, job_type, cron_schedule, enabled, job_config,
            last_run, next_run, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `);
    
    insertStmt.run(name, jobType, cronSchedule, 1, jobConfigSerialized, nextRunTimestamp, now, now);
    
    const id = insertStmt.lastInsertRowid;
    return getScheduledJobById(id);
}

/**
 * Updates a scheduled job
 * @param {number} id - Job ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated job object
 */
export function updateScheduledJob(id, { name, jobType, cronSchedule, enabled, jobConfig } = {}) {
    if (!id) {
        throw new Error('Job ID is required');
    }
    
    const database = getDB();
    const existing = getScheduledJobById(id);
    if (!existing) {
        throw new Error('Job not found');
    }
    
    const updates = [];
    const values = [];
    
    if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
    }
    
    if (jobType !== undefined) {
        updates.push('job_type = ?');
        values.push(jobType);
    }
    
    if (cronSchedule !== undefined) {
        updates.push('cron_schedule = ?');
        values.push(cronSchedule);
    }
    
    if (enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(enabled ? 1 : 0);
    }
    
    if (jobConfig !== undefined) {
        updates.push('job_config = ?');
        values.push(jobConfig ? JSON.stringify(jobConfig) : null);
    }
    
    if (updates.length === 0) {
        return existing;
    }
    
    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    
    const updateStmt = database.prepare(`
        UPDATE scheduled_jobs
        SET ${updates.join(', ')}
        WHERE id = ?
    `);
    
    updateStmt.run(...values);
    
    return getScheduledJobById(id);
}

/**
 * Deletes a scheduled job
 * @param {number} id - Job ID
 * @returns {boolean} True if deleted
 */
export function deleteScheduledJob(id) {
    if (!id) {
        throw new Error('Job ID is required');
    }
    
    const database = getDB();
    const deleteStmt = database.prepare(`
        DELETE FROM scheduled_jobs WHERE id = ?
    `);
    
    const result = deleteStmt.run(id);
    return result.changes > 0;
}

/**
 * Gets all enabled scheduled jobs
 * @returns {Array} Array of enabled scheduled job objects
 */
export function getEnabledScheduledJobs() {
    const database = getDB();
    const query = database.prepare(`
        SELECT * FROM scheduled_jobs
        WHERE enabled = 1
        ORDER BY next_run ASC
    `);
    
    const rows = query.all();
    return rows.map(row => ({
        id: row.id,
        name: row.name,
        jobType: row.job_type,
        cronSchedule: row.cron_schedule,
        enabled: Boolean(row.enabled),
        jobConfig: row.job_config ? JSON.parse(row.job_config) : null,
        lastRun: row.last_run ? new Date(row.last_run) : null,
        nextRun: row.next_run ? new Date(row.next_run) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
    }));
}

/**
 * Updates the last_run and next_run timestamps for a scheduled job
 * @param {number} id - Job ID
 * @param {number} nextRunTimestamp - Next run timestamp
 */
export function updateScheduledJobRunTime(id, nextRunTimestamp) {
    if (!id) {
        throw new Error('Job ID is required');
    }
    
    const database = getDB();
    const now = Date.now();
    
    const updateStmt = database.prepare(`
        UPDATE scheduled_jobs
        SET last_run = ?, next_run = ?, updated_at = ?
        WHERE id = ?
    `);
    
    updateStmt.run(now, nextRunTimestamp, now, id);
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

