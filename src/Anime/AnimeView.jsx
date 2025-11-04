import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AnimeHero from './components/AnimeHero';
import EpisodesTable from './components/EpisodesTable';
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

  return (
    <div className="anime-view">
      <AnimeHero 
        anime={anime} 
        onScanTorrents={handleScanTorrents}
        scanning={scanning}
      />
      <div className="container">
        <EpisodesTable episodes={anime.episodes} />
      </div>
    </div>
  );
}

export default AnimeView;

