import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { Catalog, Order } from '../types';
import { api, money, niceDate, niceTime, paidWith, post, posterUrl, stamp } from '../api';
import { MenuPanel, ShowtimesPanel, TicketsSeatsPanel } from './AdminManage';
import {
  CalendarClock,
  QrCode,
  Camera,
  Upload,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Check,
  UtensilsCrossed,
  Armchair,
  Sparkles,
  CameraOff,
  Lock,
  LogOut,
  RotateCw,
  Trash2,
} from 'lucide-react';

interface AdminPortalProps {
  catalog: Catalog;
  onCatalogChange: (catalog: Catalog) => void;
  onBackToBooking: () => void;
}

const TABS = [
  { id: 'orders', label: 'Scanner & Orders', icon: QrCode },
  { id: 'showtimes', label: 'Showtimes', icon: CalendarClock },
  { id: 'tickets', label: 'Ticket Prices & Seats', icon: Armchair },
  { id: 'menu', label: 'Menu & Stock', icon: UtensilsCrossed },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Accepts the bare code or the ticket link from the QR (.../admin?ticket=LC-...). */
const parseCode = (text: string) => String(text).trim().toUpperCase().match(/(?:^|[?&]TICKET=)(LC-[A-Z0-9]{8})$/)?.[1] || null;

const snackCount = (o: Order) => o.snacks.reduce((sum, s) => sum + s.qty, 0);

/** Staff sign-in shown instead of the console until the server confirms a session. */
const AdminLogin: React.FC<{ onLoggedIn: () => void; onBackToBooking: () => void }> = ({ onLoggedIn, onBackToBooking }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/api/login', { username, password });
      onLoggedIn();
    } catch (err: any) {
      setError(err.status === 401 ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full mt-1 bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400';

  return (
    <div className="max-w-sm mx-auto pt-10 pb-16">
      <form onSubmit={submit} className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 space-y-4">
        <div className="space-y-1">
          <div className="w-11 h-11 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight pt-2">Staff Login</h2>
          <p className="text-xs text-neutral-400">Gate scanner and orders are for cinema staff only.</p>
        </div>

        <div>
          <label className="text-[11px] font-medium text-neutral-400 uppercase">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-neutral-400 uppercase">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          disabled={busy}
          className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-sm shadow-lg shadow-amber-400/20 cursor-pointer disabled:opacity-60"
        >
          {busy ? 'Checking...' : 'Log In'}
        </button>

        <button type="button" onClick={onBackToBooking} className="w-full text-xs text-neutral-400 hover:text-amber-400 cursor-pointer">
          ← Back to Guest Booking
        </button>
      </form>
    </div>
  );
};

export const AdminPortal: React.FC<AdminPortalProps> = ({ catalog, onCatalogChange, onBackToBooking }) => {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabId>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'used'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [restarting, setRestarting] = useState(false);

  // Scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const linkHandled = useRef(false);

  const selectedOrder = orders.find((o) => o.id === selectedId) || null;

  const loadOrders = async (poll = false) => {
    try {
      const fresh = (await api('/api/orders' + (poll ? '?poll=1' : ''))).orders as Order[];
      setOrders((prev) => (JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh));
      return fresh;
    } catch (err: any) {
      if (err.status === 401) setAuthed(false); // session ended
      return null;
    }
  };

  useEffect(() => {
    api('/api/session')
      .then((s) => setAuthed(Boolean(s.admin)))
      .catch(() => setAuthed(false));
  }, []);

  // Keep the list in sync with new bookings while the console is open
  useEffect(() => {
    if (!authed) return;
    (async () => {
      const fresh = await loadOrders();
      // Opened from a scanned ticket link (/admin?ticket=LC-...): go straight to that booking.
      const linked = new URLSearchParams(window.location.search).get('ticket');
      if (fresh && linked && !linkHandled.current) {
        linkHandled.current = true;
        lookup(linked, fresh);
      }
    })();
    const timer = setInterval(() => loadOrders(true), 4000);
    return () => clearInterval(timer);
  }, [authed]);

  // Clean up camera on unmount
  useEffect(() => stopCamera, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        setIsCameraActive(true);
        animationFrameId.current = requestAnimationFrame(tickCamera);
      }
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError(
        window.isSecureContext
          ? 'Camera access unavailable. You can upload a ticket image or type the code.'
          : "Browsers only allow the camera on this PC (localhost). On a phone, scan the ticket with the phone's own QR scanner (on Samsung: the Camera app or \"Scan QR code\" in the quick panel) and tap the link."
      );
      setIsCameraActive(false);
    }
  };

  function stopCamera() {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }

  const tickCamera = () => {
    if (!streamRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
          stopCamera();
          lookup(code.data);
          return;
        }
      }
    }
    animationFrameId.current = requestAnimationFrame(tickCamera);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) lookup(code.data);
        else {
          setSelectedId(null);
          setScanResult({ success: false, message: 'No QR code found in uploaded image. Please ensure the ticket code is visible.' });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  /** Find the booking for scanned or typed text and open it in the detail panel. */
  const lookup = async (text: string, known?: Order[]) => {
    const code = parseCode(text);
    if (!code) {
      setSelectedId(null);
      setScanResult({ success: false, message: `Not a Lumen ticket (${String(text).slice(0, 60)}).` });
      return;
    }
    const list = known || (await loadOrders()) || orders;
    const found = list.find((o) => o.id === code);
    if (found) {
      setSelectedId(found.id);
      setScanResult({
        success: true,
        message: found.status === 'used' ? 'Ticket already admitted previously.' : 'Ticket verified! Valid for admission.',
      });
    } else {
      setSelectedId(null);
      setScanResult({ success: false, message: `No booking with code ${code}.` });
    }
  };

  const handleAdmitGuest = async (orderId: string) => {
    try {
      await post(`/api/orders/${orderId}/checkin`);
    } catch (err: any) {
      setScanResult({ success: false, message: err.message });
    }
    loadOrders();
  };

  const handleToggleSnacks = async (order: Order) => {
    await post(`/api/orders/${order.id}/snacks`, { dispensed: !order.snacksDispensed }).catch(() => {});
    loadOrders();
  };

  const handleClearOrders = async () => {
    if (!orders.length || !confirm(`Delete all ${orders.length} orders? This cannot be undone.`)) return;
    try {
      await post('/api/orders/clear');
    } catch (err: any) {
      alert(err.message);
    }
    setSelectedId(null);
    setScanResult(null);
    loadOrders();
  };

  const handleRestart = async () => {
    if (!confirm('Restart the server now? The site will be unavailable for a few seconds.')) return;
    setRestarting(true);
    try {
      const { bootId } = await post('/api/restart');
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          if ((await api('/api/config?poll=1')).bootId !== bootId) return window.location.reload();
        } catch {
          /* still down */
        }
      }
      alert('The server did not come back. Look at the window it runs in for an error (for example a typo in server.py) and start it again from there.');
    } catch (err: any) {
      alert(err.message);
    }
    setRestarting(false);
  };

  const handleTab = (next: TabId) => {
    if (next !== 'orders') {
      stopCamera();
      // orders placed since the page loaded have lowered meal stock
      api<Catalog>('/api/catalog').then(onCatalogChange).catch(() => {});
    }
    setTab(next);
  };

  const handleLogout = async () => {
    stopCamera();
    await post('/api/logout').catch(() => {});
    setOrders([]);
    setSelectedId(null);
    setAuthed(false);
  };

  if (authed === null) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-10 h-10 border-4 border-neutral-800 border-t-amber-400 rounded-full animate-spin" />
      </div>
    );
  }
  if (!authed) return <AdminLogin onLoggedIn={() => setAuthed(true)} onBackToBooking={onBackToBooking} />;

  const q = searchQuery.toLowerCase();
  const filteredOrders = orders.filter((o) => {
    const matchesQuery = [o.id, o.customer.name, o.movie.title].some((v) => v.toLowerCase().includes(q));
    return matchesQuery && (statusFilter === 'all' || o.status === statusFilter);
  });

  const totalRevenue = orders.reduce((sum, o) => sum + o.totals.total, 0);
  const admittedCount = orders.filter((o) => o.status === 'used').length;
  const confirmedCount = orders.filter((o) => o.status === 'valid').length;

  const headerButton =
    'px-4 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-xs font-semibold text-neutral-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60';

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>Administration Console</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-400 font-medium">LUMEN Audits & Gate Admission</span>
            <span aria-hidden="true">·</span>
            <span>Real-Time Sync</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
            <QrCode className="w-6 h-6 text-amber-400 shrink-0" />
            Gate QR Scanner & Concessions Dispatch
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRestart}
            disabled={restarting}
            title="Restart the Python server to load changes to server.py, config.json or catalog.json"
            className={headerButton}
          >
            <RotateCw className={`w-3.5 h-3.5 ${restarting ? 'animate-spin' : ''}`} />
            {restarting ? 'Restarting…' : 'Restart Server'}
          </button>
          <button onClick={handleLogout} className={headerButton}>
            <LogOut className="w-3.5 h-3.5" />
            Log Out
          </button>
          <button onClick={onBackToBooking} className={headerButton}>
            ← Back to Guest Booking
          </button>
        </div>
      </div>

      {/* Console sections */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleTab(id)}
            className={`px-4 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              tab === id
                ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm shadow-amber-400/20'
                : 'bg-neutral-900/70 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'showtimes' && <ShowtimesPanel catalog={catalog} onCatalogChange={onCatalogChange} />}
      {tab === 'tickets' && <TicketsSeatsPanel catalog={catalog} onCatalogChange={onCatalogChange} />}
      {tab === 'menu' && <MenuPanel catalog={catalog} onCatalogChange={onCatalogChange} />}

      {tab === 'orders' && (
        <>
      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5">
          <div className="text-xs text-neutral-400 font-medium">Total Bookings</div>
          <div className="text-2xl font-black text-white mt-1 tabular-nums">{orders.length}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Confirmed guest orders</div>
        </div>

        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5">
          <div className="text-xs text-neutral-400 font-medium">Admitted into Theaters</div>
          <div className="text-2xl font-black text-emerald-400 mt-1 tabular-nums">{admittedCount}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Scanned & checked in</div>
        </div>

        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5">
          <div className="text-xs text-neutral-400 font-medium">Pending Admissions</div>
          <div className="text-2xl font-black text-amber-400 mt-1 tabular-nums">{confirmedCount}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Awaiting gate scan</div>
        </div>

        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5">
          <div className="text-xs text-neutral-400 font-medium">Box Office Revenue</div>
          <div className="text-2xl font-black text-white mt-1 tabular-nums">{money(totalRevenue)}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Gross tickets & concessions</div>
        </div>
      </div>

      {/* QR Scanner & Verification Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Interactive Scanner Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" />
                Live Ticket QR Scanner
              </h3>
              <span className="text-[11px] text-neutral-400">{isCameraActive ? 'Camera Active' : 'Standby'}</span>
            </div>

            {/* Video Feed or Placeholder Box */}
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-800 flex items-center justify-center">
              <video ref={videoRef} className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`} />
              <canvas ref={canvasRef} className="hidden" />

              {/* Scanning Reticle Frame if active */}
              {isCameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-amber-400/80 rounded-2xl relative shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                    <div className="absolute inset-x-0 top-1/2 h-0.5 bg-amber-400/90 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse" />
                  </div>
                  <div className="absolute bottom-3 text-[11px] font-semibold text-neutral-300 bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-sm">
                    Align ticket QR within frame
                  </div>
                </div>
              )}

              {/* Camera inactive state */}
              {!isCameraActive && (
                <div className="text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 mx-auto flex items-center justify-center text-neutral-400">
                    <CameraOff className="w-6 h-6" />
                  </div>
                  <div className="text-xs text-neutral-400 max-w-xs">
                    Use your device camera to scan passes at the door, upload a ticket file, or run a test scan.
                  </div>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Scanner Action Buttons */}
            <div className="space-y-2.5">
              <div className="flex gap-2">
                {isCameraActive ? (
                  <button
                    onClick={stopCamera}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CameraOff className="w-3.5 h-3.5" />
                    Turn Off Camera
                  </button>
                ) : (
                  <button
                    onClick={startCamera}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-amber-400/20"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Open Camera Scanner
                  </button>
                )}

                <label className="py-2.5 px-3.5 rounded-xl border border-neutral-700 hover:border-neutral-600 bg-neutral-900 text-xs font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 shrink-0">
                  <Upload className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Upload QR</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              {/* Type the code printed under the QR */}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualCode.trim()) lookup(manualCode);
                }}
              >
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Or type the code, e.g. LC-AB12CD34"
                  aria-label="Ticket code"
                  className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-amber-400"
                />
                <button className="py-2.5 px-3.5 rounded-xl border border-neutral-700 hover:border-neutral-600 bg-neutral-900 text-xs font-medium text-neutral-300 hover:text-white cursor-pointer shrink-0">
                  Look Up
                </button>
              </form>

              {/* Quick test scan button */}
              <button
                onClick={() => orders[0] && lookup(orders[0].id)}
                disabled={!orders.length}
                className="w-full py-2.5 px-3 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 text-xs font-medium text-neutral-400 hover:text-amber-400 transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Test-Scan Latest Booking ({orders[0]?.id || 'none yet'})
              </button>
            </div>
          </div>
        </div>

        {/* Right: Scanned Ticket Inspection Card (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-base text-white">Ticket Verification Detail</h3>
              {selectedOrder && (
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                    selectedOrder.status === 'used'
                      ? 'bg-blue-950 border border-blue-500/40 text-blue-400'
                      : 'bg-emerald-950 border border-emerald-500/40 text-emerald-400'
                  }`}
                >
                  {selectedOrder.status === 'used' ? 'Admitted to Screen' : 'Valid Ticket'}
                </span>
              )}
            </div>

            {scanResult && !selectedOrder && (
              <div
                className={`p-4 rounded-xl border flex items-center gap-3 text-xs break-all ${
                  scanResult.success ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-red-950/40 border-red-500/30 text-red-300'
                }`}
              >
                {scanResult.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
                <span>{scanResult.message}</span>
              </div>
            )}

            {selectedOrder ? (
              <div className="space-y-6">
                {/* Feature Synopsis & Format */}
                <div className="flex gap-4 items-start p-4 rounded-xl bg-neutral-950/80 border border-neutral-800">
                  <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden border border-neutral-800 shrink-0">
                    <img
                      src={posterUrl(selectedOrder.movie.posterPath, 'w185')}
                      alt={selectedOrder.movie.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-400">{selectedOrder.format.name}</span>
                      <span className="text-xs font-mono text-neutral-400">{selectedOrder.id}</span>
                    </div>
                    <h4 className="text-lg font-bold text-white">{selectedOrder.movie.title}</h4>
                    <div className="text-xs text-neutral-400">
                      {niceDate(selectedOrder.date)} · {niceTime(selectedOrder.time)} · {selectedOrder.format.auditorium}
                    </div>
                    <div className="text-xs text-neutral-300 pt-1 flex items-center gap-1.5">
                      <Armchair className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span>
                        Reserved Seats: <strong className="text-white">{selectedOrder.seats.join(', ')}</strong> ({selectedOrder.seats.length} guests ·{' '}
                        {selectedOrder.tickets.map((t) => `${t.qty} ${t.name}`).join(', ')})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Snack Choices Breakdown & Dispense Checkbox */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
                      Ordered Concessions ({snackCount(selectedOrder)} items)
                    </h5>
                    {selectedOrder.snacks.length > 0 && (
                      <button
                        onClick={() => handleToggleSnacks(selectedOrder)}
                        className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
                          selectedOrder.snacksDispensed
                            ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-400'
                            : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                        }`}
                      >
                        {selectedOrder.snacksDispensed ? 'Dispensed ✓' : 'Mark as Dispensed'}
                      </button>
                    )}
                  </div>

                  {selectedOrder.snacks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedOrder.snacks.map((item, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-md bg-neutral-800 text-amber-400 font-bold flex items-center justify-center tabular-nums shrink-0">
                              {item.qty}
                            </span>
                            <span className="text-white font-medium">{item.name}</span>
                          </div>
                          <span className="text-neutral-400 tabular-nums">{money(item.total)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800 text-xs text-neutral-500">
                      No concession snacks were ordered for this screening.
                    </div>
                  )}
                </div>

                {(selectedOrder.deals || []).map((deal) => (
                  <div key={deal.name} className="flex justify-between gap-3 px-3.5 text-xs text-emerald-400">
                    <span>Offer applied: {deal.name}</span>
                    <span className="font-semibold tabular-nums">-{money(deal.amount)}</span>
                  </div>
                ))}

                {/* Guest & Payment Particulars */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs">
                  <div>
                    <span className="text-neutral-500 text-[11px] block">Guest Name</span>
                    <span className="font-semibold text-neutral-200">{selectedOrder.customer.name}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 text-[11px] block">Payment Method</span>
                    <span className="font-medium text-neutral-300">{paidWith(selectedOrder)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 text-[11px] block">Total Paid</span>
                    <span className="font-bold text-amber-400 tabular-nums">{money(selectedOrder.totals.total)}</span>
                  </div>
                </div>

                {/* Action: Admit Guest Button */}
                <div className="pt-2 flex gap-3">
                  {selectedOrder.status !== 'used' ? (
                    <button
                      onClick={() => handleAdmitGuest(selectedOrder.id)}
                      className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Admit Guest into Theater</span>
                    </button>
                  ) : (
                    <div className="flex-1 py-3 px-4 rounded-xl bg-blue-950/80 border border-blue-500/40 text-blue-300 font-semibold text-xs flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Guest Already Admitted ({stamp(selectedOrder.checkedInAt) || 'Earlier'})</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-500 text-xs space-y-2">
                <QrCode className="w-8 h-8 mx-auto text-neutral-600" />
                <p>No ticket selected. Scan a pass via camera or click an order below.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Orders Directory Table */}
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-base text-white">All Cinema Reservations & Requests</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Persistent records of all guest transactions and tickets · cleared automatically every night at 12:00 AM</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
              <input
                type="text"
                placeholder="Search order ID, movie, guest..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 w-full sm:w-64"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  statusFilter === 'all' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('valid')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  statusFilter === 'valid' ? 'bg-amber-400 text-neutral-950 font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setStatusFilter('used')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  statusFilter === 'used' ? 'bg-blue-500 text-white font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Admitted
              </button>
            </div>

            <button
              onClick={handleClearOrders}
              disabled={!orders.length}
              className="px-3.5 py-2 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All Orders
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400 font-semibold uppercase text-[11px]">
                <th className="py-3 px-3">Order / Pass ID</th>
                <th className="py-3 px-3">Movie & Format</th>
                <th className="py-3 px-3">Screening & Seats</th>
                <th className="py-3 px-3">Concessions</th>
                <th className="py-3 px-3">Guest</th>
                <th className="py-3 px-3">Total</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  className={`hover:bg-neutral-800/60 transition-colors cursor-pointer ${selectedId === order.id ? 'bg-neutral-800/90' : ''}`}
                >
                  <td className="py-3.5 px-3 font-mono font-medium text-white whitespace-nowrap">{order.id}</td>
                  <td className="py-3.5 px-3">
                    <div className="font-bold text-white line-clamp-1">{order.movie.title}</div>
                    <div className="text-[11px] text-amber-400 font-semibold">{order.format.name}</div>
                  </td>
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <div className="text-neutral-300 font-medium">
                      {niceTime(order.time)} · {niceDate(order.date)}
                    </div>
                    <div className="text-[11px] text-neutral-400 font-mono">Seats: {order.seats.join(', ')}</div>
                  </td>
                  <td className="py-3.5 px-3">
                    {order.snacks.length > 0 ? (
                      <span className="text-neutral-300">{snackCount(order)} items</span>
                    ) : (
                      <span className="text-neutral-500">None</span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-neutral-300 whitespace-nowrap">{order.customer.name}</td>
                  <td className="py-3.5 px-3 font-bold text-amber-400 tabular-nums whitespace-nowrap">{money(order.totals.total)}</td>
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        order.status === 'used'
                          ? 'bg-blue-950 text-blue-400 border border-blue-500/30'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {order.status === 'used' ? 'admitted' : 'confirmed'}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-right whitespace-nowrap">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(order.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium cursor-pointer"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && (
            <div className="py-10 text-center text-xs text-neutral-500">
              {orders.length ? 'No orders match this search.' : 'No orders yet. Book a ticket on the guest site and it will show up here.'}
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};
