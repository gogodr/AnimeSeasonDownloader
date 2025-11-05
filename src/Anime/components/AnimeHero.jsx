import React from 'react';
import { useNavigate } from 'react-router-dom';
import './AnimeHero.css';

function AnimeHero({ anime, onScanTorrents, scanning, wipePrevious, onWipePreviousChange }) {
  const navigate = useNavigate();

  const title = anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown Title';
  const description = anime.description
    ? anime.description.replace(/<[^>]*>/g, '')
    : 'No description available';

  const formatDate = (date) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

  return (
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
              {(anime.episodesTracked !== undefined || anime.totalEpisodes !== undefined) && (
                <p className="anime-hero-episodes">
                  <strong>{anime.episodesTracked || 0} / {anime.totalEpisodes || 0}</strong> episodes tracked
                </p>
              )}
              {anime.startDate && (
                <p className="anime-hero-date">
                  <strong>Start Date:</strong> {formatDate(anime.startDate)}
                </p>
              )}
              {anime.season && anime.season >= 2 && (
                <p className="anime-hero-season">
                  <strong>Season:</strong> {anime.season}
                </p>
              )}
              {anime.genres && anime.genres.length > 0 && (
                <div className="anime-hero-genres">
                  <strong className="anime-hero-genres-label">Genres:</strong>
                  <div className="anime-hero-genres-list">
                    {anime.genres.map((genre, index) => (
                      <span key={index} className="genre-tag">
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {description && (
            <div className="anime-hero-description">
              <p>{description}</p>
            </div>
          )}

          <div className="anime-hero-actions">
            <div className="scan-torrents-controls">
              <button
                onClick={onScanTorrents}
                disabled={scanning}
                className="scan-torrents-button"
              >
                {scanning ? 'Scanning...' : 'Scan for Torrents'}
              </button>
              <label className="wipe-previous-checkbox">
                <input
                  type="checkbox"
                  checked={wipePrevious}
                  onChange={(e) => onWipePreviousChange(e.target.checked)}
                  disabled={scanning}
                />
                <span>wipe previous</span>
              </label>
            </div>
            {anime.lastTorrentScan && (
              <p className="anime-hero-last-scan">
                Last scanned: {formatLastScan(anime.lastTorrentScan)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnimeHero;

