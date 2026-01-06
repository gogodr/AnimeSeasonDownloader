import React, { useState, useEffect } from 'react';
import QuartersSection from './components/SeasonsSection';
import SubgroupsSection from './components/SubgroupsSection';
import TasksMonitor from './components/TasksMonitor';
import AnimeScanSection from './components/AnimeScanSection';
import './AdminView.css';

function AdminView() {
  const [animeLocation, setAnimeLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfiguration();
  }, []);

  const fetchConfiguration = async () => {
    try {
      const response = await fetch('/api/admin/config');
      if (response.ok) {
        const data = await response.json();
        setAnimeLocation(data.animeLocation || null);
      }
    } catch (err) {
      console.error('Error fetching configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-view">
      <div className="admin-container">
        <h1 className="admin-title">Admin Panel</h1>
        
        <TasksMonitor />

        <div className="section-separator"></div>
        
        {!loading && animeLocation && (
          <>
            <AnimeScanSection animeLocation={animeLocation} />
            <div className="section-separator"></div>
          </>
        )}
        
        <QuartersSection />
        
        <div className="section-separator"></div>
        
        <SubgroupsSection />
      </div>
    </div>
  );
}

export default AdminView;

