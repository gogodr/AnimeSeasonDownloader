import React from 'react';

function ConfigurationForm({ config, onChange, onSubmit, saving, error, success, showSubmitButton = true }) {
  const handleChange = (field, value) => {
    onChange(field, value);
  };

  // Check if animeLocation is set via environment variable
  const animeLocationFromEnv = config.animeLocationFromEnv || false;

  return (
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
      
      <form onSubmit={onSubmit} className="configuration-form">
        {/* Anime location */}
        <div className="form-group">
          <label className="form-label">
            Anime location
            {animeLocationFromEnv && (
              <span className="form-help-text" style={{ fontStyle: 'italic', marginLeft: '8px' }}>
                (set via environment variable)
              </span>
            )}
          </label>
          <input
            type="text"
            className="form-input"
            value={config.animeLocation || ''}
            onChange={(e) => handleChange('animeLocation', e.target.value)}
            placeholder="Enter folder path (e.g., C:\Anime or /home/user/anime)"
            disabled={animeLocationFromEnv}
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

        {/* Max download speed */}
        <div className="form-group">
          <label className="form-label">
            Max Download Speed (MB/s)
          </label>
          <input
            type="number"
            step="0.1"
            className="form-input"
            value={config.maxDownloadSpeed}
            onChange={(e) => handleChange('maxDownloadSpeed', e.target.value)}
            placeholder="Leave empty for unlimited (e.g., 10 for 10 MB/s)"
            min="0"
          />
          <small className="form-help-text">
            Maximum download speed in megabytes per second. Leave empty for unlimited.
          </small>
        </div>

        {/* Max upload speed */}
        <div className="form-group">
          <label className="form-label">
            Max Upload Speed (MB/s)
          </label>
          <input
            type="number"
            step="0.1"
            className="form-input"
            value={config.maxUploadSpeed}
            onChange={(e) => handleChange('maxUploadSpeed', e.target.value)}
            placeholder="Leave empty for unlimited (e.g., 1 for 1 MB/s)"
            min="0"
          />
          <small className="form-help-text">
            Maximum upload speed in megabytes per second. Leave empty for unlimited.
          </small>
        </div>

        {showSubmitButton && (
          <div className="form-actions">
            <button
              type="submit"
              className="form-submit-button"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default ConfigurationForm;

