import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import AnimeCard from './components/AnimeCard';
import LoadingState from '../Shared/components/LoadingState';
import ErrorState from '../Shared/components/ErrorState';
import './QuarterView.css';

function QuarterPage() {
  const { year, quarter } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter and sort states - initialize from URL params
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [selectedGenres, setSelectedGenres] = useState(() => {
    const genresParam = searchParams.get('genres');
    return genresParam ? genresParam.split(',') : [];
  });
  const [sortBy, setSortBy] = useState(() => searchParams.get('sortBy') || 'lastEpisodeAirDate');
  const [sortOrder, setSortOrder] = useState(() => searchParams.get('sortOrder') || 'desc');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  
  const searchAutocompleteRef = useRef(null);
  
  // Update URL params when filters/sort change
  const updateURLParams = useCallback((updates) => {
    const newParams = new URLSearchParams(searchParams);
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value === '' || value === null || (Array.isArray(value) && value.length === 0)) {
        newParams.delete(key);
      } else if (Array.isArray(value)) {
        newParams.set(key, value.join(','));
      } else {
        newParams.set(key, value);
      }
    });
    
    // Only update if params actually changed
    const currentString = searchParams.toString();
    const newString = newParams.toString();
    if (currentString !== newString) {
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchAutocompleteRef.current && !searchAutocompleteRef.current.contains(event.target)) {
        setShowAutocomplete(false);
      }
    };

    if (showAutocomplete) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showAutocomplete]);

  const formatQuarterName = (quarterParam) => {
    return quarterParam || 'Q1';
  };

  const handleRetry = () => {
    if (year && quarter) {
      fetchAnime(quarter.toUpperCase(), parseInt(year));
    }
  };

  // Get all unique genres from the anime list
  const allGenres = useMemo(() => {
    const genreSet = new Set();
    animeList.forEach(anime => {
      if (anime.genres && Array.isArray(anime.genres)) {
        anime.genres.forEach(genre => genreSet.add(genre));
      }
    });
    return Array.from(genreSet).sort();
  }, [animeList]);

  // Filter and sort anime
  const filteredAndSortedAnime = useMemo(() => {
    let filtered = [...animeList];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(anime => {
        const title = (anime.title?.english || anime.title?.romaji || anime.title?.native || '').toLowerCase();
        return title.includes(query);
      });
    }

    // Apply genre filter (OR logic - anime must have at least one selected genre)
    if (selectedGenres.length > 0) {
      filtered = filtered.filter(anime => {
        if (!anime.genres || !Array.isArray(anime.genres)) return false;
        return selectedGenres.some(genre => anime.genres.includes(genre));
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'name':
          aValue = (a.title?.english || a.title?.romaji || a.title?.native || '').toLowerCase();
          bValue = (b.title?.english || b.title?.romaji || b.title?.native || '').toLowerCase();
          break;
        case 'startDate':
          aValue = a.startDate ? new Date(a.startDate).getTime() : 0;
          bValue = b.startDate ? new Date(b.startDate).getTime() : 0;
          break;
        case 'lastEpisodeAirDate':
          aValue = a.lastEpisodeAirDate ? new Date(a.lastEpisodeAirDate).getTime() : 0;
          bValue = b.lastEpisodeAirDate ? new Date(b.lastEpisodeAirDate).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [animeList, searchQuery, selectedGenres, sortBy, sortOrder]);

  // Autocomplete suggestions based on search query
  const autocompleteSuggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      return [];
    }
    
    const query = searchQuery.toLowerCase().trim();
    const suggestions = new Set();
    
    animeList.forEach(anime => {
      const title = anime.title?.english || anime.title?.romaji || anime.title?.native || '';
      if (title.toLowerCase().includes(query)) {
        suggestions.add(title);
      }
    });
    
    return Array.from(suggestions).slice(0, 5);
  }, [animeList, searchQuery]);

  // Update showAutocomplete based on suggestions
  useEffect(() => {
    if (autocompleteSuggestions.length > 0 && searchQuery.trim().length >= 2) {
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
    }
  }, [autocompleteSuggestions, searchQuery]);

  const handleGenreToggle = (genre) => {
    setSelectedGenres(prev => {
      const newGenres = prev.includes(genre) 
        ? prev.filter(g => g !== genre)
        : [...prev, genre];
      updateURLParams({ genres: newGenres });
      return newGenres;
    });
  };

  const handleSortChange = (newSortBy) => {
    if (sortBy === newSortBy) {
      // Toggle sort order if same field
      const newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      setSortOrder(newSortOrder);
      updateURLParams({ sortBy: newSortBy, sortOrder: newSortOrder });
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
      updateURLParams({ sortBy: newSortBy, sortOrder: 'asc' });
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion);
    setShowAutocomplete(false);
    updateURLParams({ search: suggestion });
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    updateURLParams({ search: value });
    if (value.trim().length >= 2) {
      setShowAutocomplete(true);
    }
  };
  
  // Sync state when URL params change (e.g., browser back/forward)
  // Only sync if values are different to avoid unnecessary updates
  useEffect(() => {
    const searchParam = searchParams.get('search') || '';
    const genresParam = searchParams.get('genres');
    const sortByParam = searchParams.get('sortBy') || 'lastEpisodeAirDate';
    const sortOrderParam = searchParams.get('sortOrder') || 'desc';
    
    if (searchQuery !== searchParam) {
      setSearchQuery(searchParam);
    }
    
    const genres = genresParam ? genresParam.split(',') : [];
    const genresChanged = genres.length !== selectedGenres.length || 
      genres.some(g => !selectedGenres.includes(g));
    if (genresChanged) {
      setSelectedGenres(genres);
    }
    
    if (sortBy !== sortByParam) {
      setSortBy(sortByParam);
    }
    
    if (sortOrder !== sortOrderParam) {
      setSortOrder(sortOrderParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
          <>
            <div className="quarter-filters">
              <div className="filter-section">
                <h3 className="filter-section-title">Filters</h3>
                
                {/* Search Autocomplete */}
                <div className="filter-group">
                  <label className="filter-label">Search Anime</label>
                  <div className="search-autocomplete" ref={searchAutocompleteRef}>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Type anime name..."
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onFocus={() => {
                        if (autocompleteSuggestions.length > 0) {
                          setShowAutocomplete(true);
                        }
                      }}
                    />
                    {showAutocomplete && autocompleteSuggestions.length > 0 && (
                      <div className="autocomplete-dropdown">
                        {autocompleteSuggestions.map((suggestion, index) => (
                          <div
                            key={index}
                            className="autocomplete-item"
                            onClick={() => handleSuggestionClick(suggestion)}
                          >
                            {suggestion}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Genre Filter */}
                <div className="filter-group">
                  <label className="filter-label">Genres</label>
                  <div className="genre-checkboxes">
                    {allGenres.map(genre => (
                      <label key={genre} className="genre-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedGenres.includes(genre)}
                          onChange={() => handleGenreToggle(genre)}
                        />
                        <span>{genre}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sort Section */}
              <div className="sort-section">
                <h3 className="filter-section-title">Sort By</h3>
                <div className="sort-options">
                  <button
                    className={`sort-button ${sortBy === 'name' ? 'active' : ''}`}
                    onClick={() => handleSortChange('name')}
                  >
                    Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                  <button
                    className={`sort-button ${sortBy === 'startDate' ? 'active' : ''}`}
                    onClick={() => handleSortChange('startDate')}
                  >
                    Start Date {sortBy === 'startDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                  <button
                    className={`sort-button ${sortBy === 'lastEpisodeAirDate' ? 'active' : ''}`}
                    onClick={() => handleSortChange('lastEpisodeAirDate')}
                  >
                    Latest Episode Tracked {sortBy === 'lastEpisodeAirDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
              </div>

              {/* Results count */}
              <div className="filter-results">
                Showing {filteredAndSortedAnime.length} of {animeList.length} anime
              </div>
            </div>

            <div className="anime-grid">
              {filteredAndSortedAnime.length === 0 ? (
                <div className="no-anime">
                  No anime match your filters.
                </div>
              ) : (
                filteredAndSortedAnime.map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default QuarterPage;

