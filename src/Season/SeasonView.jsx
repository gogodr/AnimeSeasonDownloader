import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import AnimeCard from './components/AnimeCard';
import LoadingState from '../Shared/components/LoadingState';
import ErrorState from '../Shared/components/ErrorState';
import './SeasonView.css';

function SeasonPage() {
  const { year, season } = useParams();
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnime = useCallback(async (seasonParam, yearParam) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/season/${seasonParam}/${yearParam}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`No anime data found for ${seasonParam} ${yearParam}`);
        }
        throw new Error('Failed to fetch anime data');
      }
      const data = await response.json();
      setAnimeList(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching anime:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (year && season) {
      fetchAnime(season.toUpperCase(), parseInt(year));
    }
  }, [year, season, fetchAnime]);

  const formatSeasonName = (seasonParam) => {
    return seasonParam.charAt(0) + seasonParam.slice(1).toLowerCase();
  };

  const handleRetry = () => {
    if (year && season) {
      fetchAnime(season.toUpperCase(), parseInt(year));
    }
  };

  return (
    <div className="season-page">
      <div className="container">
        <h1 className="title">Anime Season Downloader</h1>
        
        {loading ? (
          <LoadingState message="Loading anime..." />
        ) : error ? (
          <ErrorState 
            error={error} 
            onRetry={handleRetry}
            retryLabel="Retry"
          />
        ) : animeList.length === 0 ? (
          <div className="no-anime">
            No anime found for {formatSeasonName(season)} {year}.
          </div>
        ) : (
          <div className="anime-grid">
            {animeList.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SeasonPage;

