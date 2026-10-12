import { CartPart, CartSnack, Catalog, Deal, Order, PaymentMethod, SnackItem, SnackSize, TheaterFormat, Totals } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status);
  return data;
}

export const post = <T = any>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const TMDB_IMG = 'https://image.tmdb.org/t/p/';
const NO_POSTER = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80';
export const posterUrl = (path?: string, size = 'w500') => (path ? `${TMDB_IMG}${size}${path}` : NO_POSTER);
export const backdropUrl = (path?: string) => (path ? `${TMDB_IMG}w1280${path}` : '');

export const money = (n: number) => '$' + n.toFixed(2);
export const round2 = (n: number) => Math.round((n + 1e-9) * 100) / 100;

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const niceTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
/** "Today", "Tomorrow" or "Sat, Oct 12" for an ISO date. */
export const niceDate = (iso: string) => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (iso === isoDate(today)) return 'Today';
  if (iso === isoDate(tomorrow)) return 'Tomorrow';
  return new Date(iso + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
export const stamp = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export const PAY_NAMES: Record<PaymentMethod, string> = { card: 'Card', paypal: 'PayPal', applepay: 'Apple Pay', googlepay: 'Google Pay' };
export const BRAND_NAMES: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express' };
export const paidWith = (o: Order) =>
  o.payment.method === 'card' ? `${BRAND_NAMES[o.payment.brand] || 'Card'} •••• ${o.payment.last4}` : PAY_NAMES[o.payment.method];

/** Meal photos are either shipped with the site (a file name) or uploaded from the admin page (/uploads/...). */
export const snackImage = (image?: string) => (!image ? '' : image.startsWith('/') ? image : `/img/snacks/${image}`);

/** "30" for a price cut from 10 to 7; 0 when there is no discount. */
export const percentOff = (price: number, was?: number) => (was && was > price ? Math.round((1 - price / was) * 100) : 0);
export const dealName = (deal: Deal) => `${deal.take}x${deal.pay}`;

/* ---- stock: a meal, each of its sizes and each of its flavors can have its own number left ---- */

const partsOf = (c: CartSnack): CartPart[] => [c, ...(c.parts || [])];
/** How many of each meal, size and flavor the cart already holds (a combo counts as itself plus what is inside it). */
export function cartUse(cart: CartSnack[]) {
  const use: Record<string, number> = {};
  const add = (key: string, qty: number) => (use[key] = (use[key] || 0) + qty);
  for (const c of cart)
    for (const p of partsOf(c)) {
      add(p.id, c.qty);
      if (p.size) add(`${p.id}|size|${p.size}`, c.qty);
      p.flavors.forEach((f) => add(`${p.id}|flavor|${f}`, c.qty));
    }
  return use;
}
export type CartUse = ReturnType<typeof cartUse>;

const minus = (stock: number | null | undefined, used = 0) => (stock == null ? Infinity : Math.max(0, stock - used));
export const sizeLeft = (snack: SnackItem, size: SnackSize, use: CartUse = {}) => minus(size.stock, use[`${snack.id}|size|${size.id}`]);
export const flavorLeft = (snack: SnackItem, flavor: string, use: CartUse = {}) =>
  minus(snack.flavors?.stock?.[flavor], use[`${snack.id}|flavor|${flavor}`]);

/** How many more of a meal can be ordered (Infinity when nothing limits it), given what the cart holds. */
export function snackLeft(snack: SnackItem, catalog?: Catalog, use: CartUse = {}): number {
  if (snack.soldOut) return 0;
  let left = minus(snack.stock, use[snack.id]);
  if (snack.combo) {
    // a combo runs out when anything inside it does (the same thing twice needs two of it)
    for (const id of new Set(snack.combo.items)) {
      const part = catalog?.snacks.find((s) => s.id === id);
      const times = snack.combo.items.filter((i) => i === id).length;
      left = Math.min(left, part ? Math.floor(snackLeft(part, catalog, use) / times) : 0);
    }
    return left;
  }
  left = Math.min(left, snack.sizes.reduce((a, s) => a + sizeLeft(snack, s, use), 0));
  if (snack.flavors) left = Math.min(left, snack.flavors.options.reduce((a, f) => a + flavorLeft(snack, f, use), 0));
  return left;
}

/** How many times one more of this choice (a meal in a size and flavors, or a combo with its parts) still fits, 20 at most. */
export function maxUnits(pick: Omit<CartSnack, 'qty'>, catalog: Catalog, use: CartUse): number {
  let most = 20;
  for (const [key, perUnit] of Object.entries(cartUse([{ ...pick, qty: 1 }]))) {
    const [id, kind, ...rest] = key.split('|');
    const snack = catalog.snacks.find((s) => s.id === id);
    const size = snack?.sizes.find((s) => s.id === rest.join('|'));
    const left = !snack
      ? 0
      : !kind
      ? snack.soldOut ? 0 : minus(snack.stock, use[key])
      : kind === 'size'
      ? size ? sizeLeft(snack, size, use) : 0
      : flavorLeft(snack, rest.join('|'), use);
    most = Math.min(most, Math.floor(left / perUnit));
  }
  return most;
}

/* ---- prices ---- */

/** The lowest price a meal can cost, and what that was before discounts (equal when nothing is discounted). */
export function fromPrice(snack: SnackItem, catalog: Catalog): { price: number; was: number } {
  if (snack.combo) {
    const parts = snack.combo.items.map((id) => catalog.snacks.find((s) => s.id === id)).filter(Boolean) as SnackItem[];
    const full = parts.reduce((a, p) => a + Math.min(...p.sizes.map((s) => s.price)), 0);
    return { price: round2(full * (1 - snack.combo.discount / 100)), was: round2(full) };
  }
  const cheapest = snack.sizes.reduce((a, s) => (s.price < a.price ? s : a));
  return { price: cheapest.price, was: cheapest.was || cheapest.price };
}

/** Price of one combo with the chosen sizes, and what those things cost apart. */
export function comboPrice(combo: SnackItem, parts: CartPart[], catalog: Catalog) {
  const full = parts.reduce((a, p) => a + (catalog.snacks.find((s) => s.id === p.id)?.sizes.find((s) => s.id === p.size)?.price || 0), 0);
  return { price: round2(full * (1 - (combo.combo?.discount || 0) / 100)), was: round2(full) };
}

const pickKey = (p: CartPart) => `${p.id}|${p.size}|${p.flavors.join('+')}`;
export const cartKey = (c: CartSnack) => partsOf(c).map(pickKey).join('/');
const pickLabel = (snack: SnackItem | undefined, p: CartPart) =>
  `${snack?.sizes.find((s) => s.id === p.size)?.name}${p.flavors.length ? ' · ' + p.flavors.join(' + ') : ''}`;
export const snackLabel = (snack: SnackItem, c: CartSnack, catalog: Catalog) => {
  if (!c.parts) return `${snack.name} (${pickLabel(snack, c)})`;
  const inside = c.parts.map((p) => {
    const part = catalog.snacks.find((s) => s.id === p.id);
    return `${part?.name} ${pickLabel(part, p)}`;
  });
  return `${snack.name} (${inside.join(', ')})`;
};

/** What a "take N, pay for M" offer takes off: units holds the price of every single item, the cheapest go free. */
function dealSaving(deal: Deal | undefined, units: number[]) {
  if (!deal) return 0;
  const free = Math.floor(units.length / deal.take) * (deal.take - deal.pay);
  return round2([...units].sort((a, b) => a - b).slice(0, free).reduce((a, b) => a + b, 0));
}
const repeat = (unit: number, qty: number) => Array<number>(qty).fill(unit);

/** Same sums the server does when it prices the order, so the customer sees the final total before paying. */
export function computeTotals(catalog: Catalog, format: TheaterFormat, tickets: Record<string, number>, cart: CartSnack[]): Totals {
  const ticketLines = catalog.ticketTypes
    .filter((t) => tickets[t.id])
    .map((t) => {
      const unit = round2(format.price * t.multiplier);
      return { name: t.name, qty: tickets[t.id], unit, total: round2(unit * tickets[t.id]) };
    });
  const snackLines = cart.flatMap((c) => {
    const snack = catalog.snacks.find((s) => s.id === c.id);
    const unit = !snack ? undefined : c.parts ? comboPrice(snack, c.parts, catalog).price : snack.sizes.find((s) => s.id === c.size)?.price;
    return snack && unit !== undefined
      ? [{ id: c.id, key: cartKey(c), name: snackLabel(snack, c, catalog), qty: c.qty, unit, total: round2(unit * c.qty) }]
      : [];
  });

  const deals: Totals['deals'] = [];
  if (format.deal) {
    deals.push({ name: `${dealName(format.deal)} on ${format.name} tickets`, amount: dealSaving(format.deal, ticketLines.flatMap((l) => repeat(l.unit, l.qty))) });
  }
  for (const id of new Set(snackLines.map((l) => l.id))) {
    const snack = catalog.snacks.find((s) => s.id === id)!;
    if (snack.deal) {
      const units = snackLines.filter((l) => l.id === id).flatMap((l) => repeat(l.unit, l.qty));
      deals.push({ name: `${dealName(snack.deal)} on ${snack.name}`, amount: dealSaving(snack.deal, units) });
    }
  }
  const applied = deals.filter((d) => d.amount > 0);

  const count = ticketLines.reduce((a, l) => a + l.qty, 0);
  const ticketsTotal = round2(ticketLines.reduce((a, l) => a + l.total, 0));
  const snacksTotal = round2(snackLines.reduce((a, l) => a + l.total, 0));
  const discount = round2(applied.reduce((a, d) => a + d.amount, 0));
  const fees = round2(catalog.cinema.bookingFeePerTicket * count);
  const tax = round2((ticketsTotal + snacksTotal - discount) * catalog.cinema.taxRate);
  return {
    ticketLines, snackLines, deals: applied, tickets: ticketsTotal, snacks: snacksTotal, discount, fees, tax,
    total: round2(ticketsTotal + snacksTotal - discount + fees + tax),
  };
}

/** Deterministic "already sold" seats per showing so the room looks lived-in. */
export function seededTaken(key: string, fmt: TheaterFormat): string[] {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: string[] = [];
  for (let r = 0; r < fmt.rows; r++) for (let c = 1; c <= fmt.cols; c++) if (rand() < 0.22) out.push(String.fromCharCode(65 + r) + c);
  return out;
}

export const sortSeats = (seats: string[]) =>
  [...seats].sort((a, b) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1)));
