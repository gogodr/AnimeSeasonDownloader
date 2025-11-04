import express from 'express';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getUpcomingAnime, scanAnimeTorrents } from './services/animeService.js';
import { getCachedAnime, getDB, getAnimeById } from './database/animeDB.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

/**
 * Determines current season based on date
 * @returns {string} Current season
 */
function getCurrentSeason() {
    const today = new Date();
    const month = today.getMonth();
    if (month < 2) return "WINTER";
    if (month < 5) return "SPRING";
    if (month < 8) return "SUMMER";
    return "FALL";
}

/**
 * Updates anime data for the current season
 * @param {boolean} forceRefresh - If true, forces refresh even if cache is valid
 */
async function updateAnimeData(forceRefresh = false) {
    try {
        const today = new Date();
        const season = getCurrentSeason();
        const year = today.getFullYear();
        
        console.log(`Updating anime data for ${season} ${year}...`);
        await getUpcomingAnime(season, year, forceRefresh);
        console.log(`Successfully updated anime data for ${season} ${year}`);
    } catch (error) {
        console.error('Error updating anime data:', error);
    }
}

// Update anime data on startup
updateAnimeData(false).then(() => {
    console.log('Startup anime data update completed');
}).catch(error => {
    console.error('Startup anime data update failed:', error);
});

// Schedule daily update at midnight (00:00)
cron.schedule('0 0 * * *', () => {
    console.log('Running scheduled daily anime data update...');
    updateAnimeData(false);
}, {
    scheduled: true,
    timezone: 'UTC'
});

console.log('Daily cron job scheduled to run at 00:00 UTC');

// REST API Routes
/**
 * GET /api/season/current-season
 * Returns anime from the current season (from database)
 */
app.get('/api/season/current-season', async (req, res) => {
    try {
        const today = new Date();
        const season = getCurrentSeason();
        const year = today.getFullYear();
        
        const anime = getCachedAnime(season, year);
        if (!anime || anime.length === 0) {
            return res.status(404).json({ error: 'No anime data found for current season' });
        }
        res.json(anime);
    } catch (error) {
        console.error('Error fetching current season anime:', error);
        res.status(500).json({ error: 'Failed to fetch anime data' });
    }
});

/**
 * GET /api/season/:season/:year
 * Returns anime for a specific season and year (from database)
 */
app.get('/api/season/:season/:year', async (req, res) => {
    try {
        const { season, year } = req.params;
        const yearNum = parseInt(year, 10);
        
        if (isNaN(yearNum)) {
            return res.status(400).json({ error: 'Invalid year' });
        }
        
        const validSeasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
        if (!validSeasons.includes(season.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid season' });
        }
        
        const anime = getCachedAnime(season.toUpperCase(), yearNum);
        if (!anime || anime.length === 0) {
            return res.status(404).json({ error: 'No anime data found for the specified season and year' });
        }
        res.json(anime);
    } catch (error) {
        console.error('Error fetching anime:', error);
        res.status(500).json({ error: 'Failed to fetch anime data' });
    }
});

/**
 * GET /api/anime/id/:id
 * Returns a specific anime by ID (from database) with all episodes and torrents
 */
app.get('/api/anime/id/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const animeId = parseInt(id);
        
        if (isNaN(animeId)) {
            return res.status(400).json({ error: 'Invalid anime ID' });
        }
        
        const anime = getAnimeById(animeId);
        
        if (!anime) {
            return res.status(404).json({ error: 'Anime not found' });
        }
        
        res.json(anime);
    } catch (error) {
        console.error('Error fetching anime:', error);
        res.status(500).json({ error: 'Failed to fetch anime data' });
    }
});

/**
 * POST /api/anime/:id/scan-torrents
 * Scans and updates torrents for a specific anime
 */
app.post('/api/anime/:id/scan-torrents', async (req, res) => {
    try {
        const { id } = req.params;
        const animeId = parseInt(id);
        
        if (isNaN(animeId)) {
            return res.status(400).json({ error: 'Invalid anime ID' });
        }
        
        // Check if anime exists
        const anime = getAnimeById(animeId);
        if (!anime) {
            return res.status(404).json({ error: 'Anime not found' });
        }
        
        console.log(`Admin: Scanning torrents for anime ID ${animeId}...`);
        
        const result = await scanAnimeTorrents(animeId);
        
        res.json({ 
            success: true, 
            message: result.message,
            torrentsFound: result.torrentsFound
        });
    } catch (error) {
        console.error('Error scanning torrents:', error);
        res.status(500).json({ error: error.message || 'Failed to scan torrents' });
    }
});

