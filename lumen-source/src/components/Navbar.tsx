import React from 'react';
import { Film } from 'lucide-react';

interface NavbarProps {
  currentView: 'booking' | 'admin' | 'ticket';
  hasActiveTicket: boolean;
  onHome: () => void;
  onShowTicket: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, hasActiveTicket, onHome, onShowTicket }) => {
  return (
    <header className="no-print sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800/80 px-4 sm:px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 sm:gap-8">
        <button
          onClick={onHome}
          className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2.5 whitespace-nowrap shrink-0 hover:text-amber-400 transition-colors cursor-pointer text-left"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-neutral-950 font-black text-base shadow-sm shadow-amber-500/20">
            L
          </span>
          <span className="tracking-wider">LUMEN CINEMA</span>
        </button>

        {currentView === 'admin' ? (
          <button
            onClick={onHome}
            className="px-4 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 shadow-sm shadow-amber-400/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Film className="w-3.5 h-3.5" />
            Guest Booking
          </button>
        ) : (
          <nav className="flex items-center gap-5 sm:gap-8 text-sm font-medium text-neutral-400">
            <button
              onClick={onHome}
              className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                currentView === 'booking' ? 'text-amber-400 font-semibold' : 'hover:text-neutral-200'
              }`}
            >
              Movies
            </button>
            {hasActiveTicket && (
              <button
                onClick={onShowTicket}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  currentView === 'ticket' ? 'text-amber-400 font-semibold' : 'hover:text-neutral-200'
                }`}
              >
                Current Pass
              </button>
            )}
          </nav>
        )}
      </div>
    </header>
  );
};
