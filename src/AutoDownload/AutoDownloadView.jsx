import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingState from '../Shared/components/LoadingState';
import ErrorState from '../Shared/components/ErrorState';
import './AutoDownloadView.css';

function AutoDownloadView() {
  const [animes, setAnimes] = useState([]);
  const [episodesByAnime, setEpisodesByAnime] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState(null);
  const [selectedTorrents, setSelectedTorrents] = useState({});
  const [downloadingTorrents, setDownloadingTorrents] = useState({});
  const navigate = useNavigate();
  const pollTimeoutRefs = useRef({});

  const getTorrentKey = (animeId, episodeNumber) => {
    return `${animeId}-${episodeNumber}`;
  };

  const fetchAnimes = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/autodownload-animes');
      if (!response.ok) {
        throw new Error('Failed to fetch auto-download animes');
      }
      const data = await response.json();
      // Sort: missing episodes first (by how long ago, most recent first), then upcoming episodes (earliest first), then nulls
      const sorted = data.sort((a, b) => {
        return new Date(a.nextEpisodeAiringAt).getTime() - new Date(b.nextEpisodeAiringAt).getTime();
      });
      setAnimes(sorted);
      
      // Fetch episodes for each anime
      const episodesData = {};
      for (const anime of sorted) {
        try {
          const episodesResponse = await fetch(`/api/admin/autodownload-animes/${anime.id}/undownloaded-episodes`);
          if (episodesResponse.ok) {
            const episodesData_result = await episodesResponse.json();
            // Convert date strings back to Date objects
            const episodes = (episodesData_result.episodes || []).map(episode => ({
              ...episode,
              airingAt: episode.airingAt ? new Date(episode.airingAt) : null,
              torrents: (episode.torrents || []).map(torrent => ({
                ...torrent,
                date: torrent.date ? new Date(torrent.date) : null
              }))
            }));
            episodesData[anime.id] = episodes;
            
            // Initialize selected torrent to first one (index 0) for each episode
            episodes.forEach(episode => {
              if (episode.torrents && episode.torrents.length > 0) {
                const key = getTorrentKey(anime.id, episode.episode);
                setSelectedTorrents(prev => {
                  if (!(key in prev)) {
                    return { ...prev, [key]: 0 };
                  }
                  return prev;
                });
              }
            });
          }
        } catch (err) {
          console.error(`Error fetching episodes for anime ${anime.id}:`, err);
          episodesData[anime.id] = [];
        }
      }
      setEpisodesByAnime(episodesData);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching auto-download animes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnimes();
  }, []);

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

  const formatDate = (date, isMissing = false) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (isMissing) {
      if (diffDays === 0) {
        return 'Today';
      } else {
        const daysAgo = Math.abs(diffDays);
        return `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
      }
    } else if (diffDays < 0) {
      const daysAgo = Math.abs(diffDays);
      return `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays <= 7) {
      return `In ${diffDays} days`;
    } else {
      return d.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const handleAnimeClick = (animeId) => {
    navigate(`/anime/${animeId}`);
  };

  const formatAiringDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

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

  const handleTorrentSelect = (animeId, episodeNumber, torrentIndex) => {
    const key = getTorrentKey(animeId, episodeNumber);
    setSelectedTorrents(prev => ({
      ...prev,
      [key]: torrentIndex
    }));
  };

  const handleDownload = async (animeId, episodeNumber, torrent) => {
    if (!animeId || !torrent.id || !torrent.link) {
      return;
    }

    const key = getTorrentKey(animeId, episodeNumber);
    
    // Check if already downloading
    if (downloadingTorrents[key]) {
      navigate('/torrents');
      return;
    }

    if (!config?.animeLocation) {
      alert('Anime location not configured. Please configure it in the settings.');
      return;
    }

    setDownloadingTorrents(prev => ({ ...prev, [key]: true }));

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

      // Start polling for status
      const pollStatus = async () => {
        try {
          const statusResponse = await fetch(`/api/anime/${animeId}/torrents/${torrent.id}/status?url=${encodeURIComponent(torrent.link)}`);
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            if (status.status === 'completed') {
              setDownloadingTorrents(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
              // Refresh episodes to remove downloaded ones
              fetchAnimes();
            } else if (status.status && status.status !== 'not_found') {
              pollTimeoutRefs.current[key] = setTimeout(pollStatus, 2000);
            } else {
              setDownloadingTorrents(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            }
          }
        } catch (err) {
          console.error('Error polling torrent status:', err);
          setDownloadingTorrents(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      };
      
      pollTimeoutRefs.current[key] = setTimeout(pollStatus, 2000);
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error downloading torrent:', err);
      setDownloadingTorrents(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollTimeoutRefs.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, []);

  if (loading) {
    return (
      <div className="auto-download-view">
        <div className="container">
          <h1 className="auto-download-title">Auto-Download</h1>
          <LoadingState message="Loading auto-download animes..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auto-download-view">
        <div className="container">
          <h1 className="auto-download-title">Auto-Download</h1>
          <ErrorState 
            error={error} 
            onRetry={fetchAnimes}
            retryLabel="Retry"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="auto-download-view">
      <div className="container">
        <h1 className="auto-download-title">Auto-Download</h1>
        
        {animes.length === 0 ? (
          <div className="no-animes">
            No animes with auto-download enabled.
          </div>
        ) : (
          <>
            <div className="animes-count">
              {animes.length} anime{animes.length !== 1 ? 's' : ''} with auto-download enabled
            </div>
            
            <div className="animes-list">
              {animes.map((anime) => {
                const episodes = episodesByAnime[anime.id] || [];
                const hasUndownloadedEpisodes = episodes.length > 0;
                
                return (
                  <div 
                    key={anime.id} 
                    className={`anime-item ${anime.isMissing ? 'missing-episode' : ''}`}
                  >
                    <div className="anime-header">
                      <div 
                        className="anime-name clickable"
                        onClick={() => handleAnimeClick(anime.id)}
                      >
                        {anime.title}
                      </div>
                    </div>
                    <div className="anime-details">
                      <div className="anime-episodes">
                        {anime.episodesTracked} / {anime.totalEpisodes} episodes tracked
                      </div>
                      <div className={`anime-next-episode ${anime.isMissing ? 'missing' : ''}`}>
                        {anime.nextEpisodeNumber && (
                          <span className="episode-label">Ep {anime.nextEpisodeNumber}: </span>
                        )}
                        {formatDate(anime.nextEpisodeAiringAt, anime.isMissing)}
                      </div>
                    </div>
                    {hasUndownloadedEpisodes && (
                      <div className="anime-episodes-section">
                        <div className="episodes-list">
                          {episodes.map((episode) => (
                            <div key={episode.episode} className="episode-item">
                              <div className="episode-header">
                                <span className="episode-number">Episode {episode.episode}</span>
                                <span className="episode-airing-date">
                                  {formatAiringDate(episode.airingAt)}
                                </span>
                              </div>
                              {episode.torrents && episode.torrents.length > 0 ? (
                                <div className="episode-torrent-selector">
                                  <select
                                    className="torrent-select"
                                    value={selectedTorrents[getTorrentKey(anime.id, episode.episode)] ?? 0}
                                    onChange={(e) => handleTorrentSelect(anime.id, episode.episode, parseInt(e.target.value))}
                                  >
                                    {episode.torrents.map((torrent, index) => (
                                      <option key={index} value={index}>
                                        {torrent.title.length > 100 ? torrent.title.slice(0, 100) + '...' : torrent.title}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    className="torrent-download-btn"
                                    onClick={() => {
                                      const selectedIndex = selectedTorrents[getTorrentKey(anime.id, episode.episode)] ?? 0;
                                      const selectedTorrent = episode.torrents[selectedIndex];
                                      if (selectedTorrent) {
                                        handleDownload(anime.id, episode.episode, selectedTorrent);
                                      }
                                    }}
                                    disabled={downloadingTorrents[getTorrentKey(anime.id, episode.episode)] || !config?.animeLocation}
                                  >
                                    {downloadingTorrents[getTorrentKey(anime.id, episode.episode)] ? (
                                      <span className="spinner">⟳</span>
                                    ) : (
                                      '⬇ Download'
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div className="no-torrents">No torrents available</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AutoDownloadView;

