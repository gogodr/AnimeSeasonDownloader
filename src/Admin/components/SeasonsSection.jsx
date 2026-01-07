import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatQuarterWithSeason } from '../../../config/constants.js';
import './SeasonsSection.css';

function QuartersSection({ onQuarterAdded }) {
  const [quarters, setQuarters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState({});
  const [deleting, setDeleting] = useState({});
  const [addingQuarter, setAddingQuarter] = useState(false);
  const [newQuarter, setNewQuarter] = useState('Q2');
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [taskStatuses, setTaskStatuses] = useState({});
  const taskPollRef = useRef(null);

  const fetchQuarters = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/quarters');
      if (!response.ok) {
        throw new Error('Failed to fetch quarters data');
      }
      const data = await response.json();
      setQuarters(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching quarters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTaskStatuses = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/tasks?statuses=pending,running&limit=100');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch task statuses');
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        return;
      }

      const statusMap = data.reduce((acc, task) => {
        if (task?.type === 'UPDATE_QUARTER') {
          const quarter = task?.payload?.quarter;
          const year = task?.payload?.year;
          const status = task?.status;
          if (quarter && year && status) {
            const key = `${quarter}-${year}`;
            acc[key] = status;
          }
        }
        return acc;
      }, {});

      setTaskStatuses(statusMap);
    } catch (err) {
      console.error('Error fetching quarter task statuses:', err);
    }
  }, []);

  useEffect(() => {
    fetchQuarters();
    fetchTaskStatuses();

    if (taskPollRef.current) {
      clearInterval(taskPollRef.current);
    }

    taskPollRef.current = setInterval(() => {
      fetchTaskStatuses();
    }, 5000);

    return () => {
      if (taskPollRef.current) {
        clearInterval(taskPollRef.current);
        taskPollRef.current = null;
      }
    };
  }, [fetchQuarters, fetchTaskStatuses]);

  const addOrUpdateQuarter = async (quarter, year, isAdding = false) => {
    const key = `${quarter}-${year}`;
    try {
      if (isAdding) {
        setAddingQuarter(true);
      } else {
        setUpdating((prev) => ({ ...prev, [key]: true }));
      }

      const response = await fetch('/api/admin/update-quarter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quarter, year }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update quarter');
      }

      const result = await response.json();
      const baseMessage = result.message || (isAdding ? 'Quarter update scheduled successfully' : 'Quarter update queued successfully');
      const taskSuffix = result.taskId ? ` (Task ID: ${result.taskId})` : '';
      
      // If onQuarterAdded callback is provided, call it instead of showing alert
      if (isAdding && onQuarterAdded) {
        onQuarterAdded(normalizedQuarter, yearNum);
      } else {
        alert(`${baseMessage}${taskSuffix}. Check the Background Tasks panel for status updates.`);
      }
      
      await fetchQuarters();
      await fetchTaskStatuses();
      
      if (isAdding) {
        setNewQuarter('Q2');
        setNewYear(new Date().getFullYear());
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error updating quarter:', err);
    } finally {
      if (isAdding) {
        setAddingQuarter(false);
      } else {
        setUpdating((prev) => ({ ...prev, [key]: false }));
      }
    }
  };

  const updateQuarter = async (quarter, year) => {
    await addOrUpdateQuarter(quarter, year, false);
  };

  const handleAddQuarter = async (e) => {
    e.preventDefault();
    await addOrUpdateQuarter(newQuarter, newYear, true);
  };

  const deleteQuarter = async (quarter, year) => {
    const key = `${quarter}-${year}`;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${formatQuarterWithSeason(quarter)} ${year}?\n\n` +
      `This will permanently delete:\n` +
      `- All animes in this quarter\n` +
      `- All episodes for those animes\n` +
      `- All torrents for those episodes\n` +
      `- All alternate titles for those animes\n\n` +
      `This action cannot be undone!`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting((prev) => ({ ...prev, [key]: true }));

      const response = await fetch(`/api/admin/quarters/${quarter}/${year}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete quarter');
      }

      const result = await response.json();
      alert(`Successfully deleted ${formatQuarterWithSeason(quarter)} ${year}${result.deletedAnimes ? ` (${result.deletedAnimes} animes removed)` : ''}`);
      
      await fetchQuarters();
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error deleting quarter:', err);
    } finally {
      setDeleting((prev) => ({ ...prev, [key]: false }));
    }
  };


  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="seasons-section">
        <h3 className="section-title">Quarters</h3>
        <div className="loading">Loading quarters data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="seasons-section">
        <h3 className="section-title">Quarters</h3>
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={fetchQuarters} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <h3 className="section-title">Anime Seasons</h3>
      
      <div className="add-season-form-container">
        <h4 className="add-season-title">Add New Season</h4>
        <form onSubmit={handleAddQuarter} className="add-season-form">
          <div className="form-group">
            <label htmlFor="quarter-select">Quarter:</label>
            <select
              id="quarter-select"
              value={newQuarter}
              onChange={(e) => setNewQuarter(e.target.value)}
              className="season-select"
              disabled={addingQuarter}
              required
            >
              <option value="Q1">Q1 (Winter)</option>
              <option value="Q2">Q2 (Spring)</option>
              <option value="Q3">Q3 (Summer)</option>
              <option value="Q4">Q4 (Fall)</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="year-input">Year:</label>
            <input
              id="year-input"
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(parseInt(e.target.value) || new Date().getFullYear())}
              className="year-input"
              min="2000"
              max={new Date().getFullYear() + 10}
              disabled={addingQuarter}
              required
            />
          </div>
          <button
            type="submit"
            disabled={addingQuarter}
            className={`add-season-button ${addingQuarter ? 'adding' : ''}`}
          >
            {addingQuarter ? 'Adding & Fetching...' : 'Add Season & Fetch Data'}
          </button>
        </form>
      </div>

      {quarters.length === 0 ? (
        <div className="no-data">No seasons data found.</div>
      ) : (
        <table className="seasons-table">
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Year</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((item, index) => {
              const key = `${item.quarter}-${item.year}`;
              const isUpdating = updating[key] || false;
              const isDeleting = deleting[key] || false;
              const taskStatus = taskStatuses[key];
              const isTaskActive = taskStatus === 'pending' || taskStatus === 'running';
              const buttonDisabled = isUpdating || isTaskActive || isDeleting;
              let buttonLabel = isUpdating ? 'Updating...' : 'Update';

              if (isTaskActive) {
                buttonLabel = taskStatus === 'pending' ? 'Pending…' : 'Running…';
              }

              return (
                <tr key={index}>
                  <td>{formatQuarterWithSeason(item.quarter)}</td>
                  <td>{item.year}</td>
                  <td>{formatDate(item.lastFetched)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        onClick={() => updateQuarter(item.quarter, item.year)}
                        disabled={buttonDisabled}
                        className={`update-button ${buttonDisabled ? 'updating' : ''}`}
                      >
                        {buttonLabel}
                      </button>
                      <button
                        onClick={() => deleteQuarter(item.quarter, item.year)}
                        disabled={buttonDisabled}
                        className={`delete-button ${isDeleting ? 'deleting' : ''}`}
                        title="Delete this season and all associated data"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default QuartersSection;

