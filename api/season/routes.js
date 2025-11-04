import express from 'express';
import { getCachedAnime } from '../../database/animeDB.js';
import { getCurrentSeason } from '../utils.js';

const router = express.Router();

/**
 * GET /api/season/current-season
 * Returns anime from the current season (from database)
 */
router.get('/current-season', async (req, res) => {
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
router.get('/:season/:year', async (req, res) => {
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

export default router;

