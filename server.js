import express from 'express';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getUpcomingAnime } from './services/animeService.js';
import { getCurrentQuarter } from './api/utils.js';
import quarterRoutes from './api/quarter/routes.js';
import animeRoutes from './api/anime/routes.js';
import adminRoutes from './api/admin/routes.js';
import { initializeTaskQueue } from './services/taskQueue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

// Initialize background task queue
initializeTaskQueue();

/**
 * Updates anime data for the current quarter
 * @param {boolean} forceRefresh - If true, forces refresh even if cache is valid
 */
async function updateAnimeData(forceRefresh = false) {
    try {
        const today = new Date();
        const quarter = getCurrentQuarter();
        const year = today.getFullYear();
        
        console.log(`Updating anime data for ${quarter} ${year}...`);
        await getUpcomingAnime(quarter, year, forceRefresh);
        console.log(`Successfully updated anime data for ${quarter} ${year}`);
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
app.use('/api/quarter', quarterRoutes);
app.use('/api/anime', animeRoutes);
app.use('/api/admin', adminRoutes);

// Serve React app for all other routes
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
