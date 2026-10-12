/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CartSnack, Catalog, Movie, Order } from './types';
import { api, cartKey, isoDate, seededTaken } from './api';
import { Navbar } from './components/Navbar';
import { MovieSearch } from './components/MovieSearch';
import { FormatAndShowtime } from './components/FormatAndShowtime';
import { SeatSelection } from './components/SeatSelection';
import { SnacksSelection } from './components/SnacksSelection';
import { PaymentScreen } from './components/PaymentScreen';
import { TicketPass } from './components/TicketPass';
import { AdminPortal } from './components/AdminPortal';
import { Film, Sparkles, Armchair, UtensilsCrossed, CreditCard } from 'lucide-react';

type View = 'booking' | 'admin' | 'ticket';

const isAdminPath = () => window.location.pathname.replace(/\/$/, '') === '/admin';
const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState('');
  const [currentView, setCurrentView] = useState<View>(isAdminPath() ? 'admin' : 'booking');

  // Booking wizard steps: 1 = movie, 2 = format/time, 3 = seats, 4 = snacks, 5 = payment
  const [bookingStep, setBookingStep] = useState<number>(1);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [formatId, setFormatId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(isoDate(new Date()));
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Record<string, number>>({});
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [takenSeats, setTakenSeats] = useState<Set<string>>(new Set());
  const [seatNotice, setSeatNotice] = useState('');
  const [cartSnacks, setCartSnacks] = useState<CartSnack[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const format = catalog?.formats.find((f) => f.id === formatId) || catalog?.formats[0];
  const showingKey = selectedMovie && format ? `${selectedMovie.id}|${format.id}|${selectedDate}|${selectedTime}` : '';

  useEffect(() => {
    (async () => {
      try {
        setCatalog(await api<Catalog>('/api/catalog'));
      } catch (err: any) {
        setLoadError(err.message || 'Could not reach the server.');
        return;
      }
      // A ticket link (/#ticket/LC-...) reopens that pass, e.g. after a refresh.
      const ticketId = window.location.hash.match(/^#ticket\/([\w-]+)$/)?.[1];
      if (ticketId && !isAdminPath()) {
        try {
          setActiveOrder(await api<Order>('/api/orders/' + ticketId));
          setCurrentView('ticket');
        } catch {
          window.history.replaceState(null, '', '/');
        }
      }
    })();

    const handlePopState = () => setCurrentView(isAdminPath() ? 'admin' : 'booking');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  /** Pick up prices, stock and showtimes changed in the admin page since this tab was opened. */
  const reloadCatalog = () => api<Catalog>('/api/catalog').then(setCatalog).catch(() => {});

  const goToStep = (step: number) => {
    if (step === 2 || step === 4) reloadCatalog();
    setBookingStep(step);
    toTop();
  };

  const handleNavigate = (view: View) => {
    setCurrentView(view);
    const url = view === 'admin' ? '/admin' : view === 'ticket' && activeOrder ? '/#ticket/' + activeOrder.id : '/';
    window.history.pushState({}, '', url);
    toTop();
  };

  const handleResetBooking = () => {
    setSelectedMovie(null);
    setSelectedSeats([]);
    setCartSnacks([]);
    setSeatNotice('');
    setBookingStep(1);
    handleNavigate('booking');
  };

  const handleSelectMovie = (movie: Movie) => {
    if (!catalog) return;
    setSelectedMovie(movie);
    setFormatId(catalog.formats[0].id);
    setSelectedDate(isoDate(new Date()));
    setSelectedTime(null);
    setTickets(Object.fromEntries(catalog.ticketTypes.map((t) => [t.id, t.id === 'adult' ? 2 : 0])));
    setSelectedSeats([]);
    setCartSnacks([]);
    setSeatNotice('');
    goToStep(2);
  };

  /** Seats sold for the chosen showing: real bookings from the server plus the seeded "lived-in" ones. */
  const refreshTaken = async () => {
    if (!format || !showingKey) return;
    let real: string[] = [];
    try {
      real = (await api('/api/seats?showing=' + encodeURIComponent(showingKey))).taken;
    } catch {
      /* the seat map still works without the server's list */
    }
    const taken = new Set([...seededTaken(showingKey, format), ...real]);
    setTakenSeats(taken);
    setSelectedSeats((seats) => seats.filter((s) => !taken.has(s)));
  };

  const ticketCount = Object.values(tickets).reduce((a, b) => a + b, 0);

  const handleChangeTickets = (typeId: string, delta: number) => {
    if (!catalog) return;
    const next = { ...tickets, [typeId]: Math.max(0, (tickets[typeId] || 0) + delta) };
    const count = Object.values(next).reduce((a, b) => a + b, 0);
    if (count > catalog.maxTickets) return;
    setTickets(next);
    setSelectedSeats((seats) => seats.slice(0, count));
  };

  const handleToggleSeat = (seatId: string) => {
    if (takenSeats.has(seatId) || !ticketCount) return;
    setSeatNotice('');
    setSelectedSeats((seats) => {
      if (seats.includes(seatId)) return seats.filter((s) => s !== seatId);
      const next = [...seats, seatId];
      return next.length > ticketCount ? next.slice(1) : next; // picking one too many swaps out the oldest
    });
  };

  const handleAddSnack = (item: CartSnack) => {
    setCartSnacks((prev) => {
      const existing = prev.find((c) => cartKey(c) === cartKey(item));
      if (!existing) return [...prev, item];
      return prev.map((c) => (c === existing ? { ...c, qty: Math.min(20, c.qty + item.qty) } : c));
    });
  };

  const handleRemoveSnack = (key: string) => setCartSnacks((prev) => prev.filter((c) => cartKey(c) !== key));

  const handlePaymentSuccess = (order: Order) => {
    setActiveOrder(order);
    setCurrentView('ticket');
    window.history.replaceState(null, '', '/#ticket/' + order.id);
    toTop();
  };

  /** Someone else booked one of the seats while this customer was paying. */
  const handleSeatsTaken = async (message: string) => {
    await refreshTaken();
    setSeatNotice(message + '. Please pick different seats.');
    goToStep(3);
  };

  const stepsList = [
    { num: 1, label: 'Movie Search', icon: Film },
    { num: 2, label: 'Format & Time', icon: Sparkles },
    { num: 3, label: 'Seats', icon: Armchair },
    { num: 4, label: 'Snacks & Concessions', icon: UtensilsCrossed },
    { num: 5, label: 'Payment', icon: CreditCard },
  ];

  return (
    <div className="app-root min-h-screen bg-neutral-950 text-neutral-100 flex flex-col antialiased selection:bg-amber-400/20 selection:text-amber-200">
      {/* Universal Top Bar */}
      <Navbar
        currentView={currentView}
        hasActiveTicket={Boolean(activeOrder)}
        onHome={handleResetBooking}
        onShowTicket={() => handleNavigate('ticket')}
      />

      {/* Main View Router */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loadError ? (
          <div className="max-w-xl mx-auto mt-16 p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 text-center text-sm text-neutral-300">
            <div className="font-bold text-white mb-1">Could not load the cinema catalog</div>
            {loadError}
          </div>
        ) : !catalog || !format ? (
          <div className="flex justify-center py-32">
            <div className="w-10 h-10 border-4 border-neutral-800 border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : currentView === 'admin' ? (
          <AdminPortal catalog={catalog} onCatalogChange={setCatalog} onBackToBooking={handleResetBooking} />
        ) : currentView === 'ticket' && activeOrder ? (
          <TicketPass order={activeOrder} onBookAnother={handleResetBooking} />
        ) : (
          <div className="space-y-10">
            {/* Hero Banner when starting booking on step 1 */}
            {bookingStep === 1 && !selectedMovie && (
              <div className="relative rounded-3xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-2xl">
                <div className="relative aspect-[21/9] sm:aspect-[2.4/1] w-full overflow-hidden">
                  <img src="/img/hero.jpg" alt="LUMEN IMAX Theater Auditorium" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 via-neutral-950/20 to-transparent" />

                  <div className="absolute bottom-6 left-6 right-6 sm:bottom-10 sm:left-10 sm:right-10 flex flex-col justify-end space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-semibold backdrop-blur-md w-fit">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Next-Generation Cinema Experience</span>
                    </div>

                    <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight max-w-2xl text-balance">
                      IMAX Laser, 4DX, and Dolby Cinema.
                    </h1>

                    <p className="text-xs sm:text-sm text-neutral-300 max-w-xl line-clamp-2 leading-relaxed">
                      Search any film on The Movie Database catalog, pick your prime theater seats, order fresh concession snacks, and collect your digital boarding pass.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Stepper Wizard Bar */}
            {selectedMovie && (
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between max-w-3xl mx-auto overflow-x-auto gap-2">
                  {stepsList.map((step) => {
                    const isPassed = bookingStep > step.num;
                    const isCurrent = bookingStep === step.num;

                    return (
                      <button
                        key={step.num}
                        disabled={step.num > bookingStep}
                        onClick={() => {
                          if (step.num < bookingStep) goToStep(step.num);
                        }}
                        className={`flex items-center gap-2 py-1.5 px-3 rounded-xl text-xs transition-colors shrink-0 ${
                          isCurrent
                            ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm shadow-amber-400/20'
                            : isPassed
                            ? 'text-neutral-300 hover:text-white cursor-pointer'
                            : 'text-neutral-600 cursor-not-allowed'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isCurrent
                              ? 'bg-neutral-950 text-amber-400'
                              : isPassed
                              ? 'bg-neutral-800 text-neutral-300'
                              : 'bg-neutral-900 text-neutral-600'
                          }`}
                        >
                          {isPassed ? '✓' : step.num}
                        </span>
                        <span className="hidden sm:inline">{step.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 1: Movie Search */}
            {bookingStep === 1 && <MovieSearch onSelectMovie={handleSelectMovie} />}

            {/* Step 2: Format & Showtime Selection */}
            {bookingStep === 2 && selectedMovie && (
              <FormatAndShowtime
                movie={selectedMovie}
                schedule={catalog.schedule}
                formats={catalog.formats}
                selectedFormat={format}
                onSelectFormat={(f) => setFormatId(f.id)}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                selectedTime={selectedTime}
                onSelectTime={setSelectedTime}
                onContinue={async () => {
                  setSelectedSeats([]);
                  setSeatNotice('');
                  await refreshTaken();
                  goToStep(3);
                }}
                onBack={() => goToStep(1)}
              />
            )}

            {/* Step 3: Seat Selection */}
            {bookingStep === 3 && selectedMovie && selectedTime && (
              <SeatSelection
                catalog={catalog}
                movie={selectedMovie}
                format={format}
                date={selectedDate}
                showtime={selectedTime}
                tickets={tickets}
                onChangeTickets={handleChangeTickets}
                takenSeats={takenSeats}
                selectedSeats={selectedSeats}
                onToggleSeat={handleToggleSeat}
                notice={seatNotice}
                onContinue={() => goToStep(4)}
                onBack={() => goToStep(2)}
              />
            )}

            {/* Step 4: Snacks Page */}
            {bookingStep === 4 && selectedMovie && (
              <SnacksSelection
                catalog={catalog}
                movie={selectedMovie}
                format={format}
                tickets={tickets}
                selectedSeats={selectedSeats}
                cartSnacks={cartSnacks}
                onAddSnack={handleAddSnack}
                onRemoveSnack={handleRemoveSnack}
                onContinue={() => goToStep(5)}
                onBack={() => goToStep(3)}
              />
            )}

            {/* Step 5: Payment Screen */}
            {bookingStep === 5 && selectedMovie && selectedTime && (
              <PaymentScreen
                catalog={catalog}
                movie={selectedMovie}
                format={format}
                date={selectedDate}
                showtime={selectedTime}
                tickets={tickets}
                selectedSeats={selectedSeats}
                cartSnacks={cartSnacks}
                onPaymentSuccess={handlePaymentSuccess}
                onSeatsTaken={handleSeatsTaken}
                onBack={() => goToStep(4)}
              />
            )}
          </div>
        )}
      </main>

      {/* Universal Footer */}
      <footer className="no-print mt-16 border-t border-neutral-900 bg-neutral-950 py-8 px-6 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-300">LUMEN CINEMA</span>
            <span aria-hidden="true">·</span>
            <span>The Movie Database (TMDB) Integration</span>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => handleNavigate('admin')} className="hover:text-amber-400 transition-colors cursor-pointer">
              Auditorium Scanner Portal (/admin)
            </button>
            <span aria-hidden="true">·</span>
            <span>Protected by 256-bit encryption</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
