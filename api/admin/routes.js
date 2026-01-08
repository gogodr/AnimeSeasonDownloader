import express from 'express';
import { getDB, updateSubGroupDefaultEnabled, getConfiguration, getAnimeLocationForOperations, saveConfiguration, getFileTorrentDownloads, getAutodownloadAnimes, getDownloadedTorrentIdsForAnime, getAnimeById, getAllScheduledJobs, getScheduledJobById, createScheduledJob, updateScheduledJob, deleteScheduledJob, updateScheduledJobRunTime } from '../../database/animeDB.js';
import { scheduleUpdateQuarterTask, scheduleScanFolderTask } from '../../services/taskQueue.js';
import { getRecentTasks, getActiveQuarterUpdateTask, getTaskById, deleteTasksByStatuses, TASK_STATUS } from '../../database/tasksDB.js';
import { getAllTorrents, updateSpeedLimits } from '../../services/torrentService.js';
import { reloadScheduledJobs, calculateNextRun, executeScheduledJob } from '../../services/scheduledJobsService.js';
import { getCurrentQuarter } from '../utils.js';

const router = express.Router();

/**
 * GET /api/admin/quarters
 * Returns all quarters with their last update times
 */
router.get('/quarters', async (req, res) => {
    try {
        const database = getDB();
        const query = database.prepare(`
            SELECT quarter, year, lastFetched
            FROM queries
            ORDER BY year DESC, 
                     CASE quarter
                         WHEN 'Q1' THEN 1
                         WHEN 'Q2' THEN 2
                         WHEN 'Q3' THEN 3
                         WHEN 'Q4' THEN 4
                     END DESC
        `);
        
        const results = query.all();
        const quarters = results.map(row => ({
            quarter: row.quarter,
            year: row.year,
            lastFetched: row.lastFetched ? new Date(row.lastFetched).toISOString() : null
        }));
        
        res.json(quarters);
    } catch (error) {
        console.error('Error fetching quarters:', error);
        res.status(500).json({ error: 'Failed to fetch quarters data' });
    }
});

/**
 * DELETE /api/admin/quarters/:quarter/:year
 * Deletes a quarter and all related data (animes, episodes, torrents, alternate titles)
 */
