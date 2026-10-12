import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Order } from '../types';
import { api, backdropUrl, niceDate, niceTime, posterUrl } from '../api';
import { Printer, CheckCircle, Sparkles, UtensilsCrossed, Armchair, Film } from 'lucide-react';

interface TicketPassProps {
  order: Order;
  onBookAnother: () => void;
}

export const TicketPass: React.FC<TicketPassProps> = ({ order, onBookAnother }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The QR holds a plain link, so a phone's built-in scanner (Samsung camera, etc.) opens the ticket in the
      // admin page. A ticket made on this PC (localhost) gets the PC's network address so phones can reach it.
      let base = window.location.origin;
      if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        try {
          base = (await api('/api/config')).lanUrl || base;
        } catch {
          /* fall back to this page's address */
        }
      }
      try {
        const url = await QRCode.toDataURL(`${base}/admin?ticket=${order.id}`, {
          width: 280,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0a0a0c', light: '#ffffff' },
        });
        if (!cancelled) setQrCodeUrl(url);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  // The saved PDF / print job is named after the booking
  const handlePrint = () => {
    const title = document.title;
    document.title = `Lumen Cinema ticket ${order.id}`;
    window.print();
    document.title = title;
  };

  const genres = order.movie.genres || [];

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Confirmation Message */}
      <div className="no-print text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-xs font-semibold">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Booking Confirmed & Seats Reserved</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Your Digital Cinema Admission Pass</h2>
        <p className="text-xs text-neutral-400">
          Present this digital QR pass at the auditorium entrance and concession pick-up counter.
        </p>
      </div>

      {/* Ticket Card Container with Perforated Cut-Out Styling */}
      <div className="print-ticket relative bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
        {/* Top Header of Ticket */}
        <div className="relative p-6 sm:p-8 bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 border-b border-neutral-800">
          {/* Subtle Movie Backdrop Glow */}
          {order.movie.backdropPath && (
            <div
              className="absolute inset-0 opacity-15 bg-cover bg-center filter blur-md pointer-events-none"
              style={{ backgroundImage: `url(${backdropUrl(order.movie.backdropPath)})` }}
            />
          )}

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-neutral-950 font-black text-lg shadow-md shadow-amber-400/20">
                L
              </span>
              <div>
                <div className="text-sm font-bold tracking-widest text-white uppercase">LUMEN CINEMA</div>
                <div className="text-[11px] text-neutral-400">
                  Confirmation Code: <span className="font-mono text-amber-400 font-semibold">{order.id}</span>
                </div>
              </div>
            </div>

            {/* Theater Format Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/10 border border-amber-400/40 text-amber-400 text-xs font-bold tracking-wide w-fit">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{order.format.name}</span>
            </div>
          </div>
        </div>

        {/* Middle Section: Movie & Screening Particulars */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Movie Poster */}
            <div className="w-24 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-neutral-800 shrink-0">
              <img src={posterUrl(order.movie.posterPath, 'w342')} alt={order.movie.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>

            {/* Feature Details */}
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight">{order.movie.title}</h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mt-1">
                  <span>{order.movie.certification || 'NR'}</span>
                  {order.movie.runtime > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{order.movie.runtime} min</span>
                    </>
                  )}
                  {genres.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{genres.slice(0, 2).join(', ')}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Theater Logistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-3 border-t border-neutral-800/80 text-xs">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">Auditorium</div>
                  <div className="text-sm font-bold text-neutral-200 mt-0.5">{order.format.auditorium}</div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">Date & Time</div>
                  <div className="text-sm font-bold text-amber-400 mt-0.5">
                    {niceDate(order.date)} · {niceTime(order.time)}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium flex items-center gap-1">
                    <Armchair className="w-3 h-3 text-neutral-400" />
                    Seats Reserved
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">{order.seats.join(', ')}</div>
                </div>

                <div className="col-span-2 sm:col-span-3">
                  <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">Tickets</div>
                  <div className="text-sm font-bold text-neutral-200 mt-0.5">{order.tickets.map((t) => `${t.qty} ${t.name}`).join(', ')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Concession Snacks Section if ordered */}
          {order.snacks.length > 0 && (
            <div className="p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
                  Concession Stand Order & Express Pickup
                </span>
                <span className="text-[11px] text-neutral-400 shrink-0">{order.snacksDispensed ? 'Dispensed' : 'Ready at Counter 2'}</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {order.snacks.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 px-2.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
                    <span className="font-bold text-amber-400 tabular-nums">{item.qty}x</span>
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Perforated Divider Bar with Half Circles */}
        <div className="relative flex items-center">
          <div className="ticket-notch w-6 h-6 -ml-3 rounded-full bg-neutral-950 border-r border-neutral-800" />
          <div className="flex-1 border-t-2 border-dashed border-neutral-800 my-2" />
          <div className="ticket-notch w-6 h-6 -mr-3 rounded-full bg-neutral-950 border-l border-neutral-800" />
        </div>

        {/* Bottom Section: Scannable QR Code */}
        <div className="p-6 sm:p-8 bg-neutral-950 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <div className="text-xs font-bold text-white uppercase tracking-wider">Scannable Admission QR</div>
            <p className="text-xs text-neutral-400 max-w-sm">
              Valid for admission of <strong className="text-white">{order.seats.length} guest(s)</strong>. Real-time verified by LUMEN theater gate scanners.
            </p>
            <div className="text-[11px] font-mono text-neutral-500 pt-1">
              Order ID: <span className="text-neutral-300">{order.id}</span> · Guest: {order.customer.name}
            </div>
          </div>

          {/* QR Code Container */}
          <div className="p-3 bg-white rounded-2xl shadow-xl shrink-0 flex items-center justify-center">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="Ticket QR Code" className="w-36 h-36 object-contain" />
            ) : (
              <div className="w-36 h-36 bg-neutral-200 animate-pulse rounded-lg" />
            )}
          </div>
        </div>
      </div>

      {/* Ticket Actions */}
      <div className="no-print flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <button
          onClick={handlePrint}
          disabled={!qrCodeUrl}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-neutral-900 text-xs font-semibold text-neutral-300 hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          Print / Save Ticket
        </button>

        <button
          onClick={onBookAnother}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-xs font-bold text-neutral-950 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-400/20"
        >
          <Film className="w-4 h-4" />
          <span>Book Another Movie</span>
        </button>
      </div>
    </div>
  );
};
