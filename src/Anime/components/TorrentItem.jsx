import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './TorrentItem.css';

function TorrentItem({ torrent, isDownloaded = false, animeId, animeTitle, config }) {
  const [downloadStatus, setDownloadStatus] = useState(null); // 'downloading', 'completed', null
  const [queuing, setQueuing] = useState(false);
  const navigate = useNavigate();
  const pollTimeoutRef = useRef(null);
  
  const formatTorrentDate = (date) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Check download status on mount and when torrent changes
  useEffect(() => {
    if (!animeId || !torrent.id || !config?.animeLocation) {
      return;
    }

    // If already downloaded, don't check status
    if (isDownloaded) {
      return;
    }

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/anime/${animeId}/torrents/${torrent.id}/status?url=${encodeURIComponent(torrent.link)}`);
        if (response.ok) {
          const status = await response.json();
          if (status.status && status.status !== 'not_found') {
            setDownloadStatus(status.status === 'completed' ? 'completed' : 'downloading');
            
            // If downloading, continue polling
            if (status.status !== 'completed' && status.status !== 'not_found') {
              pollTimeoutRef.current = setTimeout(checkStatus, 2000);
            }
          } else {
            setDownloadStatus(null);
          }
        }
      } catch (err) {
        console.error('Error checking torrent status:', err);
      }
    };

    checkStatus();

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [animeId, torrent.id, torrent.link, isDownloaded, config]);

  const handleDownload = async () => {
    // If downloading, navigate to torrents view
    if (downloadStatus === 'downloading') {
      navigate('/torrents');
      return;
    }

    if (!animeId || !torrent.id || !torrent.link || queuing || isDownloaded) {
      return;
    }

    setQueuing(true);
    try {
      const response = await fetch(`/api/anime/${animeId}/torrents/${torrent.id}/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          torrentLink: torrent.link,
          torrentTitle: torrent.title
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to download torrent');
      }

      // Success - set status to downloading and start polling
      setDownloadStatus('downloading');
      setQueuing(false);
      
      // Start polling for status
      const pollStatus = async () => {
        try {
          const statusResponse = await fetch(`/api/anime/${animeId}/torrents/${torrent.id}/status?url=${encodeURIComponent(torrent.link)}`);
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            if (status.status === 'completed') {
              setDownloadStatus('completed');
            } else if (status.status && status.status !== 'not_found') {
              pollTimeoutRef.current = setTimeout(pollStatus, 2000);
            }
          }
        } catch (err) {
          console.error('Error polling torrent status:', err);
        }
      };
      
      pollTimeoutRef.current = setTimeout(pollStatus, 2000);
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error downloading torrent:', err);
      setQueuing(false);
    }
  };

  // Hide button if already downloaded or if file is scanned
  const shouldShowButton = config && config.animeLocation && !isDownloaded;
  const isDownloading = downloadStatus === 'downloading' || queuing;

  return (
    <div className="torrent-item">
      <div className="torrent-header">
        <a 
          href={torrent.link} 
          target="_blank" 
          rel="noopener noreferrer"
          className="torrent-link"
        >
          {torrent.title || 'Torrent Link'}
        </a>
        {isDownloaded && (
          <span className="downloaded-icon" title="Downloaded">
            ✓
          </span>
        )}
        {shouldShowButton && (
          <button
            onClick={handleDownload}
            className={`torrent-download-button ${isDownloading ? 'downloading' : ''}`}
            disabled={queuing}
            title={isDownloading ? 'View in Torrents' : 'Download torrent'}
          >
            {isDownloading ? (
              <span className="spinner">⟳</span>
            ) : (
              '⬇'
            )}
          </button>
        )}
      </div>
      <div className="torrent-meta">
        {torrent.subGroup && (
          <span className="torrent-subgroup">{torrent.subGroup}</span>
        )}
        <span className="torrent-date">{formatTorrentDate(torrent.date)}</span>
      </div>
    </div>
  );
}

export default TorrentItem;