/**
 * GET /api/admin/seasons
 * Returns all seasons with their last update times
 */
app.get('/api/admin/seasons', async (req, res) => {
    try {
        const database = getDB();
        const query = database.prepare(`
            SELECT season, year, lastFetched
            FROM queries
            ORDER BY year DESC, 
                     CASE season
                         WHEN 'WINTER' THEN 1
                         WHEN 'SPRING' THEN 2
                         WHEN 'SUMMER' THEN 3
                         WHEN 'FALL' THEN 4
                     END DESC
        `);
        
        const results = query.all();
        const seasons = results.map(row => ({
            season: row.season,
            year: row.year,
            lastFetched: row.lastFetched ? new Date(row.lastFetched).toISOString() : null
        }));
        
        res.json(seasons);
    } catch (error) {
        console.error('Error fetching seasons:', error);
        res.status(500).json({ error: 'Failed to fetch seasons data' });
    }
});

/**
 * POST /api/admin/update-season
 * Updates/refreshes anime data for a specific season and year
 * Body: { season: string, year: number }
 */
app.post('/api/admin/update-season', express.json(), async (req, res) => {
    try {
        const { season, year } = req.body;
        
        if (!season || !year) {
            return res.status(400).json({ error: 'Season and year are required' });
        }
        
        const validSeasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
        if (!validSeasons.includes(season.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid season' });
        }
        
        const yearNum = parseInt(year, 10);
        if (isNaN(yearNum)) {
            return res.status(400).json({ error: 'Invalid year' });
        }
        
        console.log(`Admin: Force updating anime data for ${season} ${yearNum}...`);
        
        // Use forceRefresh to bypass cache and fetch fresh data
        await getUpcomingAnime(season.toUpperCase(), yearNum, true);
        
        res.json({ 
            success: true, 
            message: `Successfully updated anime data for ${season} ${yearNum}` 
        });
    } catch (error) {
        console.error('Error updating season:', error);
        res.status(500).json({ error: 'Failed to update anime data' });
    }
});

/**
 * GET /api/admin/subgroups
 * Returns all subgroups with their enabled status
 */
app.get('/api/admin/subgroups', async (req, res) => {
    try {
        const database = getDB();
        const query = database.prepare(`
            SELECT id, name, enabled
            FROM sub_groups
            ORDER BY name ASC
        `);
        
        const results = query.all();
        const subgroups = results.map(row => ({
            id: row.id,
            name: row.name,
            enabled: Boolean(row.enabled)
        }));
        
        res.json(subgroups);
    } catch (error) {
        console.error('Error fetching subgroups:', error);
        res.status(500).json({ error: 'Failed to fetch subgroups data' });
    }
});

/**
 * GET /api/admin/anime/search
 * Searches anime by title for autocomplete
 * Query params: q (search query)
 */
app.get('/api/admin/anime/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.trim().length < 1) {
            return res.json([]);
        }
        
        const database = getDB();
        const searchQuery = `%${q.trim()}%`;
        const query = database.prepare(`
            SELECT DISTINCT id, title_romaji, title_english, title_native
            FROM anime
            WHERE title_romaji LIKE ? 
               OR title_english LIKE ?
               OR title_native LIKE ?
            ORDER BY title_romaji ASC
            LIMIT 20
        `);
        
        const results = query.all(searchQuery, searchQuery, searchQuery);
        const animeList = results.map(row => ({
            id: row.id,
            title: row.title_romaji || row.title_english || row.title_native || `Anime ${row.id}`,
            titleRomaji: row.title_romaji,
            titleEnglish: row.title_english,
            titleNative: row.title_native
        }));
        
        res.json(animeList);
    } catch (error) {
        console.error('Error searching anime:', error);
        res.status(500).json({ error: 'Failed to search anime' });
    }
});

/**
 * GET /api/admin/alternative-titles/all
 * Returns all anime with their alternative titles grouped together
 */
