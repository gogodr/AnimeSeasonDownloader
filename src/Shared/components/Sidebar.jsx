import React from 'react';
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

/**
 * Gets the previous quarter and year
 */
function getPreviousQuarter(quarter, year) {
  const quarterMap = {
    'Q1': { quarter: 'Q4', year: year - 1 },
    'Q2': { quarter: 'Q1', year: year },
    'Q3': { quarter: 'Q2', year: year },
    'Q4': { quarter: 'Q3', year: year }
  };
  return quarterMap[quarter] || { quarter: 'Q3', year: year };
}

/**
 * Generates list of quarters (current + previous 3)
 */
function getQuarterList() {
  const today = new Date();
  const currentQuarter = getCurrentQuarter();
  const currentYear = today.getFullYear();
  
  const quarters = [
    { quarter: currentQuarter, year: currentYear, label: `${currentQuarter} ${currentYear}`, isCurrent: true }
  ];
  
  let quarter = currentQuarter;
  let year = currentYear;
  
  for (let i = 0; i < 3; i++) {
    const prev = getPreviousQuarter(quarter, year);
    quarters.push({
      quarter: prev.quarter,
      year: prev.year,
      label: `${prev.quarter} ${prev.year}`,
      isCurrent: false
    });
    quarter = prev.quarter;
    year = prev.year;
  }
  
  return quarters;
}

function Sidebar({ selectedQuarter, selectedYear, onQuarterSelect, onAdminSelect, isAdminView = false, isOpen = false }) {
  const quarters = getQuarterList();
  
  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <h2 className="sidebar-title">Anime Seasons</h2>
      <ul className="season-list">
        {quarters.map((item, index) => {
          const isSelected = !isAdminView && item.quarter === selectedQuarter && item.year === parseInt(selectedYear);
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

