import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AnimeCard.css';

function AnimeCard({ anime }) {
  const navigate = useNavigate();
  const [autodownload, setAutodownload] = useState(anime.autodownload || false);
  const [isToggling, setIsToggling] = useState(false);

  // Sync autodownload state when anime prop changes
  useEffect(() => {
    setAutodownload(anime.autodownload || false);
  }, [anime.autodownload]);
  
  const title = anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown Title';
  const description = anime.description 
    ? anime.description.replace(/<[^>]*>/g, '').substring(0, 150) + '...'
    : 'No description available';

  const formatDate = (date) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleClick = () => {
    navigate(`/anime/${anime.id}`);
  };

  const handleAutodownloadToggle = async (e) => {
    e.stopPropagation(); // Prevent card navigation
    
    if (isToggling) return;
    
    setIsToggling(true);
    const newValue = !autodownload;
    
    try {
      const response = await fetch(`/api/anime/${anime.id}/autodownload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ autodownload: newValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle autodownload');
      }

      const data = await response.json();
      setAutodownload(data.autodownload);
    } catch (error) {
      console.error('Error toggling autodownload:', error);
      // Revert on error
      setAutodownload(autodownload);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="anime-card" onClick={handleClick}>
      <div className="anime-card-image-container">
        {anime.image ? (
          <img 
            src={anime.image} 
            alt={title} 
            className="anime-card-image"
            onError={(e) => {
              e.target.src = 'https://via.placeholder.com/300x400?text=No+Image';
            }}
          />
        ) : (
          <div className="anime-card-placeholder">No Image</div>
        )}
      </div>
      <div className="anime-card-content">
        <h2 className="anime-card-title">{title}</h2>
        {anime.title?.romaji && anime.title.romaji !== title && (
          <p className="anime-card-romaji">{anime.title.romaji}</p>
        )}
        {anime.startDate && (
          <p className="anime-card-date">
            <strong>Start Date:</strong> {formatDate(anime.startDate)}
          </p>
        )}
        {anime.genres && anime.genres.length > 0 && (
          <div className="anime-card-genres">
            {anime.genres.slice(0, 5).map((genre, index) => (
              <span key={index} className="genre-tag">
                {genre}
              </span>
            ))}
          </div>
        )}
        <p className="anime-card-description">{description}</p>
        {(anime.episodesTracked !== undefined || anime.totalEpisodes !== undefined) && (
          <div className="anime-card-episodes">
            <strong>{anime.episodesTracked || 0} / {anime.totalEpisodes || 0}</strong> episodes tracked
          </div>
        )}
        {anime.lastEpisodeWithTorrent && (
          <div className="anime-card-last-episode">
            <span className="anime-card-last-episode-label">Latest episode tracked:</span>
            <span className="anime-card-last-episode-value">
              Episode {anime.lastEpisodeWithTorrent}
              {anime.lastEpisodeAirDate && (
                <span className="anime-card-last-episode-date"> • {formatDate(anime.lastEpisodeAirDate)}</span>
              )}
            </span>
          </div>
        )}
        <div className="anime-card-actions">
          <button
            className={`autodownload-button ${autodownload ? 'active' : ''}`}
            onClick={handleAutodownloadToggle}
            disabled={isToggling}
            title={autodownload ? 'Disable auto-download' : 'Enable auto-download'}
          >
            {isToggling ? (
              <span className="autodownload-spinner">⏳</span>
            ) : autodownload ? (
              <span className="autodownload-icon">✓</span>
            ) : (
              <span className="autodownload-icon">+</span>
            )}
            <span className="autodownload-text">
              {autodownload ? 'Auto-Download ON' : 'Auto-Download OFF'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AnimeCard;