app.get('/api/admin/alternative-titles/all', async (req, res) => {
    try {
        const database = getDB();
        
        // Get all anime that have alternative titles, along with their alternative titles
        const query = database.prepare(`
            SELECT 
                a.id as anime_id,
                a.title_romaji,
                a.title_english,
                a.title_native,
                at.id as alt_title_id,
                at.title as alt_title
            FROM anime a
            INNER JOIN alternative_titles at ON a.id = at.anime_id
            ORDER BY a.title_romaji ASC, at.title ASC
        `);
        
        const results = query.all();
        
        // Group by anime
        const animeMap = {};
        results.forEach(row => {
            const animeId = row.anime_id;
            if (!animeMap[animeId]) {
                animeMap[animeId] = {
                    id: animeId,
                    title: row.title_romaji || row.title_english || row.title_native || `Anime ${animeId}`,
                    titleRomaji: row.title_romaji,
                    titleEnglish: row.title_english,
                    titleNative: row.title_native,
                    alternativeTitles: []
                };
            }
            
            if (row.alt_title_id) {
                animeMap[animeId].alternativeTitles.push({
                    id: row.alt_title_id,
                    title: row.alt_title
                });
            }
        });
        
        // Convert to array
        const animeList = Object.values(animeMap);
        
        res.json(animeList);
    } catch (error) {
        console.error('Error fetching all alternative titles:', error);
        res.status(500).json({ error: 'Failed to fetch alternative titles' });
    }
});

/**
 * GET /api/admin/alternative-titles/:animeId
 * Returns all alternative titles for a specific anime
 */
app.get('/api/admin/alternative-titles/:animeId', async (req, res) => {
    try {
        const { animeId } = req.params;
        const id = parseInt(animeId, 10);
        
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid anime ID' });
        }
        
        const database = getDB();
        
        // Check if anime exists
        const animeCheck = database.prepare(`SELECT id FROM anime WHERE id = ?`);
        const animeExists = animeCheck.get(id);
        
        if (!animeExists) {
            return res.status(404).json({ error: 'Anime not found' });
        }
        
        const query = database.prepare(`
            SELECT id, anime_id, title
            FROM alternative_titles
            WHERE anime_id = ?
            ORDER BY title ASC
        `);
        
        const results = query.all(id);
        const alternativeTitles = results.map(row => ({
            id: row.id,
            animeId: row.anime_id,
            title: row.title
        }));
        
        res.json(alternativeTitles);
    } catch (error) {
        console.error('Error fetching alternative titles:', error);
        res.status(500).json({ error: 'Failed to fetch alternative titles' });
    }
});

/**
 * POST /api/admin/alternative-titles
 * Adds or updates an alternative title for an anime
 * Body: { animeId: number, title: string, id?: number } (id is optional for updates)
 */
app.post('/api/admin/alternative-titles', express.json(), async (req, res) => {
    try {
        const { animeId, title, id } = req.body;
        
        if (!animeId || !title || !title.trim()) {
            return res.status(400).json({ error: 'Anime ID and title are required' });
        }
        
        const animeIdNum = parseInt(animeId, 10);
        if (isNaN(animeIdNum)) {
            return res.status(400).json({ error: 'Invalid anime ID' });
        }
        
        const titleTrimmed = title.trim();
        if (titleTrimmed.length === 0) {
            return res.status(400).json({ error: 'Title cannot be empty' });
        }
        
        const database = getDB();
        
        // Check if anime exists
        const animeCheck = database.prepare(`SELECT id FROM anime WHERE id = ?`);
        const animeExists = animeCheck.get(animeIdNum);
        
        if (!animeExists) {
            return res.status(404).json({ error: 'Anime not found' });
        }
        
        if (id) {
            // Update existing alternative title
            const updateId = parseInt(id, 10);
            if (isNaN(updateId)) {
                return res.status(400).json({ error: 'Invalid alternative title ID' });
            }
            
            // Check if the alternative title exists and belongs to the anime
            const checkQuery = database.prepare(`
                SELECT id FROM alternative_titles 
                WHERE id = ? AND anime_id = ?
            `);
            const existing = checkQuery.get(updateId, animeIdNum);
            
            if (!existing) {
                return res.status(404).json({ error: 'Alternative title not found' });
            }
            
            // Update the title
            const updateQuery = database.prepare(`
                UPDATE alternative_titles 
                SET title = ? 
                WHERE id = ? AND anime_id = ?
            `);
            
            try {
                updateQuery.run(titleTrimmed, updateId, animeIdNum);
                res.json({ 
                    success: true, 
                    message: 'Alternative title updated successfully',
                    id: updateId,
                    animeId: animeIdNum,
                    title: titleTrimmed
                });
            } catch (error) {
                if (error.message.includes('UNIQUE constraint')) {
                    return res.status(400).json({ error: 'An alternative title with this name already exists for this anime' });
                }
                throw error;
            }
        } else {
            // Insert new alternative title
            const insertQuery = database.prepare(`
                INSERT INTO alternative_titles (anime_id, title)
                VALUES (?, ?)
            `);
            
            try {
                const result = insertQuery.run(animeIdNum, titleTrimmed);
                res.json({ 
                    success: true, 
                    message: 'Alternative title added successfully',
                    id: result.lastInsertRowid,
                    animeId: animeIdNum,
                    title: titleTrimmed
                });
            } catch (error) {
                if (error.message.includes('UNIQUE constraint')) {
                    return res.status(400).json({ error: 'An alternative title with this name already exists for this anime' });
                }
                throw error;
            }
        }
    } catch (error) {
        console.error('Error saving alternative title:', error);
        res.status(500).json({ error: 'Failed to save alternative title' });
    }
});

