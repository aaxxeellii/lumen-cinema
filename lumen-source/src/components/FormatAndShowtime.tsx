import React, { useEffect } from 'react';
import { TheaterFormat, Movie } from '../types';
import { isoDate, money, niceTime, posterUrl } from '../api';
import { Sparkles, Clock, Calendar, Check, ArrowRight, ArrowLeft } from 'lucide-react';

interface FormatAndShowtimeProps {
  movie: Movie;
  schedule: Record<string, Record<string, string[]>>;
  formats: TheaterFormat[];
  selectedFormat: TheaterFormat;
  onSelectFormat: (format: TheaterFormat) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  selectedTime: string | null;
  onSelectTime: (time: string | null) => void;
  onContinue: () => void;
  onBack: () => void;
}

export const FormatAndShowtime: React.FC<FormatAndShowtimeProps> = ({
  movie,
  schedule,
  formats,
  selectedFormat,
  onSelectFormat,
  selectedDate,
  onSelectDate,
  selectedTime,
  onSelectTime,
  onContinue,
  onBack,
}) => {
  const now = new Date();
  // The bookable days come from the server: today and the days after it, never a past day
  const dates = Object.keys(schedule)
    .sort()
    .filter((iso) => iso >= isoDate(now))
    .map((iso, i) => {
      const d = new Date(iso + 'T00:00');
      return {
        iso,
        label: iso === isoDate(now) ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' }),
        sub: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
    });
  const times = schedule[selectedDate]?.[selectedFormat.id] || [];
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // A showtime that already started today can no longer be booked
  const isPast = (time: string) => selectedDate === isoDate(now) && time <= clock;

  // Drop the chosen time when it does not exist for the new format or has already passed on the new date
  useEffect(() => {
    if (selectedTime && (!times.includes(selectedTime) || isPast(selectedTime))) onSelectTime(null);
  }, [selectedFormat.id, selectedDate, times.join()]);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Movie Banner Recap */}
      <div className="relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900/80 p-6 flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 md:w-28 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-neutral-800">
          <img src={posterUrl(movie.posterPath, 'w342')} alt={movie.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        </div>

        <div className="flex-1 space-y-2 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 text-xs text-neutral-400">
            <span>Selected Feature</span>
            {movie.genres.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{movie.genres.slice(0, 2).join(', ')}</span>
              </>
            )}
            {movie.runtime > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{movie.runtime} min</span>
              </>
            )}
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{movie.title}</h2>
          <p className="text-xs text-neutral-400 line-clamp-2 max-w-2xl">{movie.overview}</p>
        </div>

        <button
          onClick={onBack}
          className="text-xs font-semibold text-neutral-400 hover:text-white px-3 py-2 rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-900/60 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Change Movie
        </button>
      </div>

      {/* 1. Theater Experience Selection */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Select Theater Format & Screen Experience
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">Choose your auditorium technology before choosing your seats</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {formats.map((format) => {
            const isSelected = selectedFormat.id === format.id;
            return (
              <div
                key={format.id}
                onClick={() => onSelectFormat(format)}
                className={`relative rounded-2xl p-5 border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-neutral-900/90 border-amber-400 ring-2 ring-amber-400/40 shadow-xl shadow-amber-500/10'
                    : 'bg-neutral-900/40 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/70'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="font-bold text-base text-white tracking-tight">{format.name}</span>
                    <span className="text-right shrink-0">
                      <span className="text-sm font-bold text-amber-400 tabular-nums">{money(format.price)}</span>
                      {format.was && format.was > format.price && (
                        <span className="block text-[11px] text-neutral-500 tabular-nums">
                          <span className="line-through">{money(format.was)}</span>{' '}
                          <span className="font-bold text-emerald-400">-{Math.round((1 - format.price / format.was) * 100)}%</span>
                        </span>
                      )}
                      {format.deal && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-red-500 text-white text-[10px] font-black">
                          {format.deal.take}x{format.deal.pay}
                        </span>
                      )}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-400 leading-relaxed mb-4">{format.tagline}</p>

                  <div className="space-y-1.5 pt-3 border-t border-neutral-800/80 text-[11px] text-neutral-400">
                    <div className="font-medium text-neutral-300">Auditorium Specs:</div>
                    <div className="flex items-center gap-1 text-neutral-400">
                      <span>•</span>
                      <span>{format.screenSpecs}</span>
                    </div>
                    <div className="flex items-center gap-1 text-neutral-400">
                      <span>•</span>
                      <span>{format.audioSpecs}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between">
                  <div className="text-[11px] text-neutral-500">{format.feature}</div>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-amber-400 text-neutral-950' : 'border border-neutral-700 text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Date Selection */}
      <div className="space-y-3 pt-2">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-400" />
          Select Date
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {dates.map((d) => {
            const isSelected = selectedDate === d.iso;
            return (
              <button
                key={d.iso}
                onClick={() => onSelectDate(d.iso)}
                className={`py-3 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-neutral-900 border-amber-400 ring-1 ring-amber-400/40 text-white'
                    : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                <div className="font-semibold text-sm">{d.label}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{d.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Showtime Selection */}
      <div className="space-y-3 pt-2">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          Select Showtime ({selectedFormat.name})
        </h3>

        {times.length === 0 && <p className="text-xs text-neutral-500">No showtimes on this day for {selectedFormat.name}.</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {times.map((time) => {
            const isSelected = selectedTime === time;
            const past = isPast(time);
            return (
              <button
                key={time}
                disabled={past}
                onClick={() => onSelectTime(time)}
                className={`py-3 px-4 rounded-xl border text-center transition-all ${
                  past
                    ? 'bg-neutral-900/30 border-neutral-800/60 text-neutral-600 cursor-not-allowed'
                    : isSelected
                    ? 'bg-amber-400 border-amber-400 text-neutral-950 font-bold shadow-md shadow-amber-400/20 cursor-pointer'
                    : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white cursor-pointer'
                }`}
              >
                <div className={`text-sm font-semibold tabular-nums ${past ? 'line-through' : ''}`}>{niceTime(time)}</div>
                <div className={`text-[11px] mt-0.5 ${past ? 'text-neutral-700' : isSelected ? 'text-neutral-900 font-medium' : 'text-neutral-500'}`}>
                  {past ? 'Already started' : selectedFormat.auditorium}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Continue Action */}
      <div className="pt-6 border-t border-neutral-800 flex items-center justify-between">
        <button onClick={onBack} className="text-xs font-semibold text-neutral-400 hover:text-white flex items-center gap-1.5 cursor-pointer py-2 px-3">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <button
          onClick={onContinue}
          disabled={!selectedTime}
          className={`px-6 py-3 font-bold rounded-xl text-sm transition-all flex items-center gap-2 ${
            selectedTime
              ? 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-lg shadow-amber-400/20 cursor-pointer'
              : 'bg-neutral-800 text-neutral-500 border border-neutral-800 cursor-not-allowed'
          }`}
        >
          <span>{selectedTime ? 'Choose Your Seats' : 'Pick a Showtime'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
