import React from 'react';
import './Sidebar.css';

/**
 * Determines current season based on date
 * @returns {string} Current season
 */
function getCurrentSeason() {
  const today = new Date();
  const month = today.getMonth();
  if (month < 2) return "WINTER";
  if (month < 5) return "SPRING";
  if (month < 8) return "SUMMER";
  return "FALL";
}

/**
 * Gets the previous season and year
 */
function getPreviousSeason(season, year) {
  const seasonMap = {
    'WINTER': { season: 'FALL', year: year - 1 },
    'SPRING': { season: 'WINTER', year: year },
    'SUMMER': { season: 'SPRING', year: year },
    'FALL': { season: 'SUMMER', year: year }
  };
  return seasonMap[season] || { season: 'SUMMER', year: year };
}

/**
 * Generates list of seasons (current + previous 3)
 */
function getSeasonList() {
  const today = new Date();
  const currentSeason = getCurrentSeason();
  const currentYear = today.getFullYear();
  
  const seasons = [
    { season: currentSeason, year: currentYear, label: `${currentSeason} ${currentYear}`, isCurrent: true }
  ];
  
  let season = currentSeason;
  let year = currentYear;
  
  for (let i = 0; i < 3; i++) {
    const prev = getPreviousSeason(season, year);
    seasons.push({
      season: prev.season,
      year: prev.year,
      label: `${prev.season} ${prev.year}`,
      isCurrent: false
    });
    season = prev.season;
    year = prev.year;
  }
  
  return seasons;
}

function Sidebar({ selectedSeason, selectedYear, onSeasonSelect, onAdminSelect, isAdminView = false, isOpen = false }) {
  const seasons = getSeasonList();
  
  const formatSeasonName = (season) => {
    return season.charAt(0) + season.slice(1).toLowerCase();
  };
  
  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <h2 className="sidebar-title">Seasons</h2>
      <ul className="season-list">
        {seasons.map((item, index) => {
          const isSelected = !isAdminView && item.season === selectedSeason && item.year === parseInt(selectedYear);
          return (
            <li key={index} className={isSelected ? 'season-item selected' : 'season-item'}>
              <button
                onClick={() => onSeasonSelect(item.season, item.year)}
                className="season-link"
              >
                <span className="season-name">{formatSeasonName(item.season)}</span>
                <span className="season-year">{item.year}</span>
                {item.isCurrent && <span className="current-badge">Current</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sidebar-footer">
        <button
          onClick={onAdminSelect}
          className={`admin-link ${isAdminView ? 'selected' : ''}`}
        >
          Admin Panel
        </button>
      </div>
    </div>
  );
}

export default Sidebar;