/**
 * DELETE /api/admin/alternative-titles/:id
 * Deletes an alternative title
 */
app.delete('/api/admin/alternative-titles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const altTitleId = parseInt(id, 10);
        
        if (isNaN(altTitleId)) {
            return res.status(400).json({ error: 'Invalid alternative title ID' });
        }
        
        const database = getDB();
        
        // Check if alternative title exists
        const checkQuery = database.prepare(`SELECT id FROM alternative_titles WHERE id = ?`);
        const existing = checkQuery.get(altTitleId);
        
        if (!existing) {
            return res.status(404).json({ error: 'Alternative title not found' });
        }
        
        // Delete the alternative title
        const deleteQuery = database.prepare(`DELETE FROM alternative_titles WHERE id = ?`);
        deleteQuery.run(altTitleId);
        
        res.json({ 
            success: true, 
            message: 'Alternative title deleted successfully',
            id: altTitleId
        });
    } catch (error) {
        console.error('Error deleting alternative title:', error);
        res.status(500).json({ error: 'Failed to delete alternative title' });
    }
});

/**
 * POST /api/admin/subgroup/toggle
 * Toggles the enabled status of one or multiple subgroups
 * Body: { ids: number[], enabled: boolean } or { id: number, enabled: boolean } (for backward compatibility)
 */
app.post('/api/admin/subgroup/toggle', express.json(), async (req, res) => {
    try {
        const { ids, id, enabled } = req.body;
        
        // Support both single and multiple IDs
        let subgroupIds = [];
        if (ids && Array.isArray(ids)) {
            subgroupIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        } else if (id !== undefined && id !== null) {
            const subgroupId = parseInt(id, 10);
            if (isNaN(subgroupId)) {
                return res.status(400).json({ error: 'Invalid subgroup ID' });
            }
            subgroupIds = [subgroupId];
        }
        
        if (subgroupIds.length === 0) {
            return res.status(400).json({ error: 'At least one subgroup ID is required' });
        }
        
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'Enabled status must be a boolean' });
        }
        
        const database = getDB();
        
        // Check if all subgroups exist
        const placeholders = subgroupIds.map(() => '?').join(',');
        const checkQuery = database.prepare(`SELECT id FROM sub_groups WHERE id IN (${placeholders})`);
        const existing = checkQuery.all(...subgroupIds);
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'No subgroups found' });
        }
        
        if (existing.length !== subgroupIds.length) {
            const foundIds = existing.map(row => row.id);
            const missingIds = subgroupIds.filter(id => !foundIds.includes(id));
            return res.status(404).json({ 
                error: `Some subgroups not found`, 
                missingIds: missingIds 
            });
        }
        
        // Update enabled status for all subgroups
        const updateQuery = database.prepare(`
            UPDATE sub_groups 
            SET enabled = ? 
            WHERE id IN (${placeholders})
        `);
        
        updateQuery.run(enabled ? 1 : 0, ...subgroupIds);
        
        res.json({ 
            success: true, 
            message: `${subgroupIds.length} subgroup(s) ${enabled ? 'enabled' : 'disabled'} successfully`,
            ids: subgroupIds,
            enabled: enabled,
            count: subgroupIds.length
        });
    } catch (error) {
        console.error('Error toggling subgroup:', error);
        res.status(500).json({ error: 'Failed to update subgroup status' });
    }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
