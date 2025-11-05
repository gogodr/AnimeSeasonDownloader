import React, { useState, useEffect } from 'react';
import { formatQuarterWithSeason } from '../../../config/constants.js';
import './SeasonsSection.css';

function QuartersSection() {
  const [quarters, setQuarters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState({});
  const [addingQuarter, setAddingQuarter] = useState(false);
  const [newQuarter, setNewQuarter] = useState('Q2');
  const [newYear, setNewYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchQuarters();
  }, []);

  const fetchQuarters = async () => {
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
  };

  const addOrUpdateQuarter = async (quarter, year, isAdding = false) => {
    const key = `${quarter}-${year}`;
    try {
      if (isAdding) {
        setAddingQuarter(true);
      } else {
        setUpdating({ ...updating, [key]: true });
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
      alert(result.message || (isAdding ? 'Quarter added and data fetched successfully' : 'Quarter updated successfully'));
      
      await fetchQuarters();
      
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
        setUpdating({ ...updating, [key]: false });
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
      <h3 className="section-title">Quarters</h3>
      
      <div className="add-season-form-container">
        <h4 className="add-season-title">Add New Quarter</h4>
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
            {addingQuarter ? 'Adding & Fetching...' : 'Add Quarter & Fetch Data'}
          </button>
        </form>
      </div>

      {quarters.length === 0 ? (
        <div className="no-data">No quarters data found.</div>
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
              return (
                <tr key={index}>
                  <td>{formatQuarterWithSeason(item.quarter)}</td>
                  <td>{item.year}</td>
                  <td>{formatDate(item.lastFetched)}</td>
                  <td>
                    <button
                      onClick={() => updateQuarter(item.quarter, item.year)}
                      disabled={isUpdating}
                      className={`update-button ${isUpdating ? 'updating' : ''}`}
                    >
                      {isUpdating ? 'Updating...' : 'Update'}
                    </button>
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

