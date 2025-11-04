import React, { useState, useEffect } from 'react';
import './SeasonsSection.css';

function SeasonsSection() {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState({});
  const [addingSeason, setAddingSeason] = useState(false);
  const [newSeason, setNewSeason] = useState('SPRING');
  const [newYear, setNewYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchSeasons();
  }, []);

  const fetchSeasons = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/seasons');
      if (!response.ok) {
        throw new Error('Failed to fetch seasons data');
      }
      const data = await response.json();
      setSeasons(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching seasons:', err);
    } finally {
      setLoading(false);
    }
  };

  const addOrUpdateSeason = async (season, year, isAdding = false) => {
    const key = `${season}-${year}`;
    try {
      if (isAdding) {
        setAddingSeason(true);
      } else {
        setUpdating({ ...updating, [key]: true });
      }

      const response = await fetch('/api/admin/update-season', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ season, year }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update season');
      }

      const result = await response.json();
      alert(result.message || (isAdding ? 'Season added and data fetched successfully' : 'Season updated successfully'));
      
      await fetchSeasons();
      
      if (isAdding) {
        setNewSeason('SPRING');
        setNewYear(new Date().getFullYear());
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error updating season:', err);
    } finally {
      if (isAdding) {
        setAddingSeason(false);
      } else {
        setUpdating({ ...updating, [key]: false });
      }
    }
  };

  const updateSeason = async (season, year) => {
    await addOrUpdateSeason(season, year, false);
  };

  const handleAddSeason = async (e) => {
    e.preventDefault();
    await addOrUpdateSeason(newSeason, newYear, true);
  };

  const formatSeasonName = (season) => {
    return season.charAt(0) + season.slice(1).toLowerCase();
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
        <h3 className="section-title">Seasons</h3>
        <div className="loading">Loading seasons data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="seasons-section">
        <h3 className="section-title">Seasons</h3>
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={fetchSeasons} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <h3 className="section-title">Seasons</h3>
      
      <div className="add-season-form-container">
        <h4 className="add-season-title">Add New Season</h4>
        <form onSubmit={handleAddSeason} className="add-season-form">
          <div className="form-group">
            <label htmlFor="season-select">Season:</label>
            <select
              id="season-select"
              value={newSeason}
              onChange={(e) => setNewSeason(e.target.value)}
              className="season-select"
              disabled={addingSeason}
              required
            >
              <option value="WINTER">Winter</option>
              <option value="SPRING">Spring</option>
              <option value="SUMMER">Summer</option>
              <option value="FALL">Fall</option>
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
              disabled={addingSeason}
              required
            />
          </div>
          <button
            type="submit"
            disabled={addingSeason}
            className={`add-season-button ${addingSeason ? 'adding' : ''}`}
          >
            {addingSeason ? 'Adding & Fetching...' : 'Add Season & Fetch Data'}
          </button>
        </form>
      </div>

      {seasons.length === 0 ? (
        <div className="no-data">No seasons data found.</div>
      ) : (
        <table className="seasons-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>Year</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((item, index) => {
              const key = `${item.season}-${item.year}`;
              const isUpdating = updating[key] || false;
              return (
                <tr key={index}>
                  <td>{formatSeasonName(item.season)}</td>
                  <td>{item.year}</td>
                  <td>{formatDate(item.lastFetched)}</td>
                  <td>
                    <button
                      onClick={() => updateSeason(item.season, item.year)}
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

export default SeasonsSection;