router.delete('/quarters/:quarter/:year', async (req, res) => {
    try {
        const { quarter, year } = req.params;
        
        const validQuarters = ['Q1', 'Q2', 'Q3', 'Q4'];
        const normalizedQuarter = quarter.toUpperCase();
        if (!validQuarters.includes(normalizedQuarter)) {
            return res.status(400).json({ error: 'Invalid quarter. Must be Q1, Q2, Q3, or Q4' });
        }
        
        const yearNum = parseInt(year, 10);
        if (isNaN(yearNum)) {
            return res.status(400).json({ error: 'Invalid year' });
        }
        
        const database = getDB();
        
        // Check if quarter exists
        const checkQuery = database.prepare(`
            SELECT quarter, year 
            FROM queries 
            WHERE quarter = ? AND year = ?
        `);
        const existing = checkQuery.get(normalizedQuarter, yearNum);
        
        if (!existing) {
            return res.status(404).json({ error: 'Quarter not found' });
        }
        
        // Get count of animes that will be deleted for informational purposes
        const countQuery = database.prepare(`
            SELECT COUNT(*) as count 
            FROM anime 
            WHERE quarter = ? AND year = ?
        `);
        const animeCount = countQuery.get(normalizedQuarter, yearNum);
        
        // Get all anime IDs for this quarter before deletion (needed for task cleanup)
        const getAnimeIdsQuery = database.prepare(`
            SELECT id 
            FROM anime 
            WHERE quarter = ? AND year = ?
        `);
        const animeIds = getAnimeIdsQuery.all(normalizedQuarter, yearNum).map(row => row.id);
        
        // Delete finished tasks (completed or failed) related to animes in this quarter
        let deletedTasksCount = 0;
        if (animeIds.length > 0) {
            const placeholders = animeIds.map(() => '?').join(',');
            const deleteTasksQuery = database.prepare(`
                DELETE FROM tasks 
                WHERE anime_id IN (${placeholders}) 
                AND status IN ('completed', 'failed')
            `);
            const result = deleteTasksQuery.run(...animeIds);
            deletedTasksCount = result.changes;
        }
        
        // Delete the quarter - this will cascade delete all related data due to foreign key constraints
        // The cascade will delete:
        // - All animes in this quarter
        // - All episodes for those animes
        // - All torrents for those episodes
        // - All alternative titles for those animes
        // - All file_torrent_download records for those torrents
        // - All anime_genres relationships
        // - All anime_sub_groups relationships
        const deleteQuery = database.prepare(`
            DELETE FROM queries 
            WHERE quarter = ? AND year = ?
        `);
        deleteQuery.run(normalizedQuarter, yearNum);
        
        // After deletion, find and delete subgroups that no longer have any episodes/torrents
        // A subgroup should be deleted if there are no torrents and no anime_sub_groups that reference it
        const orphanedSubgroupsQuery = database.prepare(`
            SELECT sg.id, sg.name
            FROM sub_groups sg
            LEFT JOIN torrents t ON t.sub_group_id = sg.id
            LEFT JOIN anime_sub_groups asg ON asg.sub_group_id = sg.id
            WHERE t.id IS NULL AND asg.anime_id IS NULL
        `);
        const orphanedSubgroups = orphanedSubgroupsQuery.all();
        
        let deletedSubgroupsCount = 0;
        if (orphanedSubgroups.length > 0) {
            const deleteSubgroupsQuery = database.prepare(`
                DELETE FROM sub_groups 
                WHERE id = ?
            `);
            for (const subgroup of orphanedSubgroups) {
                deleteSubgroupsQuery.run(subgroup.id);
                deletedSubgroupsCount++;
            }
        }
        
        console.log(`Admin: Deleted quarter ${normalizedQuarter} ${yearNum} and ${animeCount.count} associated animes`);
        if (deletedTasksCount > 0) {
            console.log(`Admin: Deleted ${deletedTasksCount} finished tasks related to the quarter`);
        }
        if (deletedSubgroupsCount > 0) {
            console.log(`Admin: Deleted ${deletedSubgroupsCount} orphaned subgroups`);
        }
        
        res.json({
            success: true,
            message: `Successfully deleted quarter ${normalizedQuarter} ${yearNum} and all associated data`,
            quarter: normalizedQuarter,
            year: yearNum,
            deletedAnimes: animeCount.count,
            deletedTasks: deletedTasksCount,
            deletedSubgroups: deletedSubgroupsCount
        });
    } catch (error) {
        console.error('Error deleting quarter:', error);
        res.status(500).json({ error: 'Failed to delete quarter' });
    }
});

/**
 * POST /api/admin/update-quarter
 * Updates/refreshes anime data for a specific quarter and year
 * Body: { quarter: string, year: number }
 */
