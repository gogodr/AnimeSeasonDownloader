import express from 'express';
import { getAnimeById, getAnimeSubGroups, setAnimeSubGroupEnabled, getDownloadedTorrentIdsForAnime, setAnimeAutodownload } from '../../database/animeDB.js';
import {
    scheduleScanTorrentsTask,
    getTaskById,
    getActiveTaskForAnime,
    TASK_STATUS
} from '../../services/taskQueue.js';
import { downloadTorrent, getTorrentStatusByTorrentIdOrUrl } from '../../services/torrentService.js';

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
 * Body: { wipePrevious: boolean } (optional, defaults to false)
 */
router.post('/:id/scan-torrents', async (req, res) => {
    try {
        const { id } = req.params;
        const animeId = parseInt(id);
        const { wipePrevious = false } = req.body;
        
        if (isNaN(animeId)) {
            return res.status(400).json({ error: 'Invalid anime ID' });
        }
        
        // Check if anime exists
        const anime = getAnimeById(animeId);
        if (!anime) {
            return res.status(404).json({ error: 'Anime not found' });
        }
        
        console.log(`Admin: Queueing torrent scan for anime ID ${animeId}...${wipePrevious ? ' (wiping previous)' : ''}`);

        const task = scheduleScanTorrentsTask({ animeId, wipePrevious });

        res.status(task.status === TASK_STATUS.COMPLETED ? 200 : 202).json({
            success: true,
            taskId: task.id,
            status: task.status,
            result: task.result || null
        });
    } catch (error) {
        console.error('Error scanning torrents:', error);
        res.status(500).json({ error: error.message || 'Failed to scan torrents' });
    }
});

/**
 * POST /api/anime/:id/subgroups/:subGroupId
 * Toggles the enabled state of a subgroup for a specific anime
 * Body: { enabled: boolean }
 */
router.post('/:id/subgroups/:subGroupId', (req, res) => {
    try {
        const { id, subGroupId } = req.params;
        const animeId = parseInt(id, 10);
        const subgroupIdNum = parseInt(subGroupId, 10);
        const { enabled } = req.body;

        if (isNaN(animeId) || isNaN(subgroupIdNum)) {
            return res.status(400).json({ error: 'Invalid anime or subgroup ID' });
        }

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'Enabled flag must be a boolean' });
        }

        const anime = getAnimeById(animeId);
        if (!anime) {
            return res.status(404).json({ error: 'Anime not found' });
        }

        const toggleResult = setAnimeSubGroupEnabled(animeId, subgroupIdNum, enabled);
        const updatedSubGroups = getAnimeSubGroups(animeId);
        const updatedSubGroup = updatedSubGroups.find(sg => sg.id === subgroupIdNum) || null;

        res.json({
            success: true,
            animeId: toggleResult.animeId,
            subGroup: updatedSubGroup,
            subGroups: updatedSubGroups
        });
    } catch (error) {
        console.error('Error toggling anime subgroup:', error);
        res.status(500).json({ error: error.message || 'Failed to toggle subgroup' });
    }
});

/**
 * GET /api/anime/tasks/:taskId
 * Returns status information for a background task
 */
router.get('/tasks/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;

        if (!taskId) {
            return res.status(400).json({ error: 'Task ID is required' });
        }

        const task = getTaskById(taskId);

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({
            id: task.id,
            type: task.type,
            status: task.status,
            result: task.result || null,
            error: task.error || null,
            animeId: task.animeId || null,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt
        });
    } catch (error) {
        console.error('Error fetching task status:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch task status' });
    }
});

/**
 * GET /api/anime/:id/scan-task
 * Returns the currently active torrent scan task for the anime if it exists
 */
router.get('/:id/scan-task', (req, res) => {
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

        const task = getActiveTaskForAnime(animeId);

        res.json({
            task: task
                ? {
                      id: task.id,
                      type: task.type,
                      status: task.status,
                      result: task.result || null,
                      error: task.error || null,
                      animeId: task.animeId || null,
                      createdAt: task.createdAt,
                      updatedAt: task.updatedAt
                  }
                : null
        });
    } catch (error) {
        console.error('Error fetching active scan task:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch active scan task' });
    }
});

