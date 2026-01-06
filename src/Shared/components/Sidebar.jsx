import React, { useState, useEffect, useCallback } from 'react';
import { formatQuarterWithSeason } from '../../../config/constants.js';
import './Sidebar.css';

/**
 * Determines current quarter based on date
 * Q1 = Winter (Jan-Mar), Q2 = Spring (Apr-Jun), Q3 = Summer (Jul-Sep), Q4 = Fall (Oct-Dec)
 * @returns {string} Current quarter (Q1, Q2, Q3, Q4)
 */
function getCurrentQuarter() {
  const today = new Date();
  const month = today.getMonth();
  if (month < 3) return "Q1";      // Jan-Mar (Winter)
  if (month < 6) return "Q2";      // Apr-Jun (Spring)
  if (month < 9) return "Q3";      // Jul-Sep (Summer)
  return "Q4";                      // Oct-Dec (Fall)
}

function Sidebar({ selectedQuarter, selectedYear, onQuarterSelect, onConfigSelect, onAdminSelect, onTorrentSelect, onAutoDownloadSelect, isConfigView = false, isAdminView = false, isTorrentView = false, isAutoDownloadView = false, isOpen = false }) {
  const [quarters, setQuarters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchQuarters = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/quarters');
      if (!response.ok) {
        throw new Error('Failed to fetch quarters data');
      }
      const data = await response.json();
      
      // Determine current quarter and year
      const today = new Date();
      const currentQuarter = getCurrentQuarter();
      const currentYear = today.getFullYear();
      
      // Map the data and mark current quarter
      const quartersWithCurrent = data.map(item => ({
        quarter: item.quarter,
        year: item.year,
        label: `${item.quarter} ${item.year}`,
        isCurrent: item.quarter === currentQuarter && item.year === currentYear
      }));
      
      setQuarters(quartersWithCurrent);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching quarters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuarters();
  }, [fetchQuarters]);
  
  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <h2 className="sidebar-title">Anime Seasons</h2>
      {loading ? (
        <div className="sidebar-loading">Loading quarters...</div>
      ) : error ? (
        <div className="sidebar-error">
          <p>Error loading quarters</p>
          <button onClick={fetchQuarters} className="retry-button">Retry</button>
        </div>
      ) : quarters.length === 0 ? (
        <div className="sidebar-empty">
          <button onClick={onAdminSelect} className="add-season-button">
            Add a Season
          </button>
        </div>
      ) : (
        <ul className="season-list">
          {quarters.map((item, index) => {
            const isSelected = !isAdminView && !isConfigView && !isTorrentView && !isAutoDownloadView && item.quarter === selectedQuarter && item.year === parseInt(selectedYear);
            return (
              <li key={index} className={isSelected ? 'season-item selected' : 'season-item'}>
                <button
                  onClick={() => onQuarterSelect(item.quarter, item.year)}
                  className="season-link"
                >
                  <span className="season-name">{formatQuarterWithSeason(item.quarter)}</span>
                  <span className="season-year">{item.year}</span>
                  {item.isCurrent && <span className="current-badge">Current</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="sidebar-footer">
        <button
          onClick={onAutoDownloadSelect}
          className={`auto-download-link ${isAutoDownloadView ? 'selected' : ''}`}
        >
          Auto-Download
        </button>
        <button
          onClick={onConfigSelect}
          className={`config-link ${isConfigView ? 'selected' : ''}`}
        >
          Configuration
        </button>
        <button
          onClick={onAdminSelect}
          className={`admin-link ${isAdminView ? 'selected' : ''}`}
        >
          Admin Panel
        </button>
        <button
          onClick={onTorrentSelect}
          className={`torrent-link ${isTorrentView ? 'selected' : ''}`}
        >
          Torrents
        </button>
      </div>
    </div>
  );
}

export default Sidebar;

