import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Shared/components/Sidebar';
import AdminView from './Admin/AdminView';
import ConfigurationView from './Configuration/ConfigurationView';
import QuarterView from './Quarter/QuarterView';
import AnimeView from './Anime/AnimeView';
import TorrentView from './Torrent/TorrentView';
import AutoDownloadView from './AutoDownload/AutoDownloadView';
import SetupView from './Setup/SetupView';
import './App.css';

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

function App() {
  const today = new Date();
  const currentQuarter = getCurrentQuarter();
  const currentYear = today.getFullYear();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [setup, setSetup] = useState(null);
  const [loadingSetup, setLoadingSetup] = useState(true);

  const isAdminView = location.pathname === '/admin';
  const isConfigView = location.pathname === '/config';
  const isTorrentView = location.pathname === '/torrents';
  const isAutoDownloadView = location.pathname === '/auto-download';
  const isAnimeView = location.pathname.startsWith('/anime/');

  // Check setup status on mount
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const response = await fetch('/api/admin/config');
        if (response.ok) {
          const data = await response.json();
          setSetup(data.setup !== undefined ? data.setup : true);
        } else {
          setSetup(true); // Default to true if error
        }
      } catch (err) {
        console.error('Error checking setup status:', err);
        setSetup(true); // Default to true if error
      } finally {
        setLoadingSetup(false);
      }
    };
    checkSetup();
  }, []);

  // Close sidebar when entering anime view
  useEffect(() => {
    if (isAnimeView) {
      setSidebarOpen(false);
    }
  }, [isAnimeView]);

  // Get current quarter and year from URL or default to current
  const getCurrentParams = () => {
    if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/config') || location.pathname.startsWith('/torrents') || location.pathname.startsWith('/auto-download')) {
      return null;
    }
    const pathMatch = location.pathname.match(/\/(\d{4})\/(\w+)/);
    if (pathMatch) {
      return { year: pathMatch[1], quarter: pathMatch[2].toUpperCase() };
    }
    return { year: currentYear, quarter: currentQuarter };
  };

  const currentParams = getCurrentParams();
  const selectedQuarter = currentParams?.quarter || currentQuarter;
  const selectedYear = currentParams?.year || currentYear;
  console.log(currentParams);
  console.log(selectedQuarter, selectedYear);

  const handleQuarterSelect = (quarter, year) => {
    navigate(`/${year}/${quarter}`);
    setSidebarOpen(false);
  };

  const handleConfigSelect = () => {
    navigate('/config');
    setSidebarOpen(false);
  };

  const handleAdminSelect = () => {
    navigate('/admin');
    setSidebarOpen(false);
  };

  const handleTorrentSelect = () => {
    navigate('/torrents');
    setSidebarOpen(false);
  };

  const handleAutoDownloadSelect = () => {
    navigate('/auto-download');
    setSidebarOpen(false);
  };

  // Show setup view if setup is true
  if (loadingSetup) {
    return (
      <div className="app">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (setup === true) {
    return <SetupView />;
  }

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
          selectedQuarter={selectedQuarter}
          selectedYear={selectedYear}
          onQuarterSelect={handleQuarterSelect}
          onConfigSelect={handleConfigSelect}
          onAdminSelect={handleAdminSelect}
          onTorrentSelect={handleTorrentSelect}
          onAutoDownloadSelect={handleAutoDownloadSelect}
          isConfigView={isConfigView}
          isAdminView={isAdminView}
          isTorrentView={isTorrentView}
          isAutoDownloadView={isAutoDownloadView}
          isOpen={sidebarOpen}
        />
      )}
      <div className={`main-content ${isAnimeView ? 'anime-view' : ''}`} onClick={() => sidebarOpen && setSidebarOpen(false)}>
        <div key={location.pathname} className="page-transition">
          <Routes>
            <Route path="/admin" element={<AdminView />} />
            <Route path="/config" element={<ConfigurationView />} />
            <Route path="/torrents" element={<TorrentView />} />
            <Route path="/auto-download" element={<AutoDownloadView />} />
            <Route path="/anime/:id" element={<AnimeView />} />
            <Route path="/:year/:quarter" element={<QuarterView />} />
            <Route 
              path="/" 
              element={<Navigate to={`/${currentYear}/${currentQuarter}`} replace />} 
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
