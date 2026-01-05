import React, { useState, useEffect } from 'react';
import './ConfigurationView.css';

function ConfigurationView() {
  const [config, setConfig] = useState({
    enableAutoDownloadEpisodes: false,
    enableAutoAddNewSeasons: false,
    animeLocation: '',
    enableDownloadTmpLocation: false,
    downloadTmpLocation: '',
    enableAutomaticAnimeFolderClassification: false
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
      setConfig({
        enableAutoDownloadEpisodes: data.enableAutoDownloadEpisodes || false,
        enableAutoAddNewSeasons: data.enableAutoAddNewSeasons || false,
        animeLocation: data.animeLocation || '',
        enableDownloadTmpLocation: data.enableDownloadTmpLocation || false,
        downloadTmpLocation: data.downloadTmpLocation || '',
        enableAutomaticAnimeFolderClassification: data.enableAutomaticAnimeFolderClassification || false
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
      
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
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
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
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
        
        <div className="configuration-content">
          {error && (
            <div className="configuration-error">
              <strong>Error:</strong> {error}
            </div>
          )}
          
          {success && (
            <div className="configuration-success">
              Configuration saved successfully!
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="configuration-form">
            {/* Enable auto-download episodes */}
            <div className="form-group">
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.enableAutoDownloadEpisodes}
                  onChange={(e) => handleChange('enableAutoDownloadEpisodes', e.target.checked)}
                />
                <span>Enable auto-download episodes</span>
              </label>
            </div>

            {/* Enable auto-add new seasons */}
            <div className="form-group">
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.enableAutoAddNewSeasons}
                  onChange={(e) => handleChange('enableAutoAddNewSeasons', e.target.checked)}
                />
                <span>Enable auto-add new seasons</span>
              </label>
            </div>

            {/* Anime location */}
            <div className="form-group">
              <label className="form-label">
                Anime location
              </label>
              <input
                type="text"
                className="form-input"
                value={config.animeLocation}
                onChange={(e) => handleChange('animeLocation', e.target.value)}
                placeholder="Enter folder path (e.g., C:\Anime or /home/user/anime)"
              />
            </div>

            {/* Enable download tmp location */}
            <div className="form-group">
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.enableDownloadTmpLocation}
                  onChange={(e) => handleChange('enableDownloadTmpLocation', e.target.checked)}
                />
                <span>Enable download tmp location</span>
              </label>
            </div>

            {/* Download tmp location */}
            <div className="form-group">
              <label className="form-label">
                Download tmp location
              </label>
              <input
                type="text"
                className="form-input"
                value={config.downloadTmpLocation}
                onChange={(e) => handleChange('downloadTmpLocation', e.target.value)}
                placeholder="Enter folder path (e.g., C:\Downloads\Anime or /home/user/downloads/anime)"
                disabled={!config.enableDownloadTmpLocation}
              />
            </div>

            {/* Enable automatic anime folder classification */}
            <div className="form-group">
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.enableAutomaticAnimeFolderClassification}
                  onChange={(e) => handleChange('enableAutomaticAnimeFolderClassification', e.target.checked)}
                />
                <span>Enable automatic anime folder classification</span>
              </label>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="form-submit-button"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ConfigurationView;