/**
 * GET /api/anime/:id/downloaded-torrents
 * Returns an array of torrent IDs that have been downloaded for this anime
 */
router.get('/:id/downloaded-torrents', (req, res) => {
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

        const downloadedTorrentIds = getDownloadedTorrentIdsForAnime(animeId);
        res.json({
            animeId,
            downloadedTorrentIds: Array.from(downloadedTorrentIds)
        });
    } catch (error) {
        console.error('Error fetching downloaded torrents:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch downloaded torrents' });
    }
});

/**
 * POST /api/anime/:id/torrents/:torrentId/download
 * Downloads a torrent for an anime
 * Body: { torrentLink: string, torrentTitle: string }
 */
router.post('/:id/torrents/:torrentId/download', express.json(), async (req, res) => {
    try {
        const { id, torrentId } = req.params;
        const animeId = parseInt(id);
        const torrentIdNum = parseInt(torrentId);
        const { torrentLink, torrentTitle } = req.body;

        if (isNaN(animeId)) {
            return res.status(400).json({ error: 'Invalid anime ID' });
        }

        if (isNaN(torrentIdNum)) {
            return res.status(400).json({ error: 'Invalid torrent ID' });
        }

        if (!torrentLink) {
            return res.status(400).json({ error: 'Torrent link is required' });
        }

        const anime = getAnimeById(animeId);
        if (!anime) {
            return res.status(404).json({ error: 'Anime not found' });
        }

        const animeTitle = anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown';

        // Download the torrent
        const result = await downloadTorrent(torrentLink, {
            animeTitle,
            animeId,
            torrentId: torrentIdNum
        });

        res.json({
            success: true,
            message: 'Torrent download started',
            result
        });
    } catch (error) {
        console.error('Error downloading torrent:', error);
        res.status(500).json({ error: error.message || 'Failed to download torrent' });
    }
});

/**
 * GET /api/anime/:id/torrents/:torrentId/status
 * Gets the download status of a torrent
 */
router.get('/:id/torrents/:torrentId/status', (req, res) => {
    try {
        const { torrentId } = req.params;
        const torrentIdNum = parseInt(torrentId);

        if (isNaN(torrentIdNum)) {
            return res.status(400).json({ error: 'Invalid torrent ID' });
        }

        // Try by URL first (more reliable since webtorrent tracks by URL)
        const { url } = req.query;
        if (url) {
            const statusByUrl = getTorrentStatusByTorrentIdOrUrl(url);
            if (statusByUrl) {
                return res.json(statusByUrl);
            }
        }
        
        // Fallback to torrentId
        const status = getTorrentStatusByTorrentIdOrUrl(torrentIdNum);
        if (status) {
            return res.json(status);
        }

        return res.json({ status: 'not_found' });
    } catch (error) {
        console.error('Error getting torrent status:', error);
        res.status(500).json({ error: error.message || 'Failed to get torrent status' });
    }
});

/**
 * POST /api/anime/:id/autodownload
 * Toggles the autodownload setting for an anime
 * Body: { autodownload: boolean }
 */
router.post('/:id/autodownload', express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const animeId = parseInt(id);
        const { autodownload } = req.body;

        if (isNaN(animeId)) {
            return res.status(400).json({ error: 'Invalid anime ID' });
        }

        if (typeof autodownload !== 'boolean') {
            return res.status(400).json({ error: 'Autodownload must be a boolean' });
        }

        const anime = getAnimeById(animeId);
        if (!anime) {
            return res.status(404).json({ error: 'Anime not found' });
        }

        const result = await setAnimeAutodownload(animeId, autodownload);
        const updatedAnime = getAnimeById(animeId);

        res.json({
            success: true,
            animeId: result.animeId,
            autodownload: result.autodownload,
            anime: updatedAnime
        });
    } catch (error) {
        console.error('Error toggling autodownload:', error);
        res.status(500).json({ error: error.message || 'Failed to toggle autodownload' });
    }
});

export default router;

