import PQueue from 'p-queue';
import { scanAnimeTorrents, getUpcomingAnime, scanAutodownloadAnimes, queueAutodownloadTorrents } from './animeService.js';
import { scanFolderForTorrents } from './folderScanner.js';
import {
    createTask,
    getTaskById,
    getTasksByStatuses,
    getActiveTaskForAnime,
    updateTaskStatus,
    TASK_STATUS,
    TASK_TYPES
} from '../database/tasksDB.js';
import { getCachedAnime, getDB } from '../database/animeDB.js';

const mainQueue = new PQueue({ concurrency: 1 });

let initialized = false;

function ensureTaskPayload(task) {
    if (!task || typeof task !== 'object') {
        throw new Error('Invalid task payload');
    }
    return task;
}

async function executeTask(taskSnapshot) {
    const task = ensureTaskPayload(taskSnapshot);

    try {
        updateTaskStatus(task.id, TASK_STATUS.RUNNING, { result: null, error: null });

        switch (task.type) {
            case TASK_TYPES.SCAN_TORRENTS: {
                const wipePrevious = Boolean(task.payload?.wipePrevious);
                
                // Check if anime has episodes with torrents tracked
                const database = getDB();
                const hasTrackedEpisodesQuery = database.prepare(`
                    SELECT COUNT(*) as count
                    FROM torrents t
                    INNER JOIN episodes e ON t.episode_id = e.id
                    WHERE e.anime_id = ?
                `);
                const result = hasTrackedEpisodesQuery.get(task.animeId);
                const hasTrackedEpisodes = result && result.count > 0;
                
                // Perform deepSearch if wipePrevious is true OR if anime has no tracked episodes
                const deepSearch = wipePrevious || !hasTrackedEpisodes;
                
                const scanResult = await scanAnimeTorrents(task.animeId, wipePrevious, deepSearch);

                updateTaskStatus(task.id, TASK_STATUS.COMPLETED, {
                    result: {
                        message: scanResult.message,
                        torrentsFound: scanResult.torrentsFound,
                        deletedCount: scanResult.deletedCount
                    },
                    error: null
                });
                break;
            }
            case TASK_TYPES.UPDATE_QUARTER: {
                const payload = task.payload || {};
                const quarter = String(payload.quarter || '').toUpperCase();
                const year = parseInt(payload.year, 10);

                if (!quarter || ['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter) === false) {
                    throw new Error('Task payload missing valid quarter');
                }

                if (Number.isNaN(year)) {
                    throw new Error('Task payload missing valid year');
                }

                // Check if this is the first run by checking if there are any anime associated to this quarter
                const existingAnime = getCachedAnime(quarter, year);
                const isFirstRun = !existingAnime || existingAnime.length === 0;
                const deepSearch = isFirstRun;

                const upcomingAnime = await getUpcomingAnime(quarter, year, true, deepSearch);
                const animeCount = Array.isArray(upcomingAnime) ? upcomingAnime.length : 0;

                updateTaskStatus(task.id, TASK_STATUS.COMPLETED, {
                    result: {
                        message: `Updated anime cache for ${quarter} ${year}`,
                        quarter,
                        year,
                        animeCount
                    },
                    error: null
                });
                break;
            }
            case TASK_TYPES.SCAN_FOLDER: {
                const payload = task.payload || {};
                const folderPath = payload.folderPath;

                if (!folderPath || typeof folderPath !== 'string') {
                    throw new Error('Task payload missing valid folderPath');
                }

                const result = await scanFolderForTorrents(folderPath);

                updateTaskStatus(task.id, TASK_STATUS.COMPLETED, {
                    result,
                    error: null
                });
                break;
            }
            case TASK_TYPES.SCAN_AUTODOWNLOAD: {
                const result = await scanAutodownloadAnimes();

                updateTaskStatus(task.id, TASK_STATUS.COMPLETED, {
                    result,
                    error: null
                });
                break;
            }
            case TASK_TYPES.QUEUE_AUTODOWNLOAD: {
                const result = await queueAutodownloadTorrents();

                updateTaskStatus(task.id, TASK_STATUS.COMPLETED, {
                    result,
                    error: null
                });
                break;
            }
            default: {
                throw new Error(`Unsupported task type: ${task.type}`);
            }
        }
    } catch (error) {
        console.error(`Task ${task.id} failed:`, error);
        updateTaskStatus(task.id, TASK_STATUS.FAILED, {
            result: null,
            error: error?.message || 'Task failed'
        });
    }
}

function enqueueTask(task) {
    const taskPayload = ensureTaskPayload(task);
    mainQueue
        .add(() => executeTask(taskPayload))
        .catch((error) => {
            console.error(`Failed to enqueue task ${taskPayload.id}:`, error);
            updateTaskStatus(taskPayload.id, TASK_STATUS.FAILED, {
                result: null,
                error: error?.message || 'Failed to enqueue task'
            });
        });
}

function resumePendingTasks() {
    const pendingTasks = getTasksByStatuses([TASK_STATUS.PENDING, TASK_STATUS.RUNNING]);

    pendingTasks.forEach((task) => {
        if (task.status === TASK_STATUS.RUNNING) {
            updateTaskStatus(task.id, TASK_STATUS.PENDING, { result: task.result, error: null });
            task.status = TASK_STATUS.PENDING;
        }

        enqueueTask(task);
    });
}

export function initializeTaskQueue() {
    if (initialized) {
        return;
    }

    initialized = true;
    resumePendingTasks();
}

export function scheduleScanTorrentsTask({ animeId, wipePrevious = false }) {
    if (!animeId) {
        throw new Error('animeId is required to schedule scan task');
    }

    const activeTask = getActiveTaskForAnime(animeId);
    if (activeTask) {
        return activeTask;
    }

    const task = createTask({
        type: TASK_TYPES.SCAN_TORRENTS,
        animeId,
        payload: { wipePrevious: Boolean(wipePrevious) }
    });

    enqueueTask(task);
    return task;
}

export function scheduleUpdateQuarterTask({ quarter, year }) {
    if (!quarter || !year) {
        throw new Error('quarter and year are required to schedule update task');
    }

    const normalizedQuarter = String(quarter).toUpperCase();
    const yearNum = parseInt(year, 10);

    if (['Q1', 'Q2', 'Q3', 'Q4'].includes(normalizedQuarter) === false) {
        throw new Error('Invalid quarter supplied');
    }

    if (Number.isNaN(yearNum)) {
        throw new Error('Invalid year supplied');
    }

    const activeTasks = getTasksByStatuses([TASK_STATUS.PENDING, TASK_STATUS.RUNNING]);
    const existingTask = activeTasks.find(
        (task) =>
            task.type === TASK_TYPES.UPDATE_QUARTER &&
            String(task.payload?.quarter || '').toUpperCase() === normalizedQuarter &&
            parseInt(task.payload?.year, 10) === yearNum
    );

    if (existingTask) {
        return existingTask;
    }

    const task = createTask({
        type: TASK_TYPES.UPDATE_QUARTER,
        payload: {
            quarter: normalizedQuarter,
            year: yearNum
        }
    });

    enqueueTask(task);
    return task;
}

export function scheduleScanFolderTask({ folderPath }) {
    if (!folderPath || typeof folderPath !== 'string') {
        throw new Error('folderPath is required to schedule scan folder task');
    }

    const activeTasks = getTasksByStatuses([TASK_STATUS.PENDING, TASK_STATUS.RUNNING]);
    const existingTask = activeTasks.find(
        (task) =>
            task.type === TASK_TYPES.SCAN_FOLDER &&
            task.payload?.folderPath === folderPath
    );

    if (existingTask) {
        return existingTask;
    }

    const task = createTask({
        type: TASK_TYPES.SCAN_FOLDER,
        payload: {
            folderPath
        }
    });

    enqueueTask(task);
    return task;
}

export function scheduleScanAutodownloadTask() {
    const activeTasks = getTasksByStatuses([TASK_STATUS.PENDING, TASK_STATUS.RUNNING]);
    const existingTask = activeTasks.find(
        (task) => task.type === TASK_TYPES.SCAN_AUTODOWNLOAD
    );

    if (existingTask) {
        return existingTask;
    }

    const task = createTask({
        type: TASK_TYPES.SCAN_AUTODOWNLOAD,
        payload: {}
    });

    enqueueTask(task);
    return task;
}

export function scheduleQueueAutodownloadTask() {
    const activeTasks = getTasksByStatuses([TASK_STATUS.PENDING, TASK_STATUS.RUNNING]);
    const existingTask = activeTasks.find(
        (task) => task.type === TASK_TYPES.QUEUE_AUTODOWNLOAD
    );

    if (existingTask) {
        return existingTask;
    }

    const task = createTask({
        type: TASK_TYPES.QUEUE_AUTODOWNLOAD,
        payload: {}
    });

    enqueueTask(task);
    return task;
}

export { getTaskById, getActiveTaskForAnime, TASK_STATUS, TASK_TYPES };


