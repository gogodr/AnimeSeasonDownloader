import PQueue from 'p-queue';
import { scanAnimeTorrents } from './animeService.js';
import {
    createTask,
    getTaskById,
    getTasksByStatuses,
    getActiveTaskForAnime,
    updateTaskStatus,
    TASK_STATUS,
    TASK_TYPES
} from '../database/tasksDB.js';

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
                const result = await scanAnimeTorrents(task.animeId, wipePrevious);

                updateTaskStatus(task.id, TASK_STATUS.COMPLETED, {
                    result: {
                        message: result.message,
                        torrentsFound: result.torrentsFound,
                        deletedCount: result.deletedCount
                    },
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

export { getTaskById, getActiveTaskForAnime, TASK_STATUS, TASK_TYPES };


