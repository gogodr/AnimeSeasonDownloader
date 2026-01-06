import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AnimeHero from './components/AnimeHero';
import AlternativeTitlesManager from './components/AlternativeTitlesManager';
import EpisodesTable from './components/EpisodesTable';
import './AnimeView.css';

function AnimeView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [anime, setAnime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [wipePrevious, setWipePrevious] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null);
  const [taskMessage, setTaskMessage] = useState('');
  const pollTimeoutRef = useRef(null);
  const [subgroupToggling, setSubgroupToggling] = useState({});
  const [downloadedTorrentIds, setDownloadedTorrentIds] = useState(new Set());
  const [config, setConfig] = useState(null);
  const [autodownloadToggling, setAutodownloadToggling] = useState(false);

  const fetchAnime = useCallback(async ({ showLoading = true } = {}) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      const response = await fetch(`/api/anime/id/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Anime not found');
        }
        throw new Error('Failed to fetch anime data');
      }
      const data = await response.json();
      setAnime(data);
      
      // Fetch downloaded torrent IDs
      try {
        const downloadedResponse = await fetch(`/api/anime/${id}/downloaded-torrents`);
        if (downloadedResponse.ok) {
          const downloadedData = await downloadedResponse.json();
          setDownloadedTorrentIds(new Set(downloadedData.downloadedTorrentIds || []));
        }
      } catch (err) {
        console.error('Error fetching downloaded torrents:', err);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching anime:', err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [id]);

  const checkActiveTask = useCallback(async () => {
    if (!id) {
      return;
    }

    try {
      const response = await fetch(`/api/anime/${id}/scan-task`);
      if (!response.ok) {
        throw new Error('Failed to fetch active scan task');
      }

      const data = await response.json();
      const activeTask = data?.task;

      if (activeTask && (activeTask.status === 'pending' || activeTask.status === 'running')) {
        setTaskId(activeTask.id);
        setTaskStatus(activeTask.status);
        setTaskMessage(activeTask.result?.message || 'Torrent scan in progress...');
        setScanning(true);
      } else {
        setTaskStatus(null);
        setTaskMessage('');
        setScanning(false);
      }
    } catch (error) {
      console.error('Error checking active scan task:', error);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchAnime();
    }

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [id, fetchAnime]);

  useEffect(() => {
    // Fetch configuration
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/admin/config');
        if (response.ok) {
          const data = await response.json();
          setConfig(data);
        }
      } catch (err) {
        console.error('Error fetching configuration:', err);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    setSubgroupToggling({});
  }, [id]);

  useEffect(() => {
    if (id) {
      checkActiveTask();
    }
  }, [id, checkActiveTask]);

  const handleScanTorrents = async () => {
    if (!anime || scanning) return;
    
    try {
      setScanning(true);
      setTaskStatus('pending');
      setTaskMessage('Preparing torrent scan...');
      const response = await fetch(`/api/anime/${id}/scan-torrents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wipePrevious }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to scan torrents');
      }

      const result = await response.json();
      if (!result.taskId) {
        throw new Error('Task identifier missing in response');
      }

      setTaskId(result.taskId);
      setTaskStatus(result.status || 'pending');
      setTaskMessage(result.result?.message || 'Torrent scan has been queued.');
    } catch (err) {
      setScanning(false);
      setTaskId(null);
      setTaskStatus(null);
      setTaskMessage('');
      console.error('Error scanning torrents:', err);
    }
  };

  const handleToggleSubGroup = async (subGroupId, enabled) => {
    if (!anime || subgroupToggling[subGroupId]) {
      return;
    }

    setSubgroupToggling(prev => ({ ...prev, [subGroupId]: true }));

    try {
      const response = await fetch(`/api/anime/${id}/subgroups/${subGroupId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update subgroup state');
      }

      await fetchAnime({ showLoading: false });
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error toggling subgroup:', err);
    } finally {
      setSubgroupToggling(prev => {
        const next = { ...prev };
        delete next[subGroupId];
        return next;
      });
    }
  };

  const handleAlternativeTitlesUpdate = async () => {
    // Refresh anime data after alternative titles change
    try {
      const response = await fetch(`/api/anime/id/${id}`);
      if (response.ok) {
        const updatedAnime = await response.json();
        setAnime(updatedAnime);
      }
    } catch (err) {
      console.error('Error refreshing anime data:', err);
    }
  };

  const handleToggleAutodownload = async () => {
    if (!anime || autodownloadToggling) {
      return;
    }

    setAutodownloadToggling(true);
    const newValue = !anime.autodownload;

    try {
      const response = await fetch(`/api/anime/${id}/autodownload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ autodownload: newValue }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to toggle autodownload');
      }

      await fetchAnime({ showLoading: false });
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error toggling autodownload:', err);
    } finally {
      setAutodownloadToggling(false);
    }
  };

  useEffect(() => {
    if (!taskId) {
      return undefined;
    }

    let cancelled = false;

    const pollTaskStatus = async () => {
      try {
        const response = await fetch(`/api/anime/tasks/${taskId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch task status');
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setTaskStatus(data.status || null);

        if (data.result?.message) {
          setTaskMessage(data.result.message);
        } else if (data.error) {
          setTaskMessage(data.error);
        }

        if (data.status === 'completed') {
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
          await fetchAnime({ showLoading: false });
          // Refresh downloaded status after scan completes
          try {
            const downloadedResponse = await fetch(`/api/anime/${id}/downloaded-torrents`);
            if (downloadedResponse.ok) {
              const downloadedData = await downloadedResponse.json();
              setDownloadedTorrentIds(new Set(downloadedData.downloadedTorrentIds || []));
            }
          } catch (err) {
            console.error('Error refreshing downloaded torrents:', err);
          }
          setScanning(false);
          setTaskId(null);
          setTaskStatus(data.status);
          setTaskMessage(data.result?.message || 'Torrent scan completed successfully');
          return;
        }

        if (data.status === 'failed') {
          if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
          }
          setScanning(false);
          setTaskId(null);
          setTaskStatus(data.status);
          setTaskMessage(data.error || 'Torrent scan failed');
          return;
        }

        pollTimeoutRef.current = setTimeout(pollTaskStatus, 2000);
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error('Error polling task status:', err);
        pollTimeoutRef.current = setTimeout(pollTaskStatus, 3000);
      }
    };

    pollTaskStatus();

    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [taskId, fetchAnime]);

  if (loading) {
    return (
      <div className="anime-view">
        <div className="container">
          <div className="loading">Loading anime...</div>
        </div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="anime-view">
        <div className="container">
          <div className="error">
            <p>Error: {error || 'Anime not found'}</p>
            <button onClick={() => navigate(-1)} className="retry-button">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="anime-view">
      <AnimeHero 
        anime={anime} 
        onScanTorrents={handleScanTorrents}
        scanning={scanning}
        wipePrevious={wipePrevious}
        onWipePreviousChange={setWipePrevious}
        taskStatus={taskStatus}
        taskMessage={taskMessage}
        onToggleSubGroup={handleToggleSubGroup}
        subgroupToggling={subgroupToggling}
        onToggleAutodownload={handleToggleAutodownload}
        autodownloadToggling={autodownloadToggling}
      />
        <div className="container">
        {anime && (
          <AlternativeTitlesManager 
            animeId={anime.id}
            onUpdate={handleAlternativeTitlesUpdate}
          />
        )}
        <EpisodesTable 
          episodes={anime.episodes} 
          downloadedTorrentIds={downloadedTorrentIds}
          animeId={anime.id}
          animeTitle={anime.title?.english || anime.title?.romaji || anime.title?.native}
          config={config}
        />
      </div>
    </div>
  );
}

export default AnimeView;

