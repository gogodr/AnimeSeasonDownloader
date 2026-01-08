import React, { useState, useEffect } from 'react';
import './TorrentView.css';

function TorrentView() {
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTorrents = async () => {
    try {
      setError(null);
      const response = await fetch('/api/admin/torrents');
      if (!response.ok) {
        throw new Error('Failed to fetch torrents');
      }
      const data = await response.json();
      setTorrents(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      console.error('Error fetching torrents:', err);
    }
  };

  useEffect(() => {
    fetchTorrents();

    // Refresh every second
    const interval = setInterval(fetchTorrents, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond) => {
    if (bytesPerSecond === 0) return '0 B/s';
    return formatBytes(bytesPerSecond) + '/s';
  };

  const formatTime = (seconds) => {
    if (seconds === Infinity || !isFinite(seconds)) return '∞';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatProgress = (progress) => {
    return (progress * 100).toFixed(1) + '%';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#22c55e';
      case 'downloading':
        return '#667eea';
      case 'paused':
        return '#f59e0b';
      case 'initializing':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  if (loading && torrents.length === 0) {
    return (
      <div className="torrent-view">
        <div className="container">
          <h1 className="torrent-view-title">Torrents</h1>
          <div className="loading">Loading torrents...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="torrent-view">
      <div className="container">
        <h1 className="torrent-view-title">Torrents</h1>
        
        {error && (
          <div className="torrent-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {torrents.length === 0 ? (
          <div className="torrent-empty">
            No active torrents
          </div>
        ) : (
          <div className="torrent-list">
            {torrents.map((torrent) => (
              <div key={torrent.infoHash} className="torrent-card">
                <div className="torrent-card-header">
                  <h3 className="torrent-name" title={torrent.name}>
                    {torrent.name}
                  </h3>
                  <span 
                    className="torrent-status"
                    style={{ backgroundColor: getStatusColor(torrent.status) }}
                  >
                    {torrent.status}
                  </span>
                </div>
                
                <div className="torrent-progress-container">
                  <div className="torrent-progress-bar">
                    <div
                      className="torrent-progress-fill"
                      style={{ width: formatProgress(torrent.progress) }}
                    />
                  </div>
                  <span className="torrent-progress-text">
                    {formatProgress(torrent.progress)}
                  </span>
                </div>

                <div className="torrent-details">
                  <div className="torrent-detail-item">
                    <span className="torrent-detail-label">Downloaded:</span>
                    <span className="torrent-detail-value">
                      {formatBytes(torrent.downloaded)} / {formatBytes(torrent.length)}
                    </span>
                  </div>
                  
                  {torrent.status === 'downloading' && (
                    <>
                      <div className="torrent-detail-item">
                        <span className="torrent-detail-label">Download Speed:</span>
                        <span className="torrent-detail-value">
                          {formatSpeed(torrent.downloadSpeed)}
                        </span>
                      </div>
                      
                      <div className="torrent-detail-item">
                        <span className="torrent-detail-label">Upload Speed:</span>
                        <span className="torrent-detail-value">
                          {formatSpeed(torrent.uploadSpeed)}
                        </span>
                      </div>
                      
                      <div className="torrent-detail-item">
                        <span className="torrent-detail-label">Peers:</span>
                        <span className="torrent-detail-value">
                          {torrent.numPeers}
                        </span>
                      </div>
                      
                      <div className="torrent-detail-item">
                        <span className="torrent-detail-label">Time Remaining:</span>
                        <span className="torrent-detail-value">
                          {formatTime(torrent.timeRemaining)}
                        </span>
                      </div>
                    </>
                  )}
                  
                  <div className="torrent-detail-item">
                    <span className="torrent-detail-label">Path:</span>
                    <span className="torrent-detail-value torrent-path" title={torrent.path}>
                      {torrent.path}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TorrentView;



