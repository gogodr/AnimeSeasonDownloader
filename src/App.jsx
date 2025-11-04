import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Shared/components/Sidebar';
import AdminView from './Admin/AdminView';
import SeasonView from './Season/SeasonView';
import AnimeView from './Anime/AnimeView';
import './App.css';

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

function App() {
  const today = new Date();
  const currentSeason = getCurrentSeason();
  const currentYear = today.getFullYear();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdminView = location.pathname === '/admin';
  const isAnimeView = location.pathname.startsWith('/anime/');

  // Close sidebar when entering anime view
  useEffect(() => {
    if (isAnimeView) {
      setSidebarOpen(false);
    }
  }, [isAnimeView]);

  // Get current season and year from URL or default to current
  const getCurrentParams = () => {
    if (location.pathname.startsWith('/admin')) {
      return null;
    }
    const pathMatch = location.pathname.match(/\/(\d{4})\/(\w+)/);
    if (pathMatch) {
      return { year: pathMatch[1], season: pathMatch[2].toUpperCase() };
    }
    return { year: currentYear, season: currentSeason };
  };

  const currentParams = getCurrentParams();
  const selectedSeason = currentParams?.season || currentSeason;
  const selectedYear = currentParams?.year || currentYear;
  console.log(currentParams);
  console.log(selectedSeason, selectedYear);

  const handleSeasonSelect = (season, year) => {
    navigate(`/${year}/${season}`);
    setSidebarOpen(false);
  };

  const handleAdminSelect = () => {
    navigate('/admin');
    setSidebarOpen(false);
  };

  return (
    <div className="app">
      {!isAnimeView && (
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
      )}
      {!isAnimeView && (
        <Sidebar
          selectedSeason={selectedSeason}
          selectedYear={selectedYear}
          onSeasonSelect={handleSeasonSelect}
          onAdminSelect={handleAdminSelect}
          isAdminView={isAdminView}
          isOpen={sidebarOpen}
        />
      )}
      <div className={`main-content ${isAnimeView ? 'anime-view' : ''}`} onClick={() => sidebarOpen && setSidebarOpen(false)}>
        <div key={location.pathname} className="page-transition">
          <Routes>
            <Route path="/admin" element={<AdminView />} />
            <Route path="/anime/:id" element={<AnimeView />} />
            <Route path="/:year/:season" element={<SeasonView />} />
            <Route 
              path="/" 
              element={<Navigate to={`/${currentYear}/${currentSeason}`} replace />} 
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