router.post('/update-quarter', express.json(), async (req, res) => {
    try {
        const { quarter, year } = req.body;
        
        if (!quarter || !year) {
            return res.status(400).json({ error: 'Quarter and year are required' });
        }
        
        const validQuarters = ['Q1', 'Q2', 'Q3', 'Q4'];
        if (!validQuarters.includes(quarter.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid quarter. Must be Q1, Q2, Q3, or Q4' });
        }
        
        const yearNum = parseInt(year, 10);
        if (isNaN(yearNum)) {
            return res.status(400).json({ error: 'Invalid year' });
        }
        
        const normalizedQuarter = quarter.toUpperCase();
        console.log(`Admin: Queueing quarter update for ${normalizedQuarter} ${yearNum}...`);

        // Check if this is a new quarter being added (not just updated)
        const database = getDB();
        const checkQuarterQuery = database.prepare(`
            SELECT quarter, year 
            FROM queries 
            WHERE quarter = ? AND year = ?
        `);
        const existingQuarter = checkQuarterQuery.get(normalizedQuarter, yearNum);
        const isNewQuarter = !existingQuarter;

        // If this is a new quarter and it's the current quarter, check for scheduled job
        if (isNewQuarter) {
            const currentQuarter = getCurrentQuarter();
            const currentYear = new Date().getFullYear();
            
            if (normalizedQuarter === currentQuarter && yearNum === currentYear) {
                // Check if there's already a scheduled job for this quarter
                const allJobs = getAllScheduledJobs();
                const hasScheduledJob = allJobs.some(job => {
                    return job.jobType === 'SCAN_QUARTER' &&
                           job.jobConfig &&
                           job.jobConfig.quarter === normalizedQuarter &&
                           job.jobConfig.year === yearNum;
                });
                
                if (!hasScheduledJob) {
                    // Create a scheduled job for this quarter
                    const cronSchedule = '0 0 * * 0'; // Weekly on Sunday at midnight
                    const jobName = 'Default - Weekly Quarter Scan';
                    const nextRun = calculateNextRun(cronSchedule);
                    
                    const newJob = createScheduledJob({
                        name: jobName,
                        jobType: 'SCAN_QUARTER',
                        cronSchedule: cronSchedule,
                        jobConfig: { quarter: normalizedQuarter, year: yearNum },
                        nextRun: nextRun
                    });
                    
                    // Reload scheduled jobs to activate the new job
                    reloadScheduledJobs();
                    
                    console.log(`Admin: Created default scheduled job "${jobName}" for ${normalizedQuarter} ${yearNum}`);
                }
            }
        }

        const task = scheduleUpdateQuarterTask({ quarter: normalizedQuarter, year: yearNum });

        const statusCode = task.status === TASK_STATUS.COMPLETED ? 200 : 202;
        const responseMessage =
            task.status === TASK_STATUS.COMPLETED
                ? `Successfully refreshed anime data for ${normalizedQuarter} ${yearNum}`
                : `Queued anime data refresh for ${normalizedQuarter} ${yearNum}`;

        res.status(statusCode).json({
            success: true,
            taskId: task.id,
            status: task.status,
            message: responseMessage,
            result: task.result || null
        });
    } catch (error) {
        console.error('Error updating quarter:', error);
        res.status(500).json({ error: 'Failed to update anime data' });
    }
});

/**
 * GET /api/admin/quarter-update-task/:quarter/:year
 * Returns the status of an active quarter update task with long polling support
 * Query params: timeout (number, in milliseconds, default 30000), pollInterval (number, in milliseconds, default 500)
 */
router.get('/quarter-update-task/:quarter/:year', async (req, res) => {
    try {
        const { quarter, year } = req.params;
        const timeout = parseInt(req.query.timeout || '30000', 10);
        const pollInterval = parseInt(req.query.pollInterval || '500', 10);
        
        const yearNum = parseInt(year, 10);
        if (isNaN(yearNum)) {
            return res.status(400).json({ error: 'Invalid year' });
        }
        
        const validQuarters = ['Q1', 'Q2', 'Q3', 'Q4'];
        if (!validQuarters.includes(quarter.toUpperCase())) {
            return res.status(400).json({ error: 'Invalid quarter. Must be Q1, Q2, Q3, or Q4' });
        }
        
        const normalizedQuarter = quarter.toUpperCase();
        const startTime = Date.now();
        
        // Long polling: check periodically until task completes or timeout
        const checkTask = () => {
            // Include recently completed tasks to catch tasks that just finished
            const task = getActiveQuarterUpdateTask(normalizedQuarter, yearNum, true);
            const elapsed = Date.now() - startTime;
            
            if (!task) {
                // No active task found (and no recently completed task)
                return res.json({
                    task: null,
                    status: 'no_task',
                    message: 'No active task found for this quarter'
                });
            }
            
            // If task is completed or failed, return immediately
            if (task.status === TASK_STATUS.COMPLETED || task.status === TASK_STATUS.FAILED) {
                return res.json({
                    task: {
                        id: task.id,
                        status: task.status,
                        result: task.result,
                        error: task.error,
                        createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : null,
                        updatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : null
                    },
                    status: task.status,
                    message: task.status === TASK_STATUS.COMPLETED ? 'Task completed' : 'Task failed'
                });
            }
            
            // If timeout reached, return current status
            if (elapsed >= timeout) {
                return res.json({
                    task: {
                        id: task.id,
                        status: task.status,
                        createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : null,
                        updatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : null
                    },
                    status: task.status,
                    message: 'Task still in progress',
                    timeout: true
                });
            }
            
            // Continue polling
            setTimeout(checkTask, pollInterval);
        };
        
        // Start polling
        checkTask();
    } catch (error) {
        console.error('Error checking quarter update task:', error);
        res.status(500).json({ error: 'Failed to check quarter update task' });
    }
});

/**
 * GET /api/admin/tasks
 * Returns recent tasks optionally filtered by status
 * Query params: statuses (comma-separated), limit (number)
 */
router.get('/tasks', (req, res) => {
    try {
        const { statuses, limit } = req.query;

        const validStatuses = new Set(Object.values(TASK_STATUS));
        let statusFilters = null;

        if (typeof statuses === 'string' && statuses.trim().length > 0) {
            const requested = statuses
                .split(',')
                .map((value) => value.trim().toLowerCase())
                .filter((value) => value.length > 0);

            const normalized = requested.filter((status) => validStatuses.has(status));

            if (normalized.length > 0) {
                statusFilters = normalized;
            }
        }

        let limitNumber = 25;
        if (typeof limit === 'string' && limit.trim().length > 0) {
            const parsedLimit = parseInt(limit, 10);
            if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
                limitNumber = Math.min(parsedLimit, 100);
            }
        }

        const tasks = getRecentTasks({ statuses: statusFilters, limit: limitNumber });

        const response = tasks.map((task) => ({
            id: task.id,
            type: task.type,
            status: task.status,
            animeId: task.animeId || null,
            payload: task.payload || null,
            result: task.result || null,
            error: task.error || null,
            createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : null,
            updatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : null
        }));

        res.json(response);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

/**
 * DELETE /api/admin/tasks/completed-failed
 * Deletes all completed and failed tasks
 */
router.delete('/tasks/completed-failed', (req, res) => {
    try {
        const deletedCount = deleteTasksByStatuses([TASK_STATUS.COMPLETED, TASK_STATUS.FAILED]);
        
        console.log(`Admin: Deleted ${deletedCount} completed and failed tasks`);
        
        res.json({
            success: true,
            message: `Successfully deleted ${deletedCount} completed and failed task(s)`,
            deletedCount
        });
    } catch (error) {
        console.error('Error deleting tasks:', error);
        res.status(500).json({ error: 'Failed to delete tasks' });
    }
});

/**
 * GET /api/admin/subgroups
 * Returns all subgroups with their AniDB metadata
 */
router.get('/subgroups', async (req, res) => {
    try {
        const database = getDB();
        const query = database.prepare(`
            SELECT id, name, anidbID, default_enabled
            FROM sub_groups
            ORDER BY name ASC
        `);
        
        const results = query.all();
        const subgroups = results.map(row => ({
            id: row.id,
            name: row.name,
            anidbID: row.anidbID || null,
            defaultEnabled: Boolean(row.default_enabled)
        }));
        
        res.json(subgroups);
    } catch (error) {
        console.error('Error fetching subgroups:', error);
        res.status(500).json({ error: 'Failed to fetch subgroups data' });
    }
});

/**
 * POST /api/admin/subgroups/:id/default-enabled
 * Sets the default enabled state for a subgroup
 * Body: { defaultEnabled: boolean }
 */
router.post('/subgroups/:id/default-enabled', express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const subgroupId = parseInt(id, 10);
        const { defaultEnabled } = req.body;

        if (isNaN(subgroupId)) {
            return res.status(400).json({ error: 'Invalid subgroup ID' });
        }

        if (typeof defaultEnabled !== 'boolean') {
            return res.status(400).json({ error: 'defaultEnabled flag must be a boolean' });
        }

        const result = updateSubGroupDefaultEnabled(subgroupId, defaultEnabled);

        res.json({
            success: true,
            subGroupId: result.subGroupId,
            defaultEnabled: result.defaultEnabled
        });
    } catch (error) {
        console.error('Error updating subgroup default state:', error);
        const message = error.message === 'Subgroup not found' ? error.message : 'Failed to update subgroup default state';
        const status = error.message === 'Subgroup not found' ? 404 : 500;
        res.status(status).json({ error: message });
    }
});

/**
 * GET /api/admin/anime/search
 * Searches anime by title for autocomplete
 * Query params: q (search query)
 */
router.get('/anime/search', async (req, res) => {
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
router.get('/alternative-titles/all', async (req, res) => {
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
router.get('/alternative-titles/:animeId', async (req, res) => {
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
router.post('/alternative-titles', express.json(), async (req, res) => {
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
router.delete('/alternative-titles/:id', async (req, res) => {
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
 * GET /api/admin/config
 * Returns the current configuration
 */
router.get('/config', async (req, res) => {
    try {
        const config = getConfiguration();
        res.json(config);
    } catch (error) {
        console.error('Error fetching configuration:', error);
        res.status(500).json({ error: 'Failed to fetch configuration' });
    }
});

/**
 * POST /api/admin/config
 * Saves the configuration
 * Body: { animeLocation, enableAutomaticAnimeFolderClassification, maxDownloadSpeed, maxUploadSpeed, setup }
 */
router.post('/config', express.json(), async (req, res) => {
    try {
        const {
            animeLocation,
            enableAutomaticAnimeFolderClassification,
            maxDownloadSpeed,
            maxUploadSpeed,
            setup
        } = req.body;
        
        // Validate boolean fields
        if (typeof enableAutomaticAnimeFolderClassification !== 'boolean') {
            return res.status(400).json({ error: 'enableAutomaticAnimeFolderClassification must be a boolean' });
        }
        
        // Validate string fields (can be null or string)
        if (animeLocation !== null && animeLocation !== undefined && typeof animeLocation !== 'string') {
            return res.status(400).json({ error: 'animeLocation must be a string or null' });
        }
        
        // Validate speed limit fields (can be null, undefined, or positive number)
        if (maxDownloadSpeed !== null && maxDownloadSpeed !== undefined) {
            const downloadSpeed = Number(maxDownloadSpeed);
            if (isNaN(downloadSpeed) || downloadSpeed < 0) {
                return res.status(400).json({ error: 'maxDownloadSpeed must be a positive number or null' });
            }
        }
        
        if (maxUploadSpeed !== null && maxUploadSpeed !== undefined) {
            const uploadSpeed = Number(maxUploadSpeed);
            if (isNaN(uploadSpeed) || uploadSpeed < 0) {
                return res.status(400).json({ error: 'maxUploadSpeed must be a positive number or null' });
            }
        }
        
        // Validate setup field (optional, boolean)
        if (setup !== undefined && typeof setup !== 'boolean') {
            return res.status(400).json({ error: 'setup must be a boolean' });
        }
        
        // Check if animeLocation is set via environment variable
        const currentConfig = getConfiguration();
        const animeLocationFromEnv = currentConfig.animeLocationFromEnv || false;
        
        // Prepare config object for saving
        const configToSave = {
            enableAutomaticAnimeFolderClassification,
            maxDownloadSpeed: maxDownloadSpeed !== undefined ? (maxDownloadSpeed === null ? null : Number(maxDownloadSpeed)) : undefined,
            maxUploadSpeed: maxUploadSpeed !== undefined ? (maxUploadSpeed === null ? null : Number(maxUploadSpeed)) : undefined,
            setup: setup !== undefined ? setup : undefined
        };
        
        // Only update animeLocation if it's not set via environment variable
        if (!animeLocationFromEnv) {
            configToSave.animeLocation = animeLocation || null;
        }
        
        const config = saveConfiguration(configToSave);
        
        // Update speed limits on the WebTorrent client
        updateSpeedLimits();
        
        res.json({
            success: true,
            message: 'Configuration saved successfully',
            config
        });
    } catch (error) {
        console.error('Error saving configuration:', error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

/**
 * POST /api/admin/scan-folder
 * Triggers a folder scan task
 * Body: { folderPath: string }
 */
router.post('/scan-folder', express.json(), async (req, res) => {
    try {
        const { folderPath } = req.body;
        
        if (!folderPath || typeof folderPath !== 'string') {
            return res.status(400).json({ error: 'folderPath is required and must be a string' });
        }
        
        // Get the actual path to use for operations (uses /app/anime if from env)
        // But keep the display value as the original folderPath for the response message
        const config = getConfiguration();
        const actualFolderPath = config.animeLocationFromEnv ? getAnimeLocationForOperations() : folderPath;
        
        const task = scheduleScanFolderTask({ folderPath: actualFolderPath });
        
        const statusCode = task.status === TASK_STATUS.COMPLETED ? 200 : 202;
        const responseMessage =
            task.status === TASK_STATUS.COMPLETED
                ? `Successfully scanned folder: ${folderPath}`
                : `Queued folder scan for: ${folderPath}`;
        
        res.status(statusCode).json({
            success: true,
            taskId: task.id,
            status: task.status,
            message: responseMessage,
            result: task.result || null
        });
    } catch (error) {
        console.error('Error scanning folder:', error);
        res.status(500).json({ error: error.message || 'Failed to scan folder' });
    }
});

/**
 * GET /api/admin/file-downloads
 * Returns paginated list of file_torrent_download records
 * Query params: page (number), pageSize (number)
 */
router.get('/file-downloads', async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const pageSize = parseInt(req.query.pageSize || '25', 10);
        
        if (isNaN(page) || page < 1) {
            return res.status(400).json({ error: 'Invalid page number' });
        }
        
        if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
            return res.status(400).json({ error: 'Invalid pageSize (must be between 1 and 100)' });
        }
        
        const result = getFileTorrentDownloads(page, pageSize);
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching file downloads:', error);
        res.status(500).json({ error: 'Failed to fetch file downloads' });
    }
});

/**
 * GET /api/admin/torrents
 * Returns all active torrents with their status
 */
router.get('/torrents', (req, res) => {
    try {
        const torrents = getAllTorrents();
        res.json(torrents);
    } catch (error) {
        console.error('Error fetching torrents:', error);
        res.status(500).json({ error: 'Failed to fetch torrents' });
    }
});

/**
 * GET /api/admin/autodownload-animes
 * Returns all animes with autodownload enabled
 */
router.get('/autodownload-animes', (req, res) => {
    try {
        const animes = getAutodownloadAnimes();
        res.json(animes);
    } catch (error) {
        console.error('Error fetching autodownload animes:', error);
        res.status(500).json({ error: 'Failed to fetch autodownload animes' });
    }
});

/**
 * GET /api/admin/autodownload-animes/:id/undownloaded-episodes
 * Returns episodes that haven't been downloaded yet for an anime (with their torrents)
 */
router.get('/autodownload-animes/:id/undownloaded-episodes', (req, res) => {
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
        
        // Get downloaded torrent IDs for this anime
        const downloadedTorrentIds = getDownloadedTorrentIdsForAnime(animeId);
        
        // Filter episodes to only those that are tracked (have torrents) but haven't been downloaded
        // An episode is considered undownloaded if:
        // 1. It has torrents (is tracked)
        // 2. None of those torrents have been downloaded (checked against file_torrent_download)
        const undownloadedEpisodes = anime.episodes.filter(episode => {
            // Only consider episodes that have torrents (are tracked)
            if (!episode.torrents || episode.torrents.length === 0) {
                return false; // Skip episodes with no torrents
            }
            
            // Check if any torrent for this episode has been downloaded
            const hasDownloadedTorrent = episode.torrents.some(torrent => 
                torrent.id && downloadedTorrentIds.has(torrent.id)
            );
            
            // Only include if it has torrents but none are downloaded
            return !hasDownloadedTorrent;
        }).map(episode => {
            // Sort torrents by date (earliest first)
            const sortedTorrents = episode.torrents ? [...episode.torrents].sort((a, b) => {
                const dateA = a.date ? new Date(a.date).getTime() : 0;
                const dateB = b.date ? new Date(b.date).getTime() : 0;
                return dateA - dateB;
            }) : [];
            
            return {
                episode: episode.episode,
                airingAt: episode.airingAt,
                torrents: sortedTorrents
            };
        });
        
        res.json({
            animeId: animeId,
            episodes: undownloadedEpisodes
        });
    } catch (error) {
        console.error('Error fetching undownloaded episodes:', error);
        res.status(500).json({ error: 'Failed to fetch undownloaded episodes' });
    }
});

/**
 * GET /api/admin/scheduled-jobs
 * Returns all scheduled jobs
 */
router.get('/scheduled-jobs', (req, res) => {
    try {
        const jobs = getAllScheduledJobs();
        res.json(jobs);
    } catch (error) {
        console.error('Error fetching scheduled jobs:', error);
        res.status(500).json({ error: 'Failed to fetch scheduled jobs' });
    }
});

/**
 * GET /api/admin/scheduled-jobs/:id
 * Returns a specific scheduled job by ID
 */
router.get('/scheduled-jobs/:id', (req, res) => {
    try {
        const { id } = req.params;
        const jobId = parseInt(id, 10);
        
        if (isNaN(jobId)) {
            return res.status(400).json({ error: 'Invalid job ID' });
        }
        
        const job = getScheduledJobById(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Scheduled job not found' });
        }
        
        res.json(job);
    } catch (error) {
        console.error('Error fetching scheduled job:', error);
        res.status(500).json({ error: 'Failed to fetch scheduled job' });
    }
});

/**
 * POST /api/admin/scheduled-jobs
 * Creates a new scheduled job
 * Body: { name: string, jobType: string, cronSchedule: string, jobConfig: object }
 */
router.post('/scheduled-jobs', express.json(), (req, res) => {
    try {
        const { name, jobType, cronSchedule, jobConfig } = req.body;
        
        if (!name || !jobType || !cronSchedule) {
            return res.status(400).json({ error: 'name, jobType, and cronSchedule are required' });
        }
        
        // Calculate next run time
        const nextRun = calculateNextRun(cronSchedule);
        
        const job = createScheduledJob({ name, jobType, cronSchedule, jobConfig, nextRun });
        
        // Reload scheduled jobs to activate the new job
        reloadScheduledJobs();
        
        res.status(201).json(job);
    } catch (error) {
        console.error('Error creating scheduled job:', error);
        res.status(500).json({ error: error.message || 'Failed to create scheduled job' });
    }
});

/**
 * PUT /api/admin/scheduled-jobs/:id
 * Updates a scheduled job
 * Body: { name?: string, jobType?: string, cronSchedule?: string, enabled?: boolean, jobConfig?: object }
 */
router.put('/scheduled-jobs/:id', express.json(), (req, res) => {
    try {
        const { id } = req.params;
        const jobId = parseInt(id, 10);
        
        if (isNaN(jobId)) {
            return res.status(400).json({ error: 'Invalid job ID' });
        }
        
        const { name, jobType, cronSchedule, enabled, jobConfig } = req.body;
        
        const job = updateScheduledJob(jobId, { name, jobType, cronSchedule, enabled, jobConfig });
        
        // Recalculate next run time if cron schedule was updated
        if (cronSchedule && job.enabled) {
            const nextRun = calculateNextRun(cronSchedule);
            if (nextRun) {
                updateScheduledJobRunTime(jobId, nextRun);
            }
        }
        
        // Reload scheduled jobs to apply changes
        reloadScheduledJobs();
        
        res.json(job);
    } catch (error) {
        console.error('Error updating scheduled job:', error);
        if (error.message === 'Job not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Failed to update scheduled job' });
    }
});

/**
 * DELETE /api/admin/scheduled-jobs/:id
 * Deletes a scheduled job
 */
router.delete('/scheduled-jobs/:id', (req, res) => {
    try {
        const { id } = req.params;
        const jobId = parseInt(id, 10);
        
        if (isNaN(jobId)) {
            return res.status(400).json({ error: 'Invalid job ID' });
        }
        
        const deleted = deleteScheduledJob(jobId);
        if (!deleted) {
            return res.status(404).json({ error: 'Scheduled job not found' });
        }
        
        // Reload scheduled jobs to remove the deleted job
        reloadScheduledJobs();
        
        res.json({ success: true, message: 'Scheduled job deleted successfully' });
    } catch (error) {
        console.error('Error deleting scheduled job:', error);
        res.status(500).json({ error: 'Failed to delete scheduled job' });
    }
});

/**
 * POST /api/admin/scheduled-jobs/:id/run
 * Manually triggers a scheduled job execution
 */
router.post('/scheduled-jobs/:id/run', async (req, res) => {
    try {
        const { id } = req.params;
        const jobId = parseInt(id, 10);
        
        if (isNaN(jobId)) {
            return res.status(400).json({ error: 'Invalid job ID' });
        }
        
        const job = getScheduledJobById(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Scheduled job not found' });
        }
        
        // Execute the job
        await executeScheduledJob(job);
        
        res.json({ 
            success: true, 
            message: `Job "${job.name}" has been triggered successfully`,
            jobId: job.id
        });
    } catch (error) {
        console.error('Error running scheduled job:', error);
        res.status(500).json({ error: error.message || 'Failed to run scheduled job' });
    }
});

export default router;

