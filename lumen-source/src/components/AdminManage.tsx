import React, { useEffect, useState } from 'react';
import { Catalog, Deal, ExtraShowtime, Order, SnackItem, TheaterFormat } from '../types';
import { api, dealName, fromPrice, isoDate, money, niceTime, percentOff, post, round2, snackLeft } from '../api';
import { SnackPhoto } from './SnacksSelection';
import { Armchair, CalendarPlus, Check, ImagePlus, Package, Pencil, Plus, RefreshCw, Save, Trash2, User, X } from 'lucide-react';

interface PanelProps {
  catalog: Catalog;
  onCatalogChange: (catalog: Catalog) => void;
}

const CATEGORIES = ['Popcorn & Classics', 'Beverages', 'Fresh & Healthy', 'Confections'];

const card = 'bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 space-y-5';
const label = 'text-[11px] font-medium text-neutral-400 uppercase';
const input =
  'w-full mt-1 bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-amber-400';
const primaryButton =
  'px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 text-xs font-bold shadow-sm shadow-amber-400/20 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed';
const plainButton =
  'px-3.5 py-2 rounded-xl border border-neutral-700 hover:border-neutral-600 bg-neutral-900 text-xs font-medium text-neutral-300 hover:text-white cursor-pointer flex items-center justify-center gap-1.5';

