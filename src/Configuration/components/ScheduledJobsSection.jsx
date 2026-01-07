import React, { useState, useEffect } from 'react';
import { formatQuarterWithSeason } from '../../../config/constants.js';
import { toString } from 'cronstrue';
import './ScheduledJobsSection.css';

function ScheduledJobsSection() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [runningJobs, setRunningJobs] = useState(new Set());
  const [formData, setFormData] = useState({
    name: '',
    jobType: 'SCAN_QUARTER',
    cronSchedule: '0 0 * * 0', // Weekly on Sunday at midnight
    quarter: 'Q1',
    year: new Date().getFullYear(),
    enabled: true
  });

  const isScanAutodownload = formData.jobType === 'SCAN_AUTODOWNLOAD';

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/scheduled-jobs');
      if (!response.ok) {
        throw new Error('Failed to fetch scheduled jobs');
      }
      const data = await response.json();
      setJobs(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching scheduled jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      const jobConfig = formData.jobType === 'SCAN_QUARTER' 
        ? { quarter: formData.quarter, year: formData.year }
        : formData.jobType === 'SCAN_AUTODOWNLOAD' || formData.jobType === 'QUEUE_AUTODOWNLOAD'
        ? null // No config needed for SCAN_AUTODOWNLOAD and QUEUE_AUTODOWNLOAD
        : null;

      const response = await fetch('/api/admin/scheduled-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          jobType: formData.jobType,
          cronSchedule: formData.cronSchedule,
          jobConfig: jobConfig
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create scheduled job');
      }

      await fetchJobs();
      setShowCreateForm(false);
      resetForm();
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error creating scheduled job:', err);
    }
  };

  const handleUpdateJob = async (e) => {
    e.preventDefault();
    try {
      const jobConfig = formData.jobType === 'SCAN_QUARTER'
        ? { quarter: formData.quarter, year: formData.year }
        : formData.jobType === 'SCAN_AUTODOWNLOAD' || formData.jobType === 'QUEUE_AUTODOWNLOAD'
        ? null // No config needed for SCAN_AUTODOWNLOAD and QUEUE_AUTODOWNLOAD
        : editingJob.jobConfig;

      const response = await fetch(`/api/admin/scheduled-jobs/${editingJob.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          jobType: formData.jobType,
          cronSchedule: formData.cronSchedule,
          enabled: formData.enabled,
          jobConfig: jobConfig
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update scheduled job');
      }

      await fetchJobs();
      setEditingJob(null);
      resetForm();
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error updating scheduled job:', err);
    }
  };

  const handleDeleteJob = async (jobId) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this scheduled job? This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/scheduled-jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete scheduled job');
      }

      await fetchJobs();
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error deleting scheduled job:', err);
    }
  };

  const handleRunJob = async (jobId) => {
    try {
      setRunningJobs(prev => new Set(prev).add(jobId));

      const response = await fetch(`/api/admin/scheduled-jobs/${jobId}/run`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to run scheduled job');
      }

      const result = await response.json();
      alert(`Job triggered successfully: ${result.message}`);
      
      // Refresh jobs to update last run time
      await fetchJobs();
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error running scheduled job:', err);
    } finally {
      setRunningJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  const handleToggleEnabled = async (job) => {
    try {
      const newEnabledStatus = !job.enabled;
      
      const response = await fetch(`/api/admin/scheduled-jobs/${job.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: job.name,
          jobType: job.jobType,
          cronSchedule: job.cronSchedule,
          enabled: newEnabledStatus,
          jobConfig: job.jobConfig
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update scheduled job');
      }

      // Refresh jobs to reflect the change
      await fetchJobs();
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error toggling scheduled job:', err);
    }
  };

  const startEditing = (job) => {
    setEditingJob(job);
    setFormData({
      name: job.name,
      jobType: job.jobType,
      cronSchedule: job.cronSchedule,
      quarter: job.jobConfig?.quarter || 'Q1',
      year: job.jobConfig?.year || new Date().getFullYear(),
      enabled: job.enabled
    });
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingJob(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      jobType: 'SCAN_QUARTER',
      cronSchedule: '0 0 * * 0',
      quarter: 'Q1',
      year: new Date().getFullYear(),
      enabled: true
    });
    setShowCreateForm(false);
  };

  const formatDate = (date) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCronDescription = (cronSchedule) => {
    try {
      return toString(cronSchedule);
    } catch (error) {
      console.error('Error parsing cron schedule:', error);
      return cronSchedule; // Fallback to raw cron string if parsing fails
    }
  };

  if (loading) {
    return (
      <div className="scheduled-jobs-section">
        <h3 className="section-title">Scheduled Jobs</h3>
        <div className="loading">Loading scheduled jobs...</div>
      </div>
    );
  }

  return (
    <div className="scheduled-jobs-section">
      <div className="section-header">
        <h3 className="section-title">Scheduled Jobs</h3>
        {!showCreateForm && !editingJob && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="create-job-button"
          >
            Create New Job
          </button>
        )}
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
          <button onClick={fetchJobs} className="retry-button">Retry</button>
        </div>
      )}

      {(showCreateForm || editingJob) && (
        <div className="job-form-container">
          <h4 className="form-title">
            {editingJob ? 'Edit Scheduled Job' : 'Create New Scheduled Job'}
          </h4>
          <form onSubmit={editingJob ? handleUpdateJob : handleCreateJob} className="job-form">
            <div className="form-group">
              <label htmlFor="job-name">Job Name:</label>
              <input
                id="job-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Weekly Quarter Scan"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="job-type">Job Type:</label>
              <select
                id="job-type"
                value={formData.jobType}
                onChange={(e) => setFormData({ ...formData, jobType: e.target.value })}
                required
              >
                <option value="SCAN_QUARTER">Scan Quarter</option>
                <option value="SCAN_AUTODOWNLOAD">Scan Auto-Download</option>
                <option value="QUEUE_AUTODOWNLOAD">Queue Auto-Download</option>
              </select>
            </div>

            {formData.jobType === 'SCAN_QUARTER' && (
              <>
                <div className="form-group">
                  <label htmlFor="quarter-select">Quarter:</label>
                  <select
                    id="quarter-select"
                    value={formData.quarter}
                    onChange={(e) => setFormData({ ...formData, quarter: e.target.value })}
                    required
                  >
                    <option value="Q1">Q1 (Winter)</option>
                    <option value="Q2">Q2 (Spring)</option>
                    <option value="Q3">Q3 (Summer)</option>
                    <option value="Q4">Q4 (Fall)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="year-input">Year:</label>
                  <input
                    id="year-input"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                    min="2000"
                    max={new Date().getFullYear() + 10}
                    required
                  />
                </div>
              </>
            )}

            {formData.jobType === 'SCAN_AUTODOWNLOAD' && (
              <div className="form-group">
                <div style={{ padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '6px', fontSize: '0.9rem', color: '#555' }}>
                  <strong>Note:</strong> This job will scan all animes marked for auto-download and check for episodes that are releasing today or should have been already released. Only the cron schedule is configurable for this job type.
                </div>
              </div>
            )}

            {formData.jobType === 'QUEUE_AUTODOWNLOAD' && (
              <div className="form-group">
                <div style={{ padding: '10px', backgroundColor: '#e7f3ff', borderRadius: '6px', fontSize: '0.9rem', color: '#555' }}>
                  <strong>Note:</strong> This job will queue torrents for download for all auto-download animes with undownloaded episodes. For each episode, it picks the first available torrent (sorted by date) and queues it for download. Only the cron schedule is configurable for this job type.
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="cron-schedule">Cron Schedule:</label>
              <input
                id="cron-schedule"
                type="text"
                value={formData.cronSchedule}
                onChange={(e) => setFormData({ ...formData, cronSchedule: e.target.value })}
                placeholder="0 0 * * 0"
                required
              />
              <small className="form-help">
                Format: minute hour day month dayOfWeek (e.g., "0 0 * * 0" for weekly on Sunday at midnight)
              </small>
            </div>

            {editingJob && (
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  />
                  <span>Enabled</span>
                </label>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="submit-button">
                {editingJob ? 'Update Job' : 'Create Job'}
              </button>
              <button type="button" onClick={cancelEdit} className="cancel-button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {jobs.length === 0 && !showCreateForm && !editingJob ? (
        <div className="no-jobs">
          <p>No scheduled jobs found.</p>
          <button onClick={() => setShowCreateForm(true)} className="create-job-button">
            Create Your First Job
          </button>
        </div>
      ) : (
        !showCreateForm && !editingJob && (
          <div className="jobs-list">
            {jobs.map((job) => (
              <div key={job.id} className="job-card">
                <div className="job-header">
                  <h4 className="job-name">{job.name}</h4>
                  <span className={`job-status ${job.enabled ? 'enabled' : 'disabled'}`}>
                    {job.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="job-details">
                  <div className="job-detail">
                    <strong>Type:</strong> {
                      job.jobType === 'SCAN_QUARTER' ? 'Scan Quarter' :
                      job.jobType === 'SCAN_AUTODOWNLOAD' ? 'Scan Auto-Download' :
                      job.jobType === 'QUEUE_AUTODOWNLOAD' ? 'Queue Auto-Download' :
                      job.jobType
                    }
                  </div>
                  {job.jobType === 'SCAN_QUARTER' && job.jobConfig && (
                    <div className="job-detail">
                      <strong>Quarter:</strong> {formatQuarterWithSeason(job.jobConfig.quarter)} {job.jobConfig.year}
                    </div>
                  )}
                  {job.jobType === 'SCAN_AUTODOWNLOAD' && (
                    <div className="job-detail">
                      <strong>Config:</strong> Scans all auto-download animes for episodes releasing today or already released
                    </div>
                  )}
                  {job.jobType === 'QUEUE_AUTODOWNLOAD' && (
                    <div className="job-detail">
                      <strong>Config:</strong> Queues torrents for download for all auto-download animes with undownloaded episodes
                    </div>
                  )}
                  <div className="job-detail">
                    <strong>Schedule:</strong> {formatCronDescription(job.cronSchedule)}
                  </div>
                  <div className="job-detail">
                    <strong>Last Run:</strong> {formatDate(job.lastRun)}
                  </div>
                  <div className="job-detail">
                    <strong>Next Run:</strong> {formatDate(job.nextRun)}
                  </div>
                </div>
                <div className="job-actions">
                  <button
                    onClick={() => handleRunJob(job.id)}
                    disabled={runningJobs.has(job.id)}
                    className="run-button"
                  >
                    {runningJobs.has(job.id) ? 'Running...' : 'Run Now'}
                  </button>
                  <button
                    onClick={() => handleToggleEnabled(job)}
                    className={`toggle-button ${job.enabled ? 'disable' : 'enable'}`}
                  >
                    {job.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => startEditing(job)}
                    className="edit-button"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteJob(job.id)}
                    className="delete-button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default ScheduledJobsSection;

