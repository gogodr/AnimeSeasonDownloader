import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import quarterRoutes from './api/quarter/routes.js';
import animeRoutes from './api/anime/routes.js';
import adminRoutes from './api/admin/routes.js';
import { initializeTaskQueue } from './services/taskQueue.js';
import { initializeTorrentClient } from './services/torrentService.js';
import { initializeScheduledJobs } from './services/scheduledJobsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

process.setMaxListeners(Infinity);
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'dist')));

// Initialize background task queue
initializeTaskQueue();

// Initialize WebTorrent client
initializeTorrentClient();

// Initialize scheduled jobs
initializeScheduledJobs();


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
