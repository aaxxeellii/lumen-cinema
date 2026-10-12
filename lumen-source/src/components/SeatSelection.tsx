import React from 'react';
import { Catalog, TheaterFormat, Movie } from '../types';
import { computeTotals, dealName, money, niceDate, niceTime, percentOff, round2, sortSeats } from '../api';
import { ArrowLeft, ArrowRight, Armchair, Info } from 'lucide-react';

interface SeatSelectionProps {
  catalog: Catalog;
  movie: Movie;
  format: TheaterFormat;
  date: string;
  showtime: string;
  tickets: Record<string, number>;
  onChangeTickets: (typeId: string, delta: number) => void;
  takenSeats: Set<string>;
  selectedSeats: string[];
  onToggleSeat: (seatId: string) => void;
  notice: string;
  onContinue: () => void;
  onBack: () => void;
}

export const SeatSelection: React.FC<SeatSelectionProps> = ({
  catalog,
  movie,
  format,
  date,
  showtime,
  tickets,
  onChangeTickets,
  takenSeats,
  selectedSeats,
  onToggleSeat,
  notice,
  onContinue,
  onBack,
}) => {
  const rows = Array.from({ length: format.rows }, (_, i) => String.fromCharCode(65 + i));
  const cols = Array.from({ length: format.cols }, (_, i) => i + 1);
  // The two rows about two thirds of the way back have the best view
  const primeStart = Math.max(0, Math.round(format.rows * 0.65) - 1);
  const primeRows = rows.slice(primeStart, primeStart + 2);

  const ticketCount = Object.values(tickets).reduce((a, b) => a + b, 0);
  const seatsLeft = ticketCount - selectedSeats.length;
  const totals = computeTotals(catalog, format, tickets, []);
  const ready = ticketCount > 0 && seatsLeft === 0;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Header & Breadcrumb */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>{movie.title}</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-400 font-medium">{format.name}</span>
            <span aria-hidden="true">·</span>
            <span>{niceDate(date)} at {niceTime(showtime)}</span>
            <span aria-hidden="true">·</span>
            <span>{format.auditorium}</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Select Seats & Tickets</h2>
        </div>

        {/* Tickets by age */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {catalog.ticketTypes.map((type) => {
            const qty = tickets[type.id] || 0;
            return (
              <div key={type.id} className="flex items-center justify-between gap-3 bg-neutral-950 border border-neutral-800 px-4 py-2.5 rounded-xl">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {type.name} <span className="text-xs font-bold text-amber-400 tabular-nums">{money(round2(format.price * type.multiplier))}</span>
                    {percentOff(format.price, format.was) > 0 && (
                      <span className="ml-1.5 text-[11px] font-medium text-neutral-500 line-through tabular-nums">{money(round2(format.was! * type.multiplier))}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500">{type.note}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onChangeTickets(type.id, -1)}
                    disabled={qty === 0}
                    aria-label={`Fewer ${type.name} tickets`}
                    className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 flex items-center justify-center font-bold text-sm cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-white tabular-nums">{qty}</span>
                  <button
                    onClick={() => onChangeTickets(type.id, 1)}
                    disabled={ticketCount >= catalog.maxTickets}
                    aria-label={`More ${type.name} tickets`}
                    className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 flex items-center justify-center font-bold text-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {(format.deal || percentOff(format.price, format.was) > 0) && (
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            {percentOff(format.price, format.was) > 0 && (
              <span className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400">{percentOff(format.price, format.was)}% off {format.name} tickets</span>
            )}
            {format.deal && (
              <span className="px-2 py-1 rounded-md bg-red-500 text-white">
                {dealName(format.deal)} · take {format.deal.take} tickets, pay for {format.deal.pay} (the cheapest go free)
              </span>
            )}
          </div>
        )}
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Screen Visual */}
      <div className="relative pt-4 pb-12 flex flex-col items-center">
        {/* Curved Screen Line */}
        <div className="w-full max-w-2xl h-8 relative flex items-center justify-center">
          <div className="absolute inset-x-8 top-0 h-4 border-t-4 border-amber-400/80 rounded-[50%] shadow-[0_-12px_24px_rgba(251,191,36,0.25)]" />
          <div className="absolute top-4 text-[11px] font-bold tracking-widest text-neutral-500 uppercase">
            {format.name} Screen
          </div>
        </div>

        {/* Ambient Screen Light Projection Beam */}
        <div className="w-3/4 max-w-xl h-24 bg-gradient-to-b from-amber-400/10 via-amber-400/5 to-transparent blur-xl pointer-events-none -mt-2" />

        {/* Interactive Seats Layout Grid (scrolls sideways on small screens for the widest rooms) */}
        <div className="w-full overflow-x-auto pb-2">
          <div className="w-max mx-auto space-y-3 px-2">
            {rows.map((row) => (
              <div key={row} className="flex items-center justify-center gap-2 sm:gap-3">
                <span className="w-5 text-center text-xs font-bold text-neutral-500 select-none">{row}</span>

                <div className="flex items-center gap-1 sm:gap-1.5">
                  {cols.map((col) => {
                    const seatId = `${row}${col}`;
                    const isReserved = takenSeats.has(seatId);
                    const isSelected = selectedSeats.includes(seatId);
                    const isPrimeRow = primeRows.includes(row);

                    return (
                      <React.Fragment key={seatId}>
                        <button
                          type="button"
                          disabled={isReserved}
                          onClick={() => onToggleSeat(seatId)}
                          title={`Row ${row}, Seat ${col} - ${isReserved ? 'Reserved' : isSelected ? 'Selected' : 'Available'}`}
                          className={`group relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold transition-all duration-150 ${
                            isReserved
                              ? 'bg-neutral-800/40 text-neutral-600 border border-neutral-800/60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-amber-400 text-neutral-950 font-bold border border-amber-300 shadow-md shadow-amber-400/30 scale-105 cursor-pointer'
                              : isPrimeRow
                              ? 'bg-neutral-900 border border-amber-500/30 text-amber-300 hover:border-amber-400 hover:bg-neutral-800 cursor-pointer'
                              : 'bg-neutral-900 border border-neutral-700/80 text-neutral-300 hover:border-neutral-500 hover:bg-neutral-800 cursor-pointer'
                          }`}
                        >
                          <Armchair className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSelected ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
                          <span className="sr-only">{seatId}</span>
                        </button>

                        {/* Aisle space gap */}
                        {format.aisles.includes(col) && <div className="w-3 sm:w-6" />}
                      </React.Fragment>
                    );
                  })}
                </div>

                <span className="w-5 text-center text-xs font-bold text-neutral-500 select-none">{row}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-8 pt-6 border-t border-neutral-800/80 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-neutral-900 border border-neutral-700 flex items-center justify-center">
              <Armchair className="w-3 h-3 text-neutral-400" />
            </div>
            <span>Standard Seat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-neutral-900 border border-amber-500/40 flex items-center justify-center">
              <Armchair className="w-3 h-3 text-amber-400" />
            </div>
            <span>Prime View (Rows {primeRows.join('-')})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-amber-400 text-neutral-950 flex items-center justify-center font-bold">
              <Armchair className="w-3 h-3 text-neutral-950" />
            </div>
            <span>Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-neutral-800/40 border border-neutral-800 flex items-center justify-center">
              <Armchair className="w-3 h-3 text-neutral-600" />
            </div>
            <span>Occupied / Reserved</span>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Order Bar */}
      <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span>Selected Seats ({selectedSeats.length}):</span>
            <span className="font-semibold text-white">
              {selectedSeats.length > 0 ? sortSeats(selectedSeats).join(', ') : 'None selected'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white tabular-nums">{money(totals.total)}</span>
            <span className="text-xs text-neutral-400">total for {ticketCount} ticket{ticketCount === 1 ? '' : 's'} in {format.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400">
            {totals.ticketLines.map((line) => (
              <React.Fragment key={line.name}>
                <span className="tabular-nums">{line.qty} × {line.name} {money(line.total)}</span>
                <span aria-hidden="true" className="text-neutral-600">·</span>
              </React.Fragment>
            ))}
            {totals.deals.map((deal) => (
              <React.Fragment key={deal.name}>
                <span className="tabular-nums text-emerald-400">{deal.name} -{money(deal.amount)}</span>
                <span aria-hidden="true" className="text-neutral-600">·</span>
              </React.Fragment>
            ))}
            <span className="tabular-nums">Booking fee {money(totals.fees)}</span>
            <span aria-hidden="true" className="text-neutral-600">·</span>
            <span className="tabular-nums">Tax ({Math.round(catalog.cinema.taxRate * 100)}%) {money(totals.tax)}</span>
          </div>
          {!ready && (
            <p className="text-[11px] text-amber-400/90 flex items-center gap-1">
              <Info className="w-3 h-3" />
              {ticketCount === 0
                ? 'Add at least one ticket to choose seats'
                : `Please pick ${seatsLeft} more seat${seatsLeft === 1 ? '' : 's'} to match your tickets`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onBack}
            className="text-xs font-semibold text-neutral-400 hover:text-white px-4 py-2.5 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-neutral-900 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <button
            onClick={onContinue}
            disabled={!ready}
            className={`px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
              ready
                ? 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-lg shadow-amber-400/20 cursor-pointer'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-800'
            }`}
          >
            <span>Proceed to Snacks ({selectedSeats.length} Seats)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
