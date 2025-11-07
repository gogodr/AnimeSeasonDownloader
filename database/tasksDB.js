import { randomUUID } from 'crypto';
import { getDB } from './animeDB.js';

export const TASK_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

export const TASK_TYPES = {
    SCAN_TORRENTS: 'SCAN_TORRENTS'
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


