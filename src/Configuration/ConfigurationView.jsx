import React, { useState, useEffect } from 'react';
import './ConfigurationView.css';
import ScheduledJobsSection from './components/ScheduledJobsSection';
import ConfigurationForm from './components/ConfigurationForm';

function ConfigurationView() {
  const [config, setConfig] = useState({
    animeLocation: '',
    animeLocationFromEnv: false,
    enableAutomaticAnimeFolderClassification: false,
    maxDownloadSpeed: '',
    maxUploadSpeed: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchConfiguration();
  }, []);

  const fetchConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/config');
      if (!response.ok) {
        throw new Error('Failed to fetch configuration');
      }
      const data = await response.json();
      // Convert bytes/sec to MB/s for display (divide by 1024 * 1024)
      const bytesToMB = (bytes) => {
        if (bytes === null || bytes === undefined) return '';
        return String((bytes / (1024 * 1024)).toFixed(2));
      };
      
      // If animeLocation is set via environment variable, use it
      const animeLocationFromEnv = data.animeLocationFromEnv || false;
      
      setConfig({
        animeLocation: data.animeLocation || '',
        animeLocationFromEnv: animeLocationFromEnv,
        enableAutomaticAnimeFolderClassification: data.enableAutomaticAnimeFolderClassification || false,
        maxDownloadSpeed: bytesToMB(data.maxDownloadSpeed),
        maxUploadSpeed: bytesToMB(data.maxUploadSpeed)
      });
    } catch (err) {
      setError(err.message);
      console.error('Error fetching configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      // Convert MB/s to bytes/sec for storage (multiply by 1024 * 1024)
      const mbToBytes = (mb) => {
        if (mb === '' || mb === null || mb === undefined) return null;
        const mbValue = Number(mb);
        if (isNaN(mbValue) || mbValue <= 0) return null;
        return Math.round(mbValue * 1024 * 1024);
      };
      
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...config,
          maxDownloadSpeed: mbToBytes(config.maxDownloadSpeed),
          maxUploadSpeed: mbToBytes(config.maxUploadSpeed)
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
      console.error('Error saving configuration:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    // Prevent changing animeLocation if it's set via environment variable
    setConfig(prev => {
      if (field === 'animeLocation' && prev.animeLocationFromEnv) {
        return prev; // Don't update if set via environment variable
      }
      return {
        ...prev,
        [field]: value
      };
    });
  };

  if (loading) {
    return (
      <div className="configuration-view">
        <div className="configuration-container">
          <h1 className="configuration-title">Configuration</h1>
          <div className="configuration-content">
            <p>Loading configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="configuration-view">
      <div className="configuration-container">
        <h1 className="configuration-title">Configuration</h1>
        
        <ConfigurationForm
          config={config}
          onChange={handleChange}
          onSubmit={handleSubmit}
          saving={saving}
          error={error}
          success={success}
          showSubmitButton={true}
        />

        {/* Scheduled Jobs Section - Separate Card */}
        <div className="configuration-content" style={{ marginTop: '30px' }}>
          <ScheduledJobsSection />
        </div>
      </div>
    </div>
  );
}

export default ConfigurationView;
