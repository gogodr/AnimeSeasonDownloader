import React, { useEffect, useRef, useState } from 'react';
import './TasksMonitor.css';

const POLL_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes

const STATUS_LABELS = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed'
};

const STATUS_CLASS_MAP = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed'
};

const TASK_TYPE_LABELS = {
  SCAN_TORRENTS: 'Scan Torrents',
  UPDATE_QUARTER: 'Update Quarter'
};

function formatDateTime(isoString) {
  if (!isoString) {
    return '—';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getStatusClass(status) {
  return STATUS_CLASS_MAP[status] || 'unknown';
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function getTaskTypeLabel(type) {
  return TASK_TYPE_LABELS[type] || type;
}

function renderTaskDetails(task) {
  const details = [];

  if (task.type === 'UPDATE_QUARTER') {
    const quarter = task.payload?.quarter;
    const year = task.payload?.year;
    if (quarter && year) {
      details.push(`Quarter: ${quarter} ${year}`);
    }
    if (typeof task.result?.animeCount === 'number') {
      details.push(`Anime processed: ${task.result.animeCount}`);
    }
  }

  if (task.type === 'SCAN_TORRENTS' && task.animeId) {
    details.push(`Anime ID: ${task.animeId}`);
    if (typeof task.result?.torrentsFound === 'number') {
      details.push(`Torrents found: ${task.result.torrentsFound}`);
    }
  }

  if (task.result?.message) {
    details.push(task.result.message);
  }

  if (task.error) {
    details.push(`Error: ${task.error}`);
  }

  if (details.length === 0) {
    return <span className="tasks-monitor__detail-line">No additional details</span>;
  }

  return details.map((detail, index) => (
    <span key={`${task.id}-detail-${index}`} className="tasks-monitor__detail-line">
      {detail}
    </span>
  ));
}

function TasksMonitor() {
  const [tasks, setTasks] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const abortRef = useRef(null);
  const timeoutRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let isActive = true;

    const fetchTasks = async () => {
      if (!isActive) {
        return;
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setIsPolling(true);
        const response = await fetch('/api/admin/tasks?limit=20', { signal: controller.signal });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch tasks');
        }

        const data = await response.json();

        if (!isActive) {
          return;
        }

        const list = Array.isArray(data) ? data : [];
        setTasks(list);
        setError(null);
        setLastUpdated(Date.now());
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }

        if (!isActive) {
          return;
        }

        console.error('Error polling tasks:', err);
        setError(err.message || 'Failed to fetch tasks');
      } finally {
        if (isActive) {
          setIsPolling(false);
        }
      }
    };

    const scheduleNextPoll = () => {
      if (!isActive) {
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        pollRef.current?.();
      }, POLL_INTERVAL_MS);
    };

    pollRef.current = async () => {
      if (!isActive) {
        return;
      }

      await fetchTasks();
      scheduleNextPoll();
    };

    pollRef.current();

    return () => {
      isActive = false;

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handleManualRefresh = () => {
    if (pollRef.current) {
      pollRef.current();
    }
  };

  const activeTaskCount = tasks.filter((task) => task.status === 'pending' || task.status === 'running').length;

  const formattedLastUpdated = lastUpdated ? formatDateTime(new Date(lastUpdated).toISOString()) : 'Never';

  // Pagination logic
  const TASKS_PER_PAGE = 5;
  const totalPages = Math.ceil(tasks.length / TASKS_PER_PAGE);
  const startIndex = (currentPage - 1) * TASKS_PER_PAGE;
  const endIndex = startIndex + TASKS_PER_PAGE;
  const paginatedTasks = tasks.slice(startIndex, endIndex);

  // Reset to page 1 if current page is out of bounds
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="tasks-monitor">
      <div className="tasks-monitor__header">
        <div className="tasks-monitor__intro">
          <h3 className="section-title">Background Tasks</h3>
          <p className="tasks-monitor__subtitle">
            Monitoring queued jobs. Automatically refreshes every {Math.round(POLL_INTERVAL_MS / 1000 / 60)} minutes.
          </p>
        </div>
        <div className="tasks-monitor__header-actions">
          <div className="tasks-monitor__status-group">
            <span className={`tasks-monitor__badge ${isPolling ? 'polling' : 'idle'}`}>
              {isPolling ? 'Updating…' : `Last updated: ${formattedLastUpdated}`}
            </span>
            <span className="tasks-monitor__badge neutral">Active: {activeTaskCount}</span>
          </div>
          <button
            type="button"
            className="tasks-monitor__refresh-button"
            onClick={handleManualRefresh}
            disabled={isPolling}
          >
            {isPolling ? 'Refreshing…' : 'Refresh Now'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="tasks-monitor__error">
          <span>{error}</span>
          <button type="button" onClick={handleManualRefresh} className="tasks-monitor__retry-button">
            Retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="tasks-monitor__empty">No background tasks yet.</div>
      ) : (
        <>
          <div className="tasks-monitor__table-wrapper">
            <table className="tasks-monitor__table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Details</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <div className="tasks-monitor__task-id">{task.id}</div>
                      <div className="tasks-monitor__task-type">{getTaskTypeLabel(task.type)}</div>
                    </td>
                    <td>
                      <span className={`tasks-monitor__status tasks-monitor__status--${getStatusClass(task.status)}`}>
                        {getStatusLabel(task.status)}
                      </span>
                    </td>
                    <td className="tasks-monitor__details">{renderTaskDetails(task)}</td>
                    <td>{formatDateTime(task.createdAt)}</td>
                    <td>{formatDateTime(task.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="tasks-monitor__pagination">
              <button
                type="button"
                className="tasks-monitor__pagination-button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <div className="tasks-monitor__pagination-info">
                Page {currentPage} of {totalPages} ({tasks.length} total tasks)
              </div>
              <button
                type="button"
                className="tasks-monitor__pagination-button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default TasksMonitor;


