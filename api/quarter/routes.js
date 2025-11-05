import express from 'express';
import { getCachedAnime } from '../../database/animeDB.js';
import { getCurrentQuarter } from '../utils.js';

const router = express.Router();

/**
 * GET /api/quarter/current-quarter
 * Returns anime from the current quarter (from database)
 */
router.get('/current-quarter', async (req, res) => {
    try {
        const today = new Date();
        const quarter = getCurrentQuarter();
        const year = today.getFullYear();
        
        const anime = getCachedAnime(quarter, year);
        if (!anime || anime.length === 0) {
            return res.status(404).json({ error: 'No anime data found for current quarter' });
        }
        res.json(anime);
    } catch (error) {
        console.error('Error fetching current quarter anime:', error);
        res.status(500).json({ error: 'Failed to fetch anime data' });
    }
});

/**
 * GET /api/quarter/:quarter/:year
 * Returns anime for a specific quarter and year (from database)
 */
router.get('/:quarter/:year', async (req, res) => {
    try {
        const { quarter, year } = req.params;
        const yearNum = parseInt(year, 10);
        
        if (isNaN(yearNum)) {
            return res.status(400).json({ error: 'Invalid year' });
        }
        
        const validQuarters = ['Q1', 'Q2', 'Q3', 'Q4'];
        if (!validQuarters.includes(quarter.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid quarter. Must be Q1, Q2, Q3, or Q4' });
        }
        
        const anime = getCachedAnime(quarter.toUpperCase(), yearNum);
        if (!anime || anime.length === 0) {
            return res.status(404).json({ error: 'No anime data found for the specified quarter and year' });
        }
        res.json(anime);
    } catch (error) {
        console.error('Error fetching anime:', error);
        res.status(500).json({ error: 'Failed to fetch anime data' });
    }
});

export default router;

