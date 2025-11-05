import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import AnimeCard from './components/AnimeCard';
import LoadingState from '../Shared/components/LoadingState';
import ErrorState from '../Shared/components/ErrorState';
import './QuarterView.css';

function QuarterPage() {
  const { year, quarter } = useParams();
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnime = useCallback(async (quarterParam, yearParam) => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/quarter/${quarterParam}/${yearParam}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`No anime data found for ${quarterParam} ${yearParam}`);
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
    if (year && quarter) {
      fetchAnime(quarter.toUpperCase(), parseInt(year));
    }
  }, [year, quarter, fetchAnime]);

  const formatQuarterName = (quarterParam) => {
    return quarterParam || 'Q1';
  };

  const handleRetry = () => {
    if (year && quarter) {
      fetchAnime(quarter.toUpperCase(), parseInt(year));
    }
  };

  return (
    <div className="season-page">
      <div className="container">        
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
            No anime found for {formatQuarterName(quarter)} {year}.
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

export default QuarterPage;

