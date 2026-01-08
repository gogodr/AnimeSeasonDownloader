import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfigurationForm from '../Configuration/components/ConfigurationForm';
import { formatQuarterWithSeason } from '../../config/constants.js';
import './SetupView.css';

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

function SetupView() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0: welcome, 1: config, 2: quarter selection
  const [config, setConfig] = useState({
    animeLocation: '',
    enableAutomaticAnimeFolderClassification: false,
    maxDownloadSpeed: '',
    maxUploadSpeed: ''
  });
  const [scanCurrentSeason, setScanCurrentSeason] = useState(false);
  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [newQuarter, setNewQuarter] = useState('Q1');
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [addingQuarter, setAddingQuarter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const today = new Date();
  const currentQuarter = getCurrentQuarter();
  const currentYear = today.getFullYear();

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
      
      setConfig({
        animeLocation: data.animeLocation || '',
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

  const handleConfigChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleConfigSubmit = async (e) => {
    e.preventDefault();
    // Don't save yet, just move to next step
    setStep(2);
  };

  const handleAddQuarter = async (e) => {
    e.preventDefault();
    const key = `${newQuarter}-${newYear}`;
    
    // Check if already selected
    if (selectedQuarters.some(q => q.key === key)) {
      setError('This quarter is already selected');
      return;
    }

    try {
      setAddingQuarter(true);
      setError(null);
      
      // Add to selected quarters (we'll spawn the task later on finish)
      setSelectedQuarters(prev => [...prev, { quarter: newQuarter, year: newYear, key }]);
      
      // Reset form
      setNewQuarter('Q1');
      setNewYear(new Date().getFullYear());
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingQuarter(false);
    }
  };

  const handleFinish = async () => {
    try {
      setSaving(true);
      setError(null);

      // Convert MB/s to bytes/sec for storage (multiply by 1024 * 1024)
      const mbToBytes = (mb) => {
        if (mb === '' || mb === null || mb === undefined) return null;
        const mbValue = Number(mb);
        if (isNaN(mbValue) || mbValue <= 0) return null;
        return Math.round(mbValue * 1024 * 1024);
      };

      // Save configuration with setup = false
      const configResponse = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...config,
          maxDownloadSpeed: mbToBytes(config.maxDownloadSpeed),
          maxUploadSpeed: mbToBytes(config.maxUploadSpeed),
          setup: false
        })
      });

      if (!configResponse.ok) {
        const errorData = await configResponse.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }

      // Spawn quarter scan tasks
      if (scanCurrentSeason) {
        // Spawn task for current season
        const quarterResponse = await fetch('/api/admin/update-quarter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ quarter: currentQuarter, year: currentYear })
        });

        if (!quarterResponse.ok) {
          const errorData = await quarterResponse.json();
          throw new Error(errorData.error || 'Failed to spawn current season scan task');
        }
      } else {
        // Spawn tasks for selected quarters
        for (const { quarter, year } of selectedQuarters) {
          const quarterResponse = await fetch('/api/admin/update-quarter', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ quarter, year })
          });

          if (!quarterResponse.ok) {
            const errorData = await quarterResponse.json();
            console.error(`Failed to spawn scan task for ${quarter} ${year}:`, errorData.error);
          }
        }
      }

      // Navigate to admin panel and reload the app (setup is now false, so regular app will show)
      window.location.href = '/admin';
    } catch (err) {
      setError(err.message);
      console.error('Error finishing setup:', err);
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      if (scanCurrentSeason) {
        // Skip quarter selection, go directly to finish
        handleFinish();
      } else {
        setStep(2);
      }
    }
  };

  if (loading) {
    return (
      <div className="setup-view">
        <div className="setup-container">
          <h1 className="setup-title">Welcome to Anime Downloader</h1>
          <div className="setup-content">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-view">
      <div className="setup-container">
        {step === 0 && (
          <>
            <h1 className="setup-title">Welcome to Anime Downloader</h1>
            <div className="setup-content setup-welcome-content">
              <p className="welcome-text">
                Welcome! Let's get you set up. This wizard will help you configure the application
                and set up your first anime season to track.
              </p>
              <button
                className="setup-button setup-button-primary"
                onClick={handleNext}
              >
                Get Started
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="setup-title">Configuration</h1>
            <div className="setup-content">
              <ConfigurationForm
                config={config}
                onChange={handleConfigChange}
                onSubmit={handleConfigSubmit}
                saving={false}
                error={error}
                success={false}
                showSubmitButton={false}
              />
              
              <div className="setup-checkbox-group">
                <label className="setup-checkbox-label">
                  <input
                    type="checkbox"
                    checked={scanCurrentSeason}
                    onChange={(e) => setScanCurrentSeason(e.target.checked)}
                  />
                  <span>Scan current season</span>
                </label>
                <small className="setup-help-text">
                  {scanCurrentSeason 
                    ? `This will automatically scan ${currentQuarter} ${currentYear} for anime.`
                    : 'You can manually select which quarters to scan in the next step.'}
                </small>
              </div>

              <div className="setup-actions">
                <button
                  className="setup-button setup-button-secondary"
                  onClick={() => setStep(0)}
                >
                  Back
                </button>
                <button
                  className="setup-button setup-button-primary"
                  onClick={handleNext}
                >
                  {scanCurrentSeason ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="setup-title">Select Quarters to Scan</h1>
            <div className="setup-content">
              <div className="setup-quarter-section">
                <h3 className="setup-section-title">Add New Quarter</h3>
                <form onSubmit={handleAddQuarter} className="setup-quarter-form">
                  <div className="setup-form-group">
                    <label htmlFor="quarter-select">Quarter:</label>
                    <select
                      id="quarter-select"
                      value={newQuarter}
                      onChange={(e) => setNewQuarter(e.target.value)}
                      className="setup-select"
                      disabled={addingQuarter}
                      required
                    >
                      <option value="Q1">Q1 (Winter)</option>
                      <option value="Q2">Q2 (Spring)</option>
                      <option value="Q3">Q3 (Summer)</option>
                      <option value="Q4">Q4 (Fall)</option>
                    </select>
                  </div>
                  <div className="setup-form-group">
                    <label htmlFor="year-input">Year:</label>
                    <input
                      id="year-input"
                      type="number"
                      value={newYear}
                      onChange={(e) => setNewYear(parseInt(e.target.value) || new Date().getFullYear())}
                      className="setup-input"
                      min="2000"
                      max={new Date().getFullYear() + 10}
                      disabled={addingQuarter}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={addingQuarter}
                    className="setup-button setup-button-secondary"
                  >
                    {addingQuarter ? 'Adding...' : 'Add Quarter'}
                  </button>
                </form>
              </div>
              
              {selectedQuarters.length > 0 && (
                <div className="setup-selected-quarters">
                  <h3>Selected Quarters:</h3>
                  <ul>
                    {selectedQuarters.map(({ quarter, year, key }) => (
                      <li key={key}>
                        <span>{formatQuarterWithSeason(quarter)} {year}</span>
                        <button
                          className="setup-remove-button"
                          onClick={() => setSelectedQuarters(prev => prev.filter(q => q.key !== key))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <div className="setup-error">
                  <strong>Error:</strong> {error}
                </div>
              )}

              <div className="setup-actions">
                <button
                  className="setup-button setup-button-secondary"
                  onClick={() => setStep(1)}
                >
                  Back
                </button>
                <button
                  className="setup-button setup-button-primary"
                  onClick={handleFinish}
                  disabled={saving || selectedQuarters.length === 0}
                >
                  {saving ? 'Finishing Setup...' : 'Finish'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SetupView;

