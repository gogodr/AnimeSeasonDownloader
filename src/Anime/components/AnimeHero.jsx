import React from 'react';
import { useNavigate } from 'react-router-dom';
import './AnimeHero.css';

function AnimeHero({ anime, onScanTorrents, scanning }) {
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
                  onClick={onScanTorrents}
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
  );
}

export default AnimeHero;