/** Sends an edit to the server and keeps a short "Saved" / error message for the panel. */
function useSave(onCatalogChange: (catalog: Catalog) => void) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (body: unknown, done = 'Saved.') => {
    setSaving(true);
    try {
      onCatalogChange(await post<Catalog>('/api/admin/catalog', body));
      setStatus({ ok: true, text: done });
      return true;
    } catch (err: any) {
      setStatus({ ok: false, text: err.message || 'Could not save.' });
      return false;
    } finally {
      setSaving(false);
    }
  };
  const message = status && (
    <span role="status" className={`text-xs ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
      {status.text}
    </span>
  );
  return { save, saving, message, setStatus };
}

/* ------------------------------------------------------------------ showtimes */

export const ShowtimesPanel: React.FC<PanelProps> = ({ catalog, onCatalogChange }) => {
  const { save, saving, message } = useSave(onCatalogChange);
  const today = isoDate(new Date());
  const [formatId, setFormatId] = useState(catalog.formats[0].id);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('20:00');

  const extras = catalog.extraShowtimes || [];
  const formatName = (id: string) => catalog.formats.find((f) => f.id === id)?.name || id;
  const isExtra = (f: string, d: string, t: string) => extras.some((e) => e.formatId === f && e.date === d && e.time === t);
  const dates = Object.keys(catalog.schedule).sort();
  const dayLabel = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const add = () => {
    if (!date || !time || isExtra(formatId, date, time)) return;
    save({ extraShowtimes: [...extras, { formatId, date, time }] }, `Added ${niceTime(time)} on ${dayLabel(date)}.`);
  };
  const remove = (entry: ExtraShowtime) =>
    save({ extraShowtimes: extras.filter((e) => e !== entry) }, 'Showtime removed.');

  return (
    <div className="space-y-8">
      <div className={card}>
        <div>
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-amber-400" />
            Add a Showtime
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Pick the theater type, the date and the time. Guests see it as an extra option next to the regular schedule, for every movie.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className={label}>Theater type</label>
            <select value={formatId} onChange={(e) => setFormatId(e.target.value)} className={input}>
              {catalog.formats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Date</label>
            <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={input + ' [color-scheme:dark]'} />
          </div>
          <div>
            <label className={label}>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input + ' [color-scheme:dark]'} />
          </div>
          <button onClick={add} disabled={saving || !date || !time || date < today} className={primaryButton + ' h-[38px]'}>
            <Plus className="w-3.5 h-3.5" />
            Add Showtime
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {message}
          {date > dates[dates.length - 1] && (
            <span className="text-xs text-neutral-500">Guests can book {dates.length} days ahead, so this one appears once its date is within that window.</span>
          )}
        </div>

        {extras.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-neutral-800">
            <div className={label}>Showtimes you added</div>
            <div className="flex flex-wrap gap-2">
              {extras.map((e) => (
                <div
                  key={`${e.formatId}|${e.date}|${e.time}`}
                  className="flex items-center gap-2 py-1.5 pl-3 pr-1.5 rounded-lg bg-neutral-950 border border-amber-400/40 text-xs text-neutral-200"
                >
                  <span className="font-bold text-amber-400 tabular-nums">{niceTime(e.time)}</span>
                  <span>{dayLabel(e.date)}</span>
                  <span className="text-neutral-500">{formatName(e.formatId)}</span>
                  <button
                    onClick={() => remove(e)}
                    aria-label="Remove showtime"
                    className="w-5 h-5 rounded-md bg-neutral-800 hover:bg-red-500/80 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={card}>
        <div>
          <h3 className="font-bold text-base text-white">Schedule for the Next {dates.length} Days</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            What guests can book. The regular showtimes are generated automatically for each day; the ones you added are highlighted.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400 font-semibold uppercase text-[11px]">
                <th className="py-3 px-3">Day</th>
                {catalog.formats.map((f) => (
                  <th key={f.id} className="py-3 px-3">
                    {f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {dates.map((d) => (
                <tr key={d}>
                  <td className="py-3 px-3 font-semibold text-white whitespace-nowrap">{d === today ? 'Today' : dayLabel(d)}</td>
                  {catalog.formats.map((f) => (
                    <td key={f.id} className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(catalog.schedule[d][f.id] || []).map((t) => (
                          <span
                            key={t}
                            className={`px-2 py-0.5 rounded-md tabular-nums whitespace-nowrap ${
                              isExtra(f.id, d, t) ? 'bg-amber-400 text-neutral-950 font-bold' : 'bg-neutral-800 text-neutral-300'
                            }`}
                          >
                            {niceTime(t)}
                          </span>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ discounts and offers (tickets and meals) */

/** Which of the three numbers of a discount is worked out from the other two. */
type CalcMode = 'after' | 'percent' | 'before';
interface PriceDraft {
  before: string;
  percent: string;
  after: string;
}

const tidy = (n: number) => String(Math.round(n * 10) / 10);
const toPriceDraft = (price: number, was?: number): PriceDraft => {
  const before = was && was > price ? was : price;
  return { before: before.toFixed(2), percent: before > price ? tidy((1 - price / before) * 100) : '0', after: price.toFixed(2) };
};

/** Fills in the number being worked out: the price after, the % off, or the price before. */
const solve = (d: PriceDraft, mode: CalcMode): PriceDraft => {
  const before = Number(d.before);
  const percent = Number(d.percent);
  const after = Number(d.after);
  if (mode === 'after') return d.before !== '' && percent <= 100 ? { ...d, after: round2(before * (1 - percent / 100)).toFixed(2) } : d;
  if (mode === 'percent') return d.after !== '' && before > 0 ? { ...d, percent: tidy((1 - after / before) * 100) } : d;
  return d.after !== '' && percent < 100 ? { ...d, before: round2(after / (1 - percent / 100)).toFixed(2) } : d;
};

/** The price to charge and the price it was before, or null when the numbers make no sense. */
const readPrice = (d: PriceDraft): { price: number; was: number | null } | null => {
  const before = Number(d.before);
  const after = Number(d.after);
  if (d.before === '' || d.after === '' || !Number.isFinite(before) || !Number.isFinite(after) || after < 0 || before < after) return null;
  return { price: round2(after), was: before > after ? round2(before) : null };
};

const CalcModePicker: React.FC<{ mode: CalcMode; onChange: (mode: CalcMode) => void }> = ({ mode, onChange }) => (
  <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
      <span className="font-semibold text-white">Discount calculator - work out:</span>
      {(
        [
          ['after', 'the price after'],
          ['percent', 'the % off'],
          ['before', 'the price before'],
        ] as [CalcMode, string][]
      ).map(([id, text]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`px-2.5 py-1.5 rounded-lg font-medium cursor-pointer ${
            mode === id ? 'bg-amber-400 text-neutral-950 font-bold' : 'bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
    <p className="text-[11px] text-neutral-500">
      {mode === 'after'
        ? 'Type the price before and the % off; the price guests pay is worked out. Leave 0% for no discount.'
        : mode === 'percent'
        ? 'Type the price before and the price after; the % off is worked out.'
        : 'Type the price guests pay and the % off; the price before is worked out.'}{' '}
      Guests see the old price crossed out next to the new one.
    </p>
  </div>
);

const PriceFields: React.FC<{ name: string; value: PriceDraft; mode: CalcMode; onChange: (value: PriceDraft) => void }> = ({ name, value, mode, onChange }) => (
  <>
    {(
      [
        ['before', 'Before', '$'],
        ['percent', '% off', '%'],
        ['after', 'After', '$'],
      ] as [CalcMode, string, string][]
    ).map(([key, text, sign]) => {
      const solved = key === mode;
      return (
        <label key={key} className="block w-[5.75rem] shrink-0">
          <span className="text-[10px] font-medium text-neutral-500 uppercase">{text}</span>
          <span className="relative block">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">{sign}</span>
            <input
              type="number"
              min="0"
              step={key === 'percent' ? '5' : '0.25'}
              value={value[key]}
              readOnly={solved}
              tabIndex={solved ? -1 : undefined}
              onChange={(e) => onChange(solve({ ...value, [key]: e.target.value }, mode))}
              aria-label={`${name}: ${key === 'percent' ? '% off' : 'price ' + key}`}
              title={solved ? 'Worked out from the other two' : undefined}
              className={`${input} mt-0 pl-6 pr-1.5 tabular-nums ${solved ? 'border-dashed !border-amber-400/50 !text-amber-300 bg-neutral-900 cursor-default' : ''}`}
            />
          </span>
        </label>
      );
    })}
  </>
);

interface DealDraft {
  take: string;
  pay: string;
}
const toDealDraft = (deal?: Deal): DealDraft => ({ take: deal ? String(deal.take) : '', pay: deal ? String(deal.pay) : '' });
/** null = no offer, undefined = the numbers make no sense */
const readDeal = (d: DealDraft): Deal | null | undefined => {
  if (d.take === '' && d.pay === '') return null;
  const take = Number(d.take);
  const pay = Number(d.pay);
  return Number.isInteger(take) && Number.isInteger(pay) && pay >= 1 && pay < take && take <= 10 ? { take, pay } : undefined;
};
const DEAL_ERROR = 'An offer works like 2x1 or 3x2: guests take more than they pay for (10 at most).';

/** "Take N, pay for M" offer: quick buttons for the usual ones, or any two numbers. */
const DealFields: React.FC<{ name: string; value: DealDraft; onChange: (value: DealDraft) => void }> = ({ name, value, onChange }) => {
  const small = 'w-12 bg-neutral-950 border border-neutral-700 rounded-lg px-1.5 py-1.5 text-xs text-white text-center tabular-nums focus:outline-none focus:border-amber-400';
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-300">
      {[
        ['', '', 'None'],
        ['2', '1', '2x1'],
        ['3', '2', '3x2'],
        ['4', '3', '4x3'],
      ].map(([take, pay, text]) => (
        <button
          key={text}
          type="button"
          onClick={() => onChange({ take, pay })}
          className={`px-2.5 py-1.5 rounded-lg font-medium cursor-pointer ${
            value.take === take && value.pay === pay ? 'bg-amber-400 text-neutral-950 font-bold' : 'bg-neutral-900 border border-neutral-700 hover:text-white'
          }`}
        >
          {text}
        </button>
      ))}
      <span className="ml-1 text-neutral-500">or take</span>
      <input type="number" min="2" max="10" value={value.take} onChange={(e) => onChange({ ...value, take: e.target.value })} aria-label={`${name}: offer, take how many`} className={small} />
      <span className="text-neutral-500">pay for</span>
      <input type="number" min="1" max="9" value={value.pay} onChange={(e) => onChange({ ...value, pay: e.target.value })} aria-label={`${name}: offer, pay for how many`} className={small} />
    </div>
  );
};

/* ------------------------------------------------------------------ ticket prices + seats */

const SeatEditor: React.FC<{
  format: TheaterFormat;
  blocked: Set<string>;
  sold: Map<string, Order>;
  onToggle: (seat: string) => void;
}> = ({ format, blocked, sold, onToggle }) => {
  const rows = Array.from({ length: format.rows }, (_, i) => String.fromCharCode(65 + i));
  const cols = Array.from({ length: format.cols }, (_, i) => i + 1);
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="w-max mx-auto space-y-2 px-2">
        {rows.map((row) => (
          <div key={row} className="flex items-center justify-center gap-2">
            <span className="w-5 text-center text-xs font-bold text-neutral-500 select-none">{row}</span>
            <div className="flex items-center gap-1">
              {cols.map((col) => {
                const seat = `${row}${col}`;
                const off = blocked.has(seat);
                const order = sold.get(seat);
                return (
                  <React.Fragment key={seat}>
                    <button
                      type="button"
                      onClick={() => onToggle(seat)}
                      data-seat={seat}
                      data-state={order ? 'sold' : off ? 'blocked' : 'free'}
                      title={
                        order
                          ? `${seat} - bought by ${order.customer.name} (${order.id}) for ${order.movie.title}${off ? ' · also blocked' : ''}`
                          : `${seat} - ${off ? 'not available (click to make available)' : 'available (click to block)'}`
                      }
                      className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                        order
                          ? `bg-sky-500/25 border-sky-400/70 text-sky-300 ${off ? 'ring-2 ring-red-500/70' : ''}`
                          : off
                          ? 'bg-red-500/20 border-red-500/60 text-red-400'
                          : 'bg-neutral-900 border-neutral-700/80 text-neutral-300 hover:border-neutral-500'
                      }`}
                    >
                      {order ? <User className="w-3.5 h-3.5" /> : off ? <X className="w-3.5 h-3.5" /> : <Armchair className="w-3.5 h-3.5 stroke-[1.75]" />}
                      <span className="sr-only">{seat}</span>
                    </button>
                    {format.aisles.includes(col) && <div className="w-4" />}
                  </React.Fragment>
                );
              })}
            </div>
            <span className="w-5 text-center text-xs font-bold text-neutral-500 select-none">{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const TicketsSeatsPanel: React.FC<PanelProps> = ({ catalog, onCatalogChange }) => {
  const prices = useSave(onCatalogChange);
  const seats = useSave(onCatalogChange);
  const [mode, setMode] = useState<CalcMode>('after');
  const [formatPrices, setFormatPrices] = useState<Record<string, PriceDraft>>(
    Object.fromEntries(catalog.formats.map((f) => [f.id, toPriceDraft(f.price, f.was)]))
  );
  const [formatDeals, setFormatDeals] = useState<Record<string, DealDraft>>(Object.fromEntries(catalog.formats.map((f) => [f.id, toDealDraft(f.deal)])));
  // Child / senior prices are a percentage of the adult price
  const [percents, setPercents] = useState<Record<string, string>>(
    Object.fromEntries(catalog.ticketTypes.map((t) => [t.id, String(Math.round(t.multiplier * 100))]))
  );
  const [seatFormatId, setSeatFormatId] = useState(catalog.formats[0].id);
  const [blocked, setBlocked] = useState<Record<string, string[]>>(Object.fromEntries(catalog.formats.map((f) => [f.id, f.blocked || []])));

  // Seats already bought, per showing, so they show as occupied on the map
  const [orders, setOrders] = useState<Order[]>([]);
  const loadOrders = () =>
    api<{ orders: Order[] }>('/api/orders')
      .then((r) => setOrders(r.orders))
      .catch(() => {});
  useEffect(() => {
    loadOrders();
  }, []);
  const dates = Object.keys(catalog.schedule).sort();
  const [seatDate, setSeatDate] = useState(dates[0]);
  const [seatTime, setSeatTime] = useState('');

  const seatFormat = catalog.formats.find((f) => f.id === seatFormatId)!;
  const blockedHere = new Set(blocked[seatFormatId]);
  const times = catalog.schedule[seatDate]?.[seatFormatId] || [];
  const soldAt = (time: string) => orders.filter((o) => o.format.id === seatFormatId && o.date === seatDate && o.time === time);
  // Without a time picked, open the first showing that has bookings so bought seats are visible straight away
  const shownTime = times.includes(seatTime) ? seatTime : times.find((t) => soldAt(t).length) || times[0] || '';
  const sold = new Map<string, Order>(soldAt(shownTime).flatMap((o) => o.seats.map((seat) => [seat, o] as [string, Order])));
  const dayLabel = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const savePrices = () => {
    const formats = [];
    for (const f of catalog.formats) {
      const price = readPrice(formatPrices[f.id]);
      const deal = readDeal(formatDeals[f.id]);
      if (!price) return prices.setStatus({ ok: false, text: `${f.name}: check the prices (the price after cannot be higher than the price before).` });
      if (deal === undefined) return prices.setStatus({ ok: false, text: `${f.name}: ${DEAL_ERROR}` });
      formats.push({ id: f.id, ...price, deal });
    }
    const ticketTypes = catalog.ticketTypes.map((t) => ({ id: t.id, multiplier: Number(percents[t.id]) / 100 }));
    if (ticketTypes.some((t) => !Number.isFinite(t.multiplier) || t.multiplier < 0)) {
      return prices.setStatus({ ok: false, text: 'Every percentage must be a number.' });
    }
    prices.save({ formats, ticketTypes }, 'Ticket prices saved.');
  };

  const toggleSeat = (seat: string) =>
    setBlocked((prev) => {
      const list = prev[seatFormatId];
      return { ...prev, [seatFormatId]: list.includes(seat) ? list.filter((s) => s !== seat) : [...list, seat] };
    });

  return (
    <div className="space-y-8">
      <div className={card}>
        <div>
          <h3 className="font-bold text-base text-white">Ticket Prices, Discounts & Offers</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            The adult price of each theater type, an optional discount and an optional offer such as 2x1, and what other ages pay as a percentage of the adult price.
          </p>
        </div>

        <CalcModePicker mode={mode} onChange={setMode} />

        <div className="divide-y divide-neutral-800">
          {catalog.formats.map((f) => (
            <div key={f.id} className="py-3 flex flex-col lg:flex-row lg:items-end gap-x-5 gap-y-2">
              <div className="lg:w-44 shrink-0 text-sm font-semibold text-white lg:pb-2">{f.name}</div>
              <div className="flex items-end gap-2">
                <PriceFields name={f.name} mode={mode} value={formatPrices[f.id]} onChange={(v) => setFormatPrices({ ...formatPrices, [f.id]: v })} />
              </div>
              <div className="lg:pb-0.5">
                <span className="text-[10px] font-medium text-neutral-500 uppercase block mb-0.5">Offer</span>
                <DealFields name={f.name} value={formatDeals[f.id]} onChange={(v) => setFormatDeals({ ...formatDeals, [f.id]: v })} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-neutral-500">
          With an offer like 2x1, for every 2 tickets in an order the guest pays for 1; the cheapest tickets are the free ones. It adds up with a discount.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-neutral-800">
          {catalog.ticketTypes.map((t) => (
            <div key={t.id}>
              <label className={label}>
                {t.name} <span className="normal-case text-neutral-500">({t.note})</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="5"
                  value={percents[t.id]}
                  onChange={(e) => setPercents({ ...percents, [t.id]: e.target.value })}
                  className={input + ' pr-28 tabular-nums'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-xs text-neutral-500">% of adult price</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button onClick={savePrices} disabled={prices.saving} className={primaryButton}>
            <Save className="w-3.5 h-3.5" />
            Save Ticket Prices
          </button>
          {prices.message}
        </div>
      </div>

      <div className={card}>
        <div>
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Armchair className="w-4 h-4 text-amber-400" />
            Seat Availability
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Click a seat to take it out of service (broken, reserved for staff...) or put it back. Blocked seats show as occupied in every showing of that theater.
            Seats guests already bought for the showing picked below are marked in blue.
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {catalog.formats.map((f) => (
            <button
              key={f.id}
              onClick={() => setSeatFormatId(f.id)}
              className={`px-3.5 py-2 rounded-xl font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                seatFormatId === f.id
                  ? 'bg-amber-400 text-neutral-950 font-bold'
                  : 'bg-neutral-900/70 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
              }`}
            >
              {f.name}
              {blocked[f.id].length > 0 && <span className="ml-1.5 opacity-70">({blocked[f.id].length} blocked)</span>}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={label}>Bought seats on</label>
            <select value={seatDate} onChange={(e) => setSeatDate(e.target.value)} aria-label="Day of the showing" className={input}>
              {dates.map((d, i) => (
                <option key={d} value={d}>
                  {i === 0 ? 'Today' : dayLabel(d)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Showing</label>
            <select value={shownTime} onChange={(e) => setSeatTime(e.target.value)} aria-label="Time of the showing" className={input}>
              {times.map((t) => {
                const count = soldAt(t).reduce((a, o) => a + o.seats.length, 0);
                return (
                  <option key={t} value={t}>
                    {niceTime(t)}
                    {count ? ` - ${count} bought` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          <button onClick={loadOrders} className={plainButton + ' h-[38px]'}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <span className="text-xs text-sky-300 pb-2.5" data-testid="sold-count">
            {sold.size} seat{sold.size === 1 ? '' : 's'} bought for {shownTime ? niceTime(shownTime) : 'this day'}
          </span>
        </div>

        <div className="text-center text-[11px] font-bold tracking-widest text-neutral-500 uppercase border-t-4 border-amber-400/70 rounded-t-[50%] pt-2 max-w-xl mx-auto">
          Screen · {seatFormat.auditorium}
        </div>
        <SeatEditor format={seatFormat} blocked={blockedHere} sold={sold} onToggle={toggleSeat} />

        <div className="flex flex-wrap items-center justify-center gap-5 text-[11px] text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-neutral-900 border border-neutral-700" /> Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-sky-500/25 border border-sky-400/70" /> Bought by a guest (hover for who)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-red-500/20 border border-red-500/60" /> Blocked by you
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => seats.save({ formats: catalog.formats.map((f) => ({ id: f.id, blocked: blocked[f.id] })) }, 'Seat availability saved.')}
            disabled={seats.saving}
            className={primaryButton}
          >
            <Save className="w-3.5 h-3.5" />
            Save Seat Availability
          </button>
          {blockedHere.size > 0 && (
            <button onClick={() => setBlocked({ ...blocked, [seatFormatId]: [] })} className={plainButton}>
              Unblock all seats
            </button>
          )}
          <span className="text-xs text-neutral-500">
            {blockedHere.size} of {seatFormat.rows * seatFormat.cols} seats blocked in {seatFormat.name}
          </span>
          {seats.message}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ menu */

interface MealDraft {
  id: string;
  name: string;
  category: string;
  description: string;
  badge: string;
  image: string;
  /** stock: '' means unlimited */
  sizes: { id: string; name: string; price: PriceDraft; stock: string }[];
  hasFlavors: boolean;
  flavors: { name: string; stock: string }[];
  maxFlavors: string;
  isCombo: boolean;
  comboItems: string[];
  comboDiscount: string;
  deal: DealDraft;
  limited: boolean;
  stock: string;
  soldOut: boolean;
}

const toDraft = (snack: SnackItem | undefined, isCombo: boolean): MealDraft => ({
  id: snack?.id || '',
  name: snack?.name || '',
  category: snack?.category || (isCombo ? 'Combos' : CATEGORIES[0]),
  description: snack?.description || '',
  badge: snack?.badge || '',
  image: snack?.image || '',
  sizes: snack?.sizes.length
    ? snack.sizes.map((s) => ({ id: s.id, name: s.name, price: toPriceDraft(s.price, s.was), stock: s.stock != null ? String(s.stock) : '' }))
    : [{ id: '', name: 'Regular', price: toPriceDraft(5), stock: '' }],
  hasFlavors: Boolean(snack?.flavors),
  flavors: (snack?.flavors?.options || []).map((name) => ({ name, stock: snack?.flavors?.stock?.[name] != null ? String(snack.flavors.stock[name]) : '' })),
  maxFlavors: String(snack?.flavors?.max || 1),
  isCombo: snack ? Boolean(snack.combo) : isCombo,
  comboItems: snack?.combo?.items || ['', ''],
  comboDiscount: String(snack?.combo?.discount ?? 15),
  deal: toDealDraft(snack?.deal),
  limited: snack?.stock != null,
  stock: snack?.stock != null ? String(snack.stock) : '20',
  soldOut: Boolean(snack?.soldOut),
});

/** Shrinks a chosen photo in the browser so uploads stay small, and returns it as a JPEG data URL. */
const shrinkImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('That file is not an image the browser can read.'));
    img.src = URL.createObjectURL(file);
  });

const stockInput =
  'w-full bg-neutral-950 border border-neutral-700 rounded-xl px-2 py-2 text-sm text-white tabular-nums placeholder-neutral-600 focus:outline-none focus:border-amber-400';
const binButton =
  'w-9 h-9 shrink-0 rounded-lg bg-neutral-800 hover:bg-red-500/80 disabled:opacity-30 disabled:hover:bg-neutral-800 disabled:cursor-not-allowed text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer';
const wholeOrEmpty = (text: string) => text === '' || /^\d+$/.test(text);

const MealEditor: React.FC<{
  initial: MealDraft;
  isNew: boolean;
  saving: boolean;
  /** The single items a combo can be made of */
  singles: SnackItem[];
  onSave: (draft: MealDraft) => void;
  onClose: () => void;
}> = ({ initial, isNew, saving, singles, onSave, onClose }) => {
  const [draft, setDraft] = useState(initial);
  const [mode, setMode] = useState<CalcMode>('after');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<MealDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const flavorCount = draft.flavors.filter((f) => f.name.trim()).length;
  const kind = draft.isCombo ? 'combo' : 'meal';

  // What the cheapest version of the combo costs apart and together
  const comboParts = draft.comboItems.map((id) => singles.find((s) => s.id === id)).filter(Boolean) as SnackItem[];
  const comboFull = round2(comboParts.reduce((a, p) => a + Math.min(...p.sizes.map((s) => s.price)), 0));
  const comboOff = Number(draft.comboDiscount) || 0;
  const comboCost = round2(comboFull * (1 - comboOff / 100));

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { image } = await post('/api/admin/upload', { dataUrl: await shrinkImage(file) });
      set({ image });
    } catch (err: any) {
      setError(err.message || 'The image could not be uploaded.');
    }
    setUploading(false);
  };

  const submit = () => {
    if (!draft.name.trim()) return setError(`Give the ${kind} a name.`);
    if (draft.isCombo) {
      if (draft.comboItems.length < 2 || draft.comboItems.some((id) => !id)) return setError('Pick what the combo contains: at least two things from the menu.');
      if (draft.comboDiscount === '' || !(comboOff >= 0 && comboOff <= 90)) return setError('The combo discount must be between 0 and 90 percent.');
    } else {
      if (!draft.sizes.length || draft.sizes.some((s) => !s.name.trim())) return setError('Every size needs a name.');
      const bad = draft.sizes.find((s) => !readPrice(s.price));
      if (bad) return setError(`${bad.name}: check the prices (the price after cannot be higher than the price before).`);
      if (draft.sizes.some((s) => !wholeOrEmpty(s.stock)) || (draft.hasFlavors && draft.flavors.some((f) => !wholeOrEmpty(f.stock)))) {
        return setError('Stock must be a whole number, or empty for unlimited.');
      }
      if (draft.hasFlavors && flavorCount === 0) return setError('Add at least one flavor, or turn the flavor choice off.');
    }
    if (readDeal(draft.deal) === undefined) return setError(DEAL_ERROR);
    if (draft.limited && !/^\d+$/.test(draft.stock)) return setError('Stock must be a whole number.');
    setError('');
    onSave(draft);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={isNew ? `New ${kind}` : `Edit ${initial.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-6"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{isNew ? (draft.isCombo ? 'Add a Combo' : 'Add a Meal') : `Edit ${initial.name}`}</h3>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Single item or combo */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-400">This is</span>
          {(
            [
              [false, 'a single item'],
              [true, 'a combo of other items'],
            ] as [boolean, string][]
          ).map(([value, text]) => (
            <button
              key={text}
              type="button"
              onClick={() => set({ isCombo: value, category: value ? 'Combos' : draft.category === 'Combos' ? CATEGORIES[0] : draft.category })}
              className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer ${
                draft.isCombo === value ? 'bg-amber-400 text-neutral-950 font-bold' : 'bg-neutral-950 border border-neutral-700 text-neutral-300 hover:text-white'
              }`}
            >
              {text}
            </button>
          ))}
          {draft.isCombo && <span className="text-neutral-500">Combos get their own section at the top of the guest menu.</span>}
        </div>

        {/* Photo + basics */}
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-5">
          <div className="space-y-2">
            <div className="aspect-[4/3] rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950">
              <SnackPhoto snack={{ name: draft.name, image: draft.image }} />
            </div>
            <label className={plainButton + ' w-full'}>
              <ImagePlus className="w-3.5 h-3.5" />
              {uploading ? 'Uploading…' : draft.image ? 'Change Image' : 'Upload Image'}
              <input type="file" accept="image/*" onChange={handleImage} disabled={uploading} className="hidden" />
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <label className={label}>Name</label>
              <input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                maxLength={60}
                placeholder={draft.isCombo ? 'e.g. Movie Night Combo' : 'e.g. Hot Dog'}
                aria-label="Name"
                className={input}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {!draft.isCombo && (
                <div>
                  <label className={label}>Category</label>
                  <select value={draft.category} onChange={(e) => set({ category: e.target.value })} className={input}>
                    {[...new Set([...CATEGORIES, draft.category])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={draft.isCombo ? 'col-span-2' : ''}>
                <label className={label}>Corner label (optional)</label>
                <input value={draft.badge} onChange={(e) => set({ badge: e.target.value })} maxLength={24} placeholder="e.g. New" className={input} />
              </div>
            </div>
            <div>
              <label className={label}>Description</label>
              <textarea
                value={draft.description}
                onChange={(e) => set({ description: e.target.value })}
                maxLength={300}
                rows={2}
                className={input + ' resize-none'}
              />
            </div>
          </div>
        </div>

        {draft.isCombo ? (
          /* What the combo contains */
          <div className="space-y-3 pt-4 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <div className={label}>What the combo contains</div>
              <span className="text-[11px] text-neutral-500">Guests still pick the size and flavor of each</span>
            </div>
            {draft.comboItems.map((id, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={id}
                  onChange={(e) => set({ comboItems: draft.comboItems.map((old, j) => (j === i ? e.target.value : old)) })}
                  aria-label={`Combo item ${i + 1}`}
                  className={input + ' mt-0 flex-1'}
                >
                  <option value="">Choose from the menu…</option>
                  {singles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => set({ comboItems: draft.comboItems.filter((_, j) => j !== i) })}
                  disabled={draft.comboItems.length <= 2}
                  aria-label={`Remove combo item ${i + 1}`}
                  className={binButton}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {draft.comboItems.length < 6 && (
              <button onClick={() => set({ comboItems: [...draft.comboItems, ''] })} className={plainButton}>
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-white">
              <span>The combo costs</span>
              <span className="relative w-20">
                <input
                  type="number"
                  min="0"
                  max="90"
                  step="5"
                  value={draft.comboDiscount}
                  onChange={(e) => set({ comboDiscount: e.target.value })}
                  aria-label="Combo discount percent"
                  className={stockInput + ' pr-6'}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">%</span>
              </span>
              <span>less than buying each thing apart.</span>
            </div>
            {comboParts.length === draft.comboItems.length && comboFull > 0 && (
              <p className="text-[11px] text-neutral-400 tabular-nums">
                With the cheapest sizes: {money(comboFull)} apart → <span className="font-bold text-amber-300">{money(comboCost)}</span> as a combo (saves{' '}
                {money(round2(comboFull - comboCost))}). Bigger sizes cost more, with the same {comboOff}% off.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Sizes */}
            <div className="space-y-3 pt-4 border-t border-neutral-800">
              <div className="flex items-center justify-between">
                <div className={label}>Sizes, prices, discounts & stock</div>
                <span className="text-[11px] text-neutral-500">Guests pick one size</span>
              </div>
              <CalcModePicker mode={mode} onChange={setMode} />
              {draft.sizes.map((size, i) => {
                const setSize = (patch: Partial<MealDraft['sizes'][number]>) => set({ sizes: draft.sizes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
                return (
                  <div key={i} className="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-neutral-950/40 border border-neutral-800">
                    <label className="block flex-1 min-w-[9rem]">
                      <span className="text-[10px] font-medium text-neutral-500 uppercase">Size name</span>
                      <input
                        value={size.name}
                        onChange={(e) => setSize({ name: e.target.value })}
                        maxLength={30}
                        placeholder="e.g. Large"
                        aria-label={`Size ${i + 1} name`}
                        className={input + ' mt-0'}
                      />
                    </label>
                    <PriceFields name={`Size ${i + 1}`} mode={mode} value={size.price} onChange={(price) => setSize({ price })} />
                    <label className="block w-[5.25rem] shrink-0">
                      <span className="text-[10px] font-medium text-neutral-500 uppercase">Stock</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={size.stock}
                        onChange={(e) => setSize({ stock: e.target.value })}
                        placeholder="no limit"
                        aria-label={`Size ${i + 1} stock`}
                        className={stockInput}
                      />
                    </label>
                    <button
                      onClick={() => set({ sizes: draft.sizes.filter((_, j) => j !== i) })}
                      disabled={draft.sizes.length === 1}
                      aria-label={`Remove size ${i + 1}`}
                      className={binButton}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {draft.sizes.length < 8 && (
                <button onClick={() => set({ sizes: [...draft.sizes, { id: '', name: '', price: toPriceDraft(0), stock: '' }] })} className={plainButton}>
                  <Plus className="w-3.5 h-3.5" />
                  Add Size
                </button>
              )}
              <p className="text-[11px] text-neutral-500">Stock: leave empty for no limit, or type how many of that size are left (0 = that size is out of stock).</p>
            </div>

            {/* Flavors */}
            <div className="space-y-3 pt-4 border-t border-neutral-800">
              <label className="flex items-center gap-2.5 text-sm text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.hasFlavors}
                  onChange={(e) => set({ hasFlavors: e.target.checked, flavors: e.target.checked && !draft.flavors.length ? [{ name: '', stock: '' }] : draft.flavors })}
                  className="w-4 h-4 accent-amber-400"
                />
                Guests choose a flavor
              </label>

              {draft.hasFlavors && (
                <div className="space-y-2 pl-6">
                  {draft.flavors.map((flavor, i) => {
                    const setFlavor = (patch: Partial<{ name: string; stock: string }>) => set({ flavors: draft.flavors.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={flavor.name}
                          onChange={(e) => setFlavor({ name: e.target.value })}
                          maxLength={30}
                          placeholder="Flavor name, e.g. Cherry"
                          aria-label={`Flavor ${i + 1}`}
                          className={input + ' mt-0 flex-1'}
                        />
                        <div className="w-[5.25rem] shrink-0">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={flavor.stock}
                            onChange={(e) => setFlavor({ stock: e.target.value })}
                            placeholder="no limit"
                            aria-label={`Flavor ${i + 1} stock`}
                            title="How many of this flavor are left (empty = no limit, 0 = out of stock)"
                            className={stockInput}
                          />
                        </div>
                        <button onClick={() => set({ flavors: draft.flavors.filter((_, j) => j !== i) })} aria-label={`Remove flavor ${i + 1}`} className={binButton}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {draft.flavors.length < 12 && (
                    <button onClick={() => set({ flavors: [...draft.flavors, { name: '', stock: '' }] })} className={plainButton}>
                      <Plus className="w-3.5 h-3.5" />
                      Add Flavor
                    </button>
                  )}
                  <p className="text-[11px] text-neutral-500">The number next to a flavor is how many of it are left: empty for no limit, 0 for out of stock.</p>

                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-neutral-300">
                    <span>Guests can pick</span>
                    <select
                      value={Math.min(Number(draft.maxFlavors) || 1, Math.max(1, flavorCount))}
                      onChange={(e) => set({ maxFlavors: e.target.value })}
                      aria-label="How many flavors can be picked"
                      className="bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      {Array.from({ length: Math.max(1, flavorCount) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? 'only one flavor' : `up to ${n} flavors`}
                        </option>
                      ))}
                    </select>
                    <span className="text-neutral-500">per item</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Offer */}
        <div className="space-y-2 pt-4 border-t border-neutral-800">
          <div className={label}>Offer (2x1, 3x2…)</div>
          <DealFields name={draft.name || kind} value={draft.deal} onChange={(deal) => set({ deal })} />
          <p className="text-[11px] text-neutral-500">With 2x1, for every 2 of this {kind} in an order the guest pays for 1 (the cheapest ones are free).</p>
        </div>

        {/* Stock */}
        <div className="space-y-3 pt-4 border-t border-neutral-800">
          <div className={label}>{draft.isCombo ? 'Stock of the combo' : 'Stock of the whole meal (all sizes together)'}</div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!draft.limited} onChange={() => set({ limited: false })} className="accent-amber-400" />
              Unlimited
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={draft.limited} onChange={() => set({ limited: true })} className="accent-amber-400" />
              Only
              <input
                type="number"
                min="0"
                step="1"
                value={draft.stock}
                onFocus={() => set({ limited: true })}
                onChange={(e) => set({ stock: e.target.value, limited: true })}
                aria-label="Number in stock"
                className="w-20 bg-neutral-950 border border-neutral-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums focus:outline-none focus:border-amber-400"
              />
              left
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-red-300">
              <input type="checkbox" checked={draft.soldOut} onChange={(e) => set({ soldOut: e.target.checked })} className="w-4 h-4 accent-red-500" />
              Mark as out of stock
            </label>
          </div>
          <p className="text-[11px] text-neutral-500">
            {draft.isCombo
              ? 'A combo also runs out by itself when something inside it is out of stock, and every combo sold lowers the stock of what it contains.'
              : 'With a number, each order lowers it and the meal shows "Out of Stock" at 0.'}
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className={plainButton}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving || uploading} className={primaryButton}>
            <Check className="w-3.5 h-3.5" />
            {isNew ? (draft.isCombo ? 'Add Combo' : 'Add Meal') : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** A meal from the editor in the form the server stores. */
const fromDraft = (draft: MealDraft, original?: SnackItem) => {
  const flavors = draft.flavors.map((f) => ({ name: f.name.trim(), stock: f.stock })).filter((f) => f.name);
  return {
    ...original,
    id: draft.id,
    name: draft.name.trim(),
    category: draft.category,
    description: draft.description.trim(),
    badge: draft.badge.trim(),
    image: draft.image,
    sizes: draft.isCombo
      ? []
      : draft.sizes.map((s) => ({ id: s.id, name: s.name.trim(), ...readPrice(s.price)!, stock: s.stock === '' ? null : Number(s.stock) })),
    flavors:
      !draft.isCombo && draft.hasFlavors && flavors.length
        ? {
            options: flavors.map((f) => f.name),
            min: 1,
            max: Math.min(Number(draft.maxFlavors) || 1, flavors.length),
            stock: Object.fromEntries(flavors.filter((f) => f.stock !== '').map((f) => [f.name, Number(f.stock)])),
          }
        : null,
    combo: draft.isCombo ? { items: draft.comboItems, discount: Number(draft.comboDiscount) } : null,
    deal: readDeal(draft.deal) || null,
    stock: draft.limited ? Number(draft.stock) : null,
    soldOut: draft.soldOut,
  };
};

export const MenuPanel: React.FC<PanelProps> = ({ catalog, onCatalogChange }) => {
  const { save, saving, message } = useSave(onCatalogChange);
  // undefined = closed, 'new' / 'new-combo' = adding, otherwise the id being edited
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const editingSnack = catalog.snacks.find((s) => s.id === editing);
  const singles = catalog.snacks.filter((s) => !s.combo);
  const nameOf = (id: string) => catalog.snacks.find((s) => s.id === id)?.name || id;

  const saveMeal = async (draft: MealDraft) => {
    const meal = fromDraft(draft, editingSnack);
    const snacks = editingSnack ? catalog.snacks.map((s) => (s.id === editingSnack.id ? meal : s)) : [...catalog.snacks, meal];
    if (await save({ snacks }, `${meal.name} saved.`)) setEditing(undefined);
  };

  const remove = (snack: SnackItem) => {
    if (!confirm(`Remove ${snack.name} from the menu?`)) return;
    save({ snacks: catalog.snacks.filter((s) => s.id !== snack.id) }, `${snack.name} removed.`);
  };

  const toggleSoldOut = (snack: SnackItem) =>
    save(
      { snacks: catalog.snacks.map((s) => (s.id === snack.id ? { ...s, soldOut: !s.soldOut } : s)) },
      snack.soldOut ? `${snack.name} is available again.` : `${snack.name} marked out of stock.`
    );

  return (
    <div className={card}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-base text-white">Menu: Meals, Combos, Prices & Stock</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Edit a meal to change its photo, sizes, prices, discounts, offers, flavors and stock. Changes show on the guest site right away.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {message}
          <button onClick={() => setEditing('new-combo')} className={plainButton + ' shrink-0 py-2.5'}>
            <Package className="w-3.5 h-3.5" />
            Add Combo
          </button>
          <button onClick={() => setEditing('new')} className={primaryButton + ' shrink-0'}>
            <Plus className="w-3.5 h-3.5" />
            Add Meal
          </button>
        </div>
      </div>

      <div className="divide-y divide-neutral-800">
        {catalog.snacks.map((snack) => {
          const out = snackLeft(snack, catalog) === 0;
          const cost = fromPrice(snack, catalog);
          return (
            <div key={snack.id} className="py-4 flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-20 h-16 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950 shrink-0">
                  <SnackPhoto snack={snack} className={out ? 'grayscale opacity-50' : ''} />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-white">{snack.name}</span>
                    <span className="text-[11px] text-neutral-500">{snack.combo ? 'Combo' : snack.category}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        out
                          ? 'bg-red-950 text-red-400 border-red-500/30'
                          : snack.stock != null
                          ? 'bg-amber-950 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-950 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {out ? 'Out of stock' : snack.stock != null ? `${snack.stock} left` : 'In stock'}
                    </span>
                    {snack.deal && <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black">{dealName(snack.deal)}</span>}
                  </div>
                  {snack.combo ? (
                    <div className="text-xs text-neutral-400">
                      {snack.combo.items.map(nameOf).join(' + ')} · {snack.combo.discount}% off · from {money(cost.price)}{' '}
                      <span className="line-through text-neutral-600">{money(cost.was)}</span>
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-400 flex flex-wrap gap-x-2 gap-y-0.5">
                      {snack.sizes.map((s) => (
                        <span key={s.id} className="whitespace-nowrap">
                          {s.name} {money(s.price)}
                          {percentOff(s.price, s.was) > 0 && (
                            <>
                              {' '}
                              <span className="line-through text-neutral-600">{money(s.was!)}</span> <span className="text-emerald-400">-{percentOff(s.price, s.was)}%</span>
                            </>
                          )}
                          {s.stock != null && <span className={s.stock === 0 ? 'text-red-400' : 'text-amber-400'}> ({s.stock === 0 ? 'out' : `${s.stock} left`})</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {snack.flavors && (
                    <div className="text-[11px] text-neutral-500">
                      Flavors ({snack.flavors.max === 1 ? 'pick one' : `pick up to ${snack.flavors.max}`}):{' '}
                      {snack.flavors.options.map((f, i) => {
                        const left = snack.flavors!.stock?.[f];
                        return (
                          <span key={f}>
                            {i > 0 && ', '}
                            {f}
                            {left != null && <span className={left === 0 ? 'text-red-400' : 'text-amber-400'}> ({left === 0 ? 'out' : `${left} left`})</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggleSoldOut(snack)} disabled={saving} className={plainButton}>
                  {snack.soldOut ? 'Mark Available' : 'Mark Out of Stock'}
                </button>
                <button onClick={() => setEditing(snack.id)} className={plainButton}>
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => remove(snack)}
                  disabled={saving}
                  aria-label={`Remove ${snack.name}`}
                  className="w-9 h-9 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {catalog.snacks.length === 0 && <div className="py-10 text-center text-xs text-neutral-500">The menu is empty. Add a meal to get started.</div>}
      </div>

      {editing !== undefined && (
        <MealEditor
          key={editing}
          initial={toDraft(editingSnack, editing === 'new-combo')}
          isNew={!editingSnack}
          saving={saving}
          singles={singles}
          onSave={saveMeal}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
};
