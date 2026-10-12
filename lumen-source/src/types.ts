export interface Movie {
  id: number;
  title: string;
  overview: string;
  posterPath: string;
  backdropPath: string;
  voteAverage: number;
  releaseDate: string;
  runtime: number;
  genres: string[];
  certification: string;
}

/** A "take N, pay for M" offer such as 2x1 or 3x2. */
export interface Deal {
  take: number;
  pay: number;
}

export interface TheaterFormat {
  id: string;
  name: string;
  tagline: string;
  price: number;
  /** The price before a discount; only set while it is higher than price. */
  was?: number;
  deal?: Deal;
  screenSpecs: string;
  audioSpecs: string;
  feature: string;
  auditorium: string;
  rows: number;
  cols: number;
  aisles: number[];
  /** Seats switched off in the admin page (shown as occupied in every showing). */
  blocked?: string[];
}

/** A showtime added by hand in the admin page, on top of the generated schedule. */
export interface ExtraShowtime {
  formatId: string;
  date: string;
  time: string;
}

export interface TicketType {
  id: string;
  name: string;
  note: string;
  multiplier: number;
}

export interface SnackSize {
  id: string;
  name: string;
  price: number;
  /** The price before a discount; only set while it is higher than price. */
  was?: number;
  /** How many of this size are left; missing means unlimited. */
  stock?: number | null;
}

export interface SnackItem {
  id: string;
  name: string;
  category: string;
  description: string;
  image: string;
  badge?: string;
  calories?: string;
  dietary?: string;
  special?: boolean;
  sizes: SnackSize[];
  /** stock lists how many are left of the flavors that have a limit. */
  flavors?: { options: string[]; min: number; max: number; stock?: Record<string, number> };
  deal?: Deal;
  /** A combo is made of other menu items (by id, repeats allowed) and costs discount % less than they do apart. */
  combo?: { items: string[]; discount: number };
  /** How many are left; null means unlimited. */
  stock?: number | null;
  soldOut?: boolean;
}

export interface Catalog {
  cinema: { name: string; bookingFeePerTicket: number; taxRate: number };
  formats: TheaterFormat[];
  ticketTypes: TicketType[];
  maxTickets: number;
  snacks: SnackItem[];
  extraShowtimes?: ExtraShowtime[];
  /** Showtimes per bookable day and theater type: schedule[date][formatId] = ["12:30", ...] */
  schedule: Record<string, Record<string, string[]>>;
}

/** The size and flavors picked for one thing inside a combo. */
export interface CartPart {
  id: string;
  size: string;
  flavors: string[];
}

/** One snack choice in the cart: an item in a given size (and flavors, where the item has them), or a combo with its parts. */
export interface CartSnack {
  id: string;
  size: string;
  flavors: string[];
  qty: number;
  parts?: CartPart[];
}

export type PaymentMethod = 'card' | 'paypal' | 'applepay' | 'googlepay';

export interface OrderLine {
  id: string;
  name: string;
  qty: number;
  unit: number;
  total: number;
}

export interface Order {
  id: string;
  createdAt: string;
  status: 'valid' | 'used';
  checkedInAt: string | null;
  snacksDispensed?: boolean;
  movie: { id: number; title: string; posterPath: string; backdropPath?: string; year: string; runtime: number; certification: string; genres?: string[] };
  format: { id: string; name: string; auditorium: string };
  date: string;
  time: string;
  seats: string[];
  tickets: OrderLine[];
  snacks: OrderLine[];
  deals?: { name: string; amount: number }[];
  customer: { name: string };
  payment: { method: PaymentMethod; brand: string; last4: string; reference: string };
  totals: { tickets: number; snacks: number; discount?: number; fees: number; tax: number; total: number };
}

export interface Totals {
  ticketLines: { name: string; qty: number; unit: number; total: number }[];
  snackLines: { key: string; name: string; qty: number; total: number }[];
  /** Money taken off by offers such as 2x1. */
  deals: { name: string; amount: number }[];
  tickets: number;
  snacks: number;
  discount: number;
  fees: number;
  tax: number;
  total: number;
}
