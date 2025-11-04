import express from 'express';
import { getAnimeById } from '../../database/animeDB.js';
import { scanAnimeTorrents } from '../../services/animeService.js';

const router = express.Router();

/**
 * GET /api/anime/id/:id
 * Returns a specific anime by ID (from database) with all episodes and torrents
 */
router.get('/id/:id', async (req, res) => {
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
router.post('/:id/scan-torrents', async (req, res) => {
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

export default router;

