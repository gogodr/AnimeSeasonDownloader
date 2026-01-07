import { randomUUID } from 'crypto';
import { getDB } from './animeDB.js';

export const TASK_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

export const TASK_TYPES = {
    SCAN_TORRENTS: 'SCAN_TORRENTS',
    UPDATE_QUARTER: 'UPDATE_QUARTER',
    SCAN_FOLDER: 'SCAN_FOLDER',
    SCAN_AUTODOWNLOAD: 'SCAN_AUTODOWNLOAD',
    QUEUE_AUTODOWNLOAD: 'QUEUE_AUTODOWNLOAD'
};

function parseValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const trimmed = typeof value === 'string' ? value.trim() : value;

    if (typeof trimmed !== 'string') {
        return trimmed;
    }

    if (trimmed === '') {
        return null;
    }

    try {
        return JSON.parse(trimmed);
    } catch (error) {
        return trimmed;
    }
}

function serializeValue(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'string') {
        return value;
    }

    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value);
    }
}

function mapTaskRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        type: row.type,
        status: row.status,
        animeId: row.anime_id,
        payload: parseValue(row.payload),
        result: parseValue(row.result),
        error: row.error || null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

export function createTask({ type, animeId = null, payload = null }) {
    if (!type) {
        throw new Error('Task type is required');
    }

    const database = getDB();
    const id = randomUUID();
    const now = Date.now();
    const payloadSerialized = serializeValue(payload);

    const insertStmt = database.prepare(`
        INSERT INTO tasks (
            id, type, status, anime_id, payload, result, error, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `);

    insertStmt.run(id, type, TASK_STATUS.PENDING, animeId ?? null, payloadSerialized, now, now);

    return getTaskById(id);
}

export function getTaskById(id) {
    if (!id) {
        return null;
    }

    const database = getDB();
    const selectStmt = database.prepare(`
        SELECT * FROM tasks WHERE id = ?
    `);

    const row = selectStmt.get(id);
    return mapTaskRow(row);
}

export function updateTaskStatus(id, status, { result, error } = {}) {
    if (!id) {
        throw new Error('Task ID is required');
    }

    if (!status) {
        throw new Error('Task status is required');
    }

    const database = getDB();
    const now = Date.now();

    const currentTask = getTaskById(id);
    if (!currentTask) {
        throw new Error(`Task with ID ${id} not found`);
    }

    const nextResult = result === undefined ? currentTask.result : result;
    const nextError = error === undefined ? currentTask.error : error;

    const updateStmt = database.prepare(`
        UPDATE tasks
        SET status = ?, result = ?, error = ?, updatedAt = ?
        WHERE id = ?
    `);

    updateStmt.run(
        status,
        serializeValue(nextResult),
        nextError === null || nextError === undefined ? null : String(nextError),
        now,
        id
    );

    return getTaskById(id);
}

export function getTasksByStatuses(statuses = []) {
    if (!Array.isArray(statuses) || statuses.length === 0) {
        return [];
    }

    const database = getDB();
    const placeholders = statuses.map(() => '?').join(', ');
    const selectStmt = database.prepare(`
        SELECT * FROM tasks
        WHERE status IN (${placeholders})
        ORDER BY createdAt ASC
    `);

    const rows = selectStmt.all(...statuses);
    return rows.map(mapTaskRow);
}

export function getActiveTaskForAnime(animeId) {
    if (!animeId) {
        return null;
    }

    const database = getDB();
    const selectStmt = database.prepare(`
        SELECT * FROM tasks
        WHERE anime_id = ?
          AND status IN (?, ?)
        ORDER BY createdAt DESC
        LIMIT 1
    `);

    const row = selectStmt.get(animeId, TASK_STATUS.PENDING, TASK_STATUS.RUNNING);
    return mapTaskRow(row);
}

export function getActiveQuarterUpdateTask(quarter, year, includeRecentCompleted = false) {
    if (!quarter || !year) {
        return null;
    }

    const normalizedQuarter = String(quarter).toUpperCase();
    const yearNum = parseInt(year, 10);

    if (Number.isNaN(yearNum)) {
        return null;
    }

    // Get all active tasks (pending or running)
    let tasksToCheck = getTasksByStatuses([TASK_STATUS.PENDING, TASK_STATUS.RUNNING]);
    
    // If requested, also check recently completed/failed tasks (within last 5 minutes)
    if (includeRecentCompleted) {
        const recentCompleted = getTasksByStatuses([TASK_STATUS.COMPLETED, TASK_STATUS.FAILED]);
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const recentTasks = recentCompleted.filter(task => 
            task.updatedAt && task.updatedAt > fiveMinutesAgo
        );
        tasksToCheck = [...tasksToCheck, ...recentTasks];
    }
    
    // Find the task matching the quarter and year
    const matchingTask = tasksToCheck.find(
        (task) =>
            task.type === TASK_TYPES.UPDATE_QUARTER &&
            String(task.payload?.quarter || '').toUpperCase() === normalizedQuarter &&
            parseInt(task.payload?.year, 10) === yearNum
    );

    return matchingTask || null;
}

export function getRecentTasks({ statuses = null, limit = 25 } = {}) {
    const database = getDB();
    const params = [];
    let query = `
        SELECT * FROM tasks
    `;

    if (Array.isArray(statuses) && statuses.length > 0) {
        const placeholders = statuses.map(() => '?').join(', ');
        query += ` WHERE status IN (${placeholders})`;
        params.push(...statuses);
    }

    query += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(typeof limit === 'number' && limit > 0 ? limit : 25);

    const selectStmt = database.prepare(query);
    const rows = selectStmt.all(...params);
    return rows.map(mapTaskRow);
}

/**
 * Deletes tasks with the specified statuses
 * @param {string[]} statuses - Array of statuses to delete (e.g., ['completed', 'failed'])
 * @returns {number} Number of deleted tasks
 */
export function deleteTasksByStatuses(statuses = []) {
    if (!Array.isArray(statuses) || statuses.length === 0) {
        return 0;
    }

    const database = getDB();
    const placeholders = statuses.map(() => '?').join(', ');
    const deleteStmt = database.prepare(`
        DELETE FROM tasks
        WHERE status IN (${placeholders})
    `);

    const result = deleteStmt.run(...statuses);
    return result.changes;
}


