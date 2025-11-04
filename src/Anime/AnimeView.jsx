import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './AnimeView.css';

function AnimeView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [anime, setAnime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const fetchAnime = async () => {
      try {
        setLoading(true);
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
      } catch (err) {
        setError(err.message);
        console.error('Error fetching anime:', err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchAnime();
    }
  }, [id]);

  const formatDate = (date) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatAiringDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTorrentDate = (date) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatLastScan = (date) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleScanTorrents = async () => {
    if (!anime || scanning) return;
    
    try {
      setScanning(true);
      const response = await fetch(`/api/anime/${id}/scan-torrents`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to scan torrents');
      }

      const result = await response.json();
      
      // Refresh anime data
      const animeResponse = await fetch(`/api/anime/id/${id}`);
      if (animeResponse.ok) {
        const updatedAnime = await animeResponse.json();
        setAnime(updatedAnime);
      }
      
      alert(result.message || 'Torrents scanned successfully');
    } catch (err) {
      alert(`Error: ${err.message}`);
      console.error('Error scanning torrents:', err);
    } finally {
      setScanning(false);
    }
  };

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

  const title = anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown Title';
  const description = anime.description 
    ? anime.description.replace(/<[^>]*>/g, '')
    : 'No description available';

  return (
    <div className="anime-view">
      {/* Hero Header Section */}
      <div className="anime-hero">
        <div className="anime-hero-background" style={{
          backgroundImage: anime.image ? `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.8)), url(${anime.image})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}></div>
        <div className="container">
          <div className="anime-hero-content">
            <button onClick={() => navigate(-1)} className="back-button">
              ← Back
            </button>
            <div className="anime-hero-main">
              <div className="anime-hero-image">
                {anime.image ? (
                  <img 
                    src={anime.image} 
                    alt={title}
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/300x400?text=No+Image';
                    }}
                  />
                ) : (
                  <div className="anime-hero-placeholder">No Image</div>
                )}
              </div>
              <div className="anime-hero-info">
                <h1 className="anime-hero-title">{title}</h1>
                {anime.title?.romaji && anime.title.romaji !== title && (
                  <p className="anime-hero-romaji">{anime.title.romaji}</p>
                )}
                {anime.title?.native && anime.title.native !== title && anime.title.native !== anime.title.romaji && (
                  <p className="anime-hero-native">{anime.title.native}</p>
                )}
                {anime.alternativeTitles && anime.alternativeTitles.length > 0 && (
                  <div className="anime-alternative-titles">
                    <strong>Alternative Titles:</strong>
                    <div className="alternative-titles-list">
                      {anime.alternativeTitles.map((altTitle, index) => (
                        <span key={index} className="alternative-title-tag">
                          {altTitle}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {anime.startDate && (
                  <p className="anime-hero-date">
                    <strong>Start Date:</strong> {formatDate(anime.startDate)}
                  </p>
                )}
                {anime.genres && anime.genres.length > 0 && (
                  <div className="anime-hero-genres">
                    {anime.genres.map((genre, index) => (
                      <span key={index} className="genre-tag">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
                {(anime.episodesTracked !== undefined || anime.totalEpisodes !== undefined) && (
                  <p className="anime-hero-episodes">
                    <strong>{anime.episodesTracked || 0} / {anime.totalEpisodes || 0}</strong> episodes tracked
                  </p>
                )}
                <div className="anime-hero-actions">
                  <button
                    onClick={handleScanTorrents}
                    disabled={scanning}
                    className="scan-torrents-button"
                  >
                    {scanning ? 'Scanning...' : 'Scan for Torrents'}
                  </button>
                  {anime.lastTorrentScan && (
                    <p className="anime-hero-last-scan">
                      Last scanned: {formatLastScan(anime.lastTorrentScan)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {description && (
              <div className="anime-hero-description">
                <p>{description}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Episodes Table Section */}
      <div className="container">
        <div className="episodes-section">
          <h2 className="episodes-section-title">Episodes</h2>
          {!anime.episodes || anime.episodes.length === 0 ? (
            <div className="no-episodes">No episodes tracked yet.</div>
          ) : (
            <div className="episodes-table-container">
              <table className="episodes-table">
                <thead>
                  <tr>
                    <th>Episode</th>
                    <th>Airing Date</th>
                    <th>Torrents</th>
                  </tr>
                </thead>
                <tbody>
                  {anime.episodes.map((episode) => (
                    <tr key={episode.episode}>
                      <td className="episode-number">
                        <strong>Episode {episode.episode}</strong>
                      </td>
                      <td className="episode-airing">
                        {formatAiringDate(episode.airingAt)}
                      </td>
                      <td className="episode-torrents">
                        {episode.torrents && episode.torrents.length > 0 ? (
                          <div className="torrents-list">
                            {episode.torrents.map((torrent, index) => (
                              <div key={index} className="torrent-item">
                                <a 
                                  href={torrent.link} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="torrent-link"
                                >
                                  {torrent.title || 'Torrent Link'}
                                </a>
                                <div className="torrent-meta">
                                  {torrent.subGroup && (
                                    <span className="torrent-subgroup">{torrent.subGroup}</span>
                                  )}
                                  <span className="torrent-date">{formatTorrentDate(torrent.date)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="no-torrents">No torrents available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnimeView;

