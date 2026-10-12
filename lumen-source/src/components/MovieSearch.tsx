import React, { useState, useEffect } from 'react';
import { Search, Star, Clock, Calendar, Film, ArrowRight } from 'lucide-react';
import { Movie } from '../types';
import { api, posterUrl } from '../api';

interface MovieSearchProps {
  onSelectMovie: (movie: Movie) => void;
}

const LISTS = [
  { id: 'popular', label: 'Popular', title: 'Popular right now' },
  { id: 'now_playing', label: 'Now Playing', title: 'Now playing' },
  { id: 'top_rated', label: 'Top Rated', title: 'Top rated' },
];

export const MovieSearch: React.FC<MovieSearchProps> = ({ onSelectMovie }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeList, setActiveList] = useState('popular');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);

  const query = searchQuery.trim();

  // Debounced search; with an empty box the chosen TMDB list is shown instead
  useEffect(() => {
    if (query.length === 1) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api(query ? '/api/movies/search?q=' + encodeURIComponent(query) : '/api/movies?list=' + activeList);
        if (cancelled) return;
        setMovies(data.movies);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setMovies([]);
        setError({ message: err.message, status: err.status });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 400 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, activeList]);

  return (
    <div className="space-y-8">
      {/* Search Header Bar */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-amber-400" />
            Search & Select Movie
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Powered by The Movie Database (TMDB) API · Real showtimes & formats available
          </p>
        </div>

        {/* Search Input Box */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any movie title from TMDB (e.g. Dune, Oppenheimer, Spider-Man, Inception)..."
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all shadow-inner"
          />
          {loading && query && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-amber-400 flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              Searching TMDB...
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 text-xs">
          {LISTS.map((list) => (
            <button
              key={list.id}
              onClick={() => {
                setActiveList(list.id);
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap ${
                !query && activeList === list.id
                  ? 'bg-amber-400 text-neutral-950 font-semibold'
                  : 'text-neutral-400 hover:text-white bg-neutral-950/60 border border-neutral-800'
              }`}
            >
              {list.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section heading */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {query ? `Results for "${query}"` : LISTS.find((l) => l.id === activeList)?.title}
        </h2>
        {query && (
          <button onClick={() => setSearchQuery('')} className="text-sm text-amber-400 hover:text-amber-300 cursor-pointer shrink-0">
            Back to {LISTS.find((l) => l.id === activeList)?.label.toLowerCase()}
          </button>
        )}
      </div>

      {error && (
        <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 border-l-4 border-l-amber-400 text-sm text-neutral-400">
          {error.status === 503 ? (
            <>
              <strong className="text-white">Movie search needs a TMDB API key.</strong> Put it in{' '}
              <code className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200">config.json</code> as{' '}
              <code className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200">tmdb_api_key</code>, then refresh this page.
            </>
          ) : (
            <>
              <strong className="text-white">Could not load movies.</strong> {error.message}
            </>
          )}
        </div>
      )}

      {!loading && !error && movies.length === 0 && (
        <p className="text-sm text-neutral-400">No movies found. Try another title.</p>
      )}

      {/* Movies Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading && movies.length === 0 &&
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded-2xl border border-neutral-800 bg-neutral-900/70 overflow-hidden animate-pulse">
              <div className="aspect-[2/3] bg-neutral-900" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-2/3 rounded bg-neutral-800" />
                <div className="h-3 w-full rounded bg-neutral-800/70" />
                <div className="h-9 rounded-xl bg-neutral-800/70" />
              </div>
            </div>
          ))}

        {movies.map((movie) => (
          <div
            key={movie.id}
            onClick={() => onSelectMovie(movie)}
            className={`group relative flex flex-col rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer bg-neutral-900/70 border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900 hover:-translate-y-1 ${
              loading ? 'opacity-50' : ''
            }`}
          >
            {/* Poster Image Container */}
            <div className="relative aspect-[2/3] w-full overflow-hidden bg-neutral-950">
              <img
                src={posterUrl(movie.posterPath)}
                alt={movie.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />

              {/* Rating & Format Overlays */}
              {movie.voteAverage > 0 && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-950/85 backdrop-blur-md border border-neutral-800 text-xs font-semibold text-amber-400">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="tabular-nums">{movie.voteAverage.toFixed(1)}</span>
                </div>
              )}

              {movie.certification && (
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-neutral-900/85 backdrop-blur-md border border-neutral-700 text-[11px] font-bold text-neutral-300">
                  {movie.certification}
                </div>
              )}

              {/* Gradient bottom overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-transparent pointer-events-none" />
            </div>

            {/* Movie Info */}
            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="font-bold text-base text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                  {movie.title}
                </h3>

                {/* Clean unboxed metadata with dot separators */}
                <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1.5">
                  {movie.runtime > 0 && (
                    <>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-neutral-500" />
                        <span className="tabular-nums">{movie.runtime}m</span>
                      </span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                    </>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-neutral-500" />
                    <span>{movie.releaseDate.substring(0, 4) || 'TBA'}</span>
                  </span>
                </div>

                <p className="text-xs text-neutral-400 mt-2 line-clamp-2 leading-relaxed">
                  {movie.overview || 'No synopsis available.'}
                </p>
              </div>

              {/* Card Action Button */}
              <button
                type="button"
                className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer bg-neutral-800/90 text-neutral-200 group-hover:bg-amber-400 group-hover:text-neutral-950"
              >
                <span>Select & Choose Seats</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
