import React, { useState } from 'react';
import { CartSnack, Catalog, SnackItem, Movie, TheaterFormat } from '../types';
import { CartUse, cartUse, comboPrice, computeTotals, dealName, flavorLeft, fromPrice, maxUnits, money, percentOff, round2, sizeLeft, snackImage, snackLeft, sortSeats } from '../api';
import { Plus, Minus, ArrowLeft, ArrowRight, UtensilsCrossed, Sparkles, X, Check } from 'lucide-react';

interface SnacksSelectionProps {
  catalog: Catalog;
  movie: Movie;
  format: TheaterFormat;
  tickets: Record<string, number>;
  selectedSeats: string[];
  cartSnacks: CartSnack[];
  onAddSnack: (item: CartSnack) => void;
  onRemoveSnack: (key: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

/** A meal's photo, or a neutral placeholder when it has none yet. */
export const SnackPhoto: React.FC<{ snack: { name: string; image?: string }; className?: string }> = ({ snack, className = '' }) =>
  snack.image ? (
    <img src={snackImage(snack.image)} alt={snack.name} loading="lazy" className={`w-full h-full object-cover ${className}`} />
  ) : (
    <div className={`w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-700 ${className}`}>
      <UtensilsCrossed className="w-1/4 h-1/4" />
    </div>
  );

/** A price, with the old one struck through and the percentage off when it is discounted. */
export const Price: React.FC<{ price: number; was?: number; className?: string }> = ({ price, was, className = 'text-amber-400' }) => {
  const off = percentOff(price, was);
  return (
    <span className="inline-flex items-baseline gap-1.5 tabular-nums">
      {off > 0 && <span className="text-[11px] font-medium text-neutral-500 line-through">{money(was!)}</span>}
      <span className={`font-bold ${className}`}>{money(price)}</span>
      {off > 0 && <span className="px-1 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">-{off}%</span>}
    </span>
  );
};

interface Choice {
  size: string;
  flavors: string[];
}

/** The first choice that is still in stock: the second size when there is one (the usual pick) and the first flavor. */
const firstChoice = (snack: SnackItem, use: CartUse): Choice => {
  const sizes = snack.sizes.filter((s) => sizeLeft(snack, s, use) > 0);
  const size = sizes.find((s) => s === snack.sizes[1]) || sizes[0] || snack.sizes[0];
  const flavor = snack.flavors?.options.find((f) => flavorLeft(snack, f, use) > 0);
  return { size: size.id, flavors: snack.flavors && flavor ? [flavor] : [] };
};

const choiceOk = (snack: SnackItem, choice: Choice) =>
  !snack.flavors || (choice.flavors.length >= snack.flavors.min && choice.flavors.length <= snack.flavors.max);

/** Size and flavor pickers for one menu item (on its own, or as one of the things in a combo). */
const ChoicePicker: React.FC<{ snack: SnackItem; use: CartUse; value: Choice; onChange: (value: Choice) => void }> = ({ snack, use, value, onChange }) => {
  const rule = snack.flavors;
  const single = rule?.max === 1;
  const size = snack.sizes.find((s) => s.id === value.size);

  const toggleFlavor = (flavor: string) => {
    const has = value.flavors.includes(flavor);
    const next = single ? [flavor] : has ? value.flavors.filter((f) => f !== flavor) : value.flavors.length < rule!.max ? [...value.flavors, flavor] : value.flavors;
    onChange({ ...value, flavors: rule!.options.filter((f) => next.includes(f)) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Size</div>
        <div className="space-y-2">
          {snack.sizes.map((s) => {
            const isSelected = s.id === value.size;
            const left = sizeLeft(snack, s, use);
            return (
              <button
                key={s.id}
                disabled={left === 0}
                onClick={() => onChange({ ...value, size: s.id })}
                className={`w-full p-3 rounded-xl border flex items-center justify-between gap-3 text-sm transition-all ${
                  left === 0
                    ? 'bg-neutral-950/40 border-neutral-800 opacity-50 cursor-not-allowed'
                    : isSelected
                    ? 'bg-neutral-900 border-amber-400 ring-1 ring-amber-400/30 cursor-pointer'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700 cursor-pointer'
                }`}
              >
                <span className="flex items-center gap-3 text-left">
                  <span className={`w-4 h-4 shrink-0 rounded-full border flex items-center justify-center ${isSelected ? 'border-amber-400 bg-amber-400' : 'border-neutral-600'}`}>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />}
                  </span>
                  <span className="font-semibold text-white">{s.name}</span>
                  {left === 0 ? (
                    <span className="text-[11px] font-semibold text-red-400">Out of stock</span>
                  ) : (
                    left <= 10 && <span className="text-[11px] text-amber-300 tabular-nums">Only {left} left</span>
                  )}
                </span>
                <Price price={s.price} was={s.was} />
              </button>
            );
          })}
        </div>
      </div>

      {rule && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">{single ? 'Flavor' : 'Flavors'}</div>
            <div className="text-[11px] text-neutral-500">
              {single ? 'Choose one' : `Choose ${rule.min} to ${rule.max} · mixed in one ${(size?.name || 'serving').toLowerCase()}`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {rule.options.map((flavor) => {
              const isSelected = value.flavors.includes(flavor);
              const out = flavorLeft(snack, flavor, use) === 0;
              return (
                <button
                  key={flavor}
                  disabled={out}
                  onClick={() => toggleFlavor(flavor)}
                  title={out ? 'Out of stock' : undefined}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                    out
                      ? 'bg-neutral-950/40 border-neutral-800 text-neutral-600 line-through cursor-not-allowed'
                      : isSelected
                      ? 'bg-amber-400 border-amber-400 text-neutral-950 cursor-pointer'
                      : 'bg-neutral-950/60 border-neutral-800 text-neutral-300 hover:border-neutral-600 cursor-pointer'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  {flavor}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/** Popup for one snack or combo: size and flavor(s) of each thing in it, and how many. */
const SnackOptions: React.FC<{ snack: SnackItem; catalog: Catalog; use: CartUse; onAdd: (item: CartSnack) => void; onClose: () => void }> = ({
  snack,
  catalog,
  use,
  onAdd,
  onClose,
}) => {
  // What gets chosen: the snack itself, or each thing inside the combo
  const parts = (snack.combo ? snack.combo.items.map((id) => catalog.snacks.find((s) => s.id === id)) : [snack]).filter(Boolean) as SnackItem[];
  const [choices, setChoices] = useState<Choice[]>(() => parts.map((p) => firstChoice(p, use)));
  const [qty, setQty] = useState(1);

  const picked = parts.map((p, i) => ({ id: p.id, ...choices[i] }));
  const pick = snack.combo ? { id: snack.id, size: '', flavors: [], parts: picked } : picked[0];
  const flavorsOk = parts.every((p, i) => choiceOk(p, choices[i]));
  const maxQty = maxUnits(pick, catalog, use);
  const amount = Math.min(qty, Math.max(1, maxQty));
  const cost = snack.combo ? comboPrice(snack, picked, catalog) : { price: parts[0].sizes.find((s) => s.id === choices[0].size)!.price, was: 0 };
  const ready = flavorsOk && maxQty > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${snack.name} options`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-t-3xl sm:rounded-3xl shadow-2xl"
      >
        <div className="relative aspect-[16/9] bg-neutral-950">
          <SnackPhoto snack={snack} />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-neutral-950/80 border border-neutral-800 text-neutral-200 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-lg font-bold text-white">{snack.name}</h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{snack.description}</p>
            <div className="flex flex-wrap gap-2 mt-2 empty:hidden">
              {snack.combo && snack.combo.discount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-[11px] font-bold">
                  {snack.combo.discount}% less than buying each one apart
                </span>
              )}
              {snack.deal && (
                <span className="px-2 py-0.5 rounded-md bg-amber-400 text-neutral-950 text-[11px] font-bold">
                  {dealName(snack.deal)} · take {snack.deal.take}, pay for {snack.deal.pay}
                </span>
              )}
            </div>
          </div>

          {snack.combo ? (
            parts.map((part, i) => (
              <div key={i} className="p-4 rounded-2xl bg-neutral-950/50 border border-neutral-800 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg overflow-hidden border border-neutral-800 shrink-0">
                    <SnackPhoto snack={part} />
                  </div>
                  <div className="font-bold text-sm text-white">{part.name}</div>
                </div>
                <ChoicePicker snack={part} use={use} value={choices[i]} onChange={(c) => setChoices(choices.map((old, j) => (j === i ? c : old)))} />
              </div>
            ))
          ) : (
            <ChoicePicker snack={snack} use={use} value={choices[0]} onChange={(c) => setChoices([c])} />
          )}

          {/* Quantity + add */}
          <div className="pt-4 border-t border-neutral-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty(Math.max(1, amount - 1))}
                disabled={amount === 1}
                aria-label="One less"
                className="w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 flex items-center justify-center cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-7 text-center text-sm font-bold text-white tabular-nums">{amount}</span>
              <button
                onClick={() => setQty(amount + 1)}
                disabled={amount >= maxQty}
                aria-label="One more"
                title={amount >= maxQty && maxQty < 20 ? `Only ${maxQty} left` : undefined}
                className="w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              disabled={!ready}
              onClick={() => {
                onAdd({ ...pick, qty: amount });
                onClose();
              }}
              className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                ready
                  ? 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-lg shadow-amber-400/20 cursor-pointer'
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
              }`}
            >
              {!flavorsOk ? (
                'Pick a flavor'
              ) : maxQty === 0 ? (
                'Not enough left of this choice'
              ) : (
                <>
                  <span>Add to Order · {money(round2(cost.price * amount))}</span>
                  {cost.was > cost.price && <span className="text-xs font-medium line-through opacity-60">{money(round2(cost.was * amount))}</span>}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SnacksSelection: React.FC<SnacksSelectionProps> = ({
  catalog,
  movie,
  format,
  tickets,
  selectedSeats,
  cartSnacks,
  onAddSnack,
  onRemoveSnack,
  onContinue,
  onBack,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [openSnack, setOpenSnack] = useState<SnackItem | null>(null);

  const totals = computeTotals(catalog, format, tickets, cartSnacks);
  const use = cartUse(cartSnacks);
  const totalSnacksCount = cartSnacks.reduce((sum, item) => sum + item.qty, 0);
  const countFor = (snackId: string) => cartSnacks.filter((c) => c.id === snackId).reduce((sum, c) => sum + c.qty, 0);
  const nameOf = (id: string) => catalog.snacks.find((s) => s.id === id)?.name || id;

  const combos = catalog.snacks.filter((s) => s.combo);
  const categories = [
    { id: 'all', label: 'All Concessions' },
    ...(combos.length ? [{ id: 'combos', label: 'Combos' }] : []),
    { id: 'fresh', label: 'Fresh & Healthy (Pineapple, Cucumber, Water)' },
    { id: 'popcorn', label: 'Popcorn & Classics' },
    { id: 'beverages', label: 'Beverages' },
    { id: 'confections', label: 'Candies & Box Sweets' },
  ];

  const filteredSnacks = catalog.snacks.filter((snack) => {
    if (snack.combo || activeCategory === 'combos') return false; // combos have their own section
    if (activeCategory === 'fresh') return snack.category === 'Fresh & Healthy' || snack.id === 'water-bottle';
    if (activeCategory === 'popcorn') return snack.category === 'Popcorn & Classics';
    if (activeCategory === 'beverages') return snack.category === 'Beverages';
    if (activeCategory === 'confections') return snack.category === 'Confections';
    return true;
  });
  // Offers on meals (ticket offers are shown with the tickets)
  const snackDeals = totals.deals.filter((d) => !d.name.endsWith(' tickets'));
  const snackSaved = snackDeals.reduce((a, d) => a + d.amount, 0);
  const shownCombos = activeCategory === 'all' || activeCategory === 'combos' ? combos : [];

  const renderCard = (snack: SnackItem) => {
    const qty = countFor(snack.id);
    const isSelected = qty > 0;
    const cost = fromPrice(snack, catalog);
    const soldOut = snackLeft(snack, catalog) === 0;
    const left = snackLeft(snack, catalog, use);
    const canAdd = left > 0;

    return (
      <div
        key={snack.id}
        className={`group flex flex-col rounded-2xl overflow-hidden border transition-all duration-200 ${
          isSelected
            ? 'bg-neutral-900/90 border-amber-400 ring-1 ring-amber-400/30 shadow-lg shadow-amber-500/10'
            : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/80'
        }`}
      >
        {/* Product Image */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-950">
          <SnackPhoto snack={snack} className={`group-hover:scale-105 transition-transform duration-300 ${soldOut ? 'grayscale opacity-40' : ''}`} />

          {soldOut && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="px-3 py-1.5 rounded-lg bg-neutral-950/90 border border-red-500/50 text-red-400 text-xs font-bold uppercase tracking-wider">
                Out of Stock
              </span>
            </div>
          )}

          {snack.badge && (
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-neutral-950/85 backdrop-blur-md border border-neutral-800 text-[11px] font-semibold text-amber-400">
              {snack.badge}
            </div>
          )}

          <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
            {snack.deal && (
              <div className="px-2 py-0.5 rounded-md bg-red-500 text-white text-[11px] font-black shadow-sm">{dealName(snack.deal)}</div>
            )}
            {cost.was > cost.price && (
              <div className="px-2 py-0.5 rounded-md bg-emerald-500 text-neutral-950 text-[11px] font-black shadow-sm">-{percentOff(cost.price, cost.was)}%</div>
            )}
            {snack.special && (
              <div className="px-2 py-0.5 rounded-md bg-amber-400/90 text-neutral-950 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                <Sparkles className="w-2.5 h-2.5" />
                Specialty
              </div>
            )}
          </div>
        </div>

        {/* Snack Information */}
        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-sm text-white group-hover:text-amber-400 transition-colors">{snack.name}</h3>
              <span className="text-sm shrink-0 text-right">
                <span className="text-[10px] font-medium text-neutral-500">from </span>
                <span className="font-bold text-amber-400 tabular-nums">{money(cost.price)}</span>
                {cost.was > cost.price && <span className="block text-[11px] text-neutral-500 line-through tabular-nums">{money(cost.was)}</span>}
              </span>
            </div>

            {snack.combo ? (
              <div className="text-[11px] text-amber-300/90 mt-1">Includes: {snack.combo.items.map(nameOf).join(' + ')}</div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-1">
                {snack.dietary && <span>{snack.dietary}</span>}
                {snack.dietary && snack.calories && <span aria-hidden="true">·</span>}
                {snack.calories && <span className="tabular-nums">{snack.calories}</span>}
              </div>
            )}

            <p className="text-xs text-neutral-400 mt-2 line-clamp-2 leading-relaxed">{snack.description}</p>
          </div>

          {/* Opens the size / flavor popup */}
          <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-2">
            <span className="text-xs text-neutral-400">
              {qty > 0 ? (
                <span className="text-amber-300 font-medium tabular-nums">{qty} in your order</span>
              ) : soldOut ? (
                <span className="text-red-400">Unavailable</span>
              ) : left <= 10 ? (
                <span className="text-amber-300 tabular-nums">Only {left} left</span>
              ) : snack.deal ? (
                <span className="text-red-300 font-medium">Take {snack.deal.take}, pay {snack.deal.pay}</span>
              ) : snack.combo ? (
                'You pick sizes & flavors'
              ) : snack.flavors ? (
                'Sizes & flavors'
              ) : (
                `${snack.sizes.length} size${snack.sizes.length === 1 ? '' : 's'}`
              )}
            </span>

            <button
              type="button"
              onClick={() => setOpenSnack(snack)}
              disabled={!canAdd}
              className="h-8 px-3 shrink-0 whitespace-nowrap rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 flex items-center justify-center gap-1.5 font-bold text-xs shadow-sm shadow-amber-400/20 cursor-pointer disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              {soldOut ? 'Sold Out' : !canAdd ? 'No More Left' : qty > 0 ? 'Add More' : snack.combo ? 'Build Combo' : 'Choose Size'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto" id="snacks">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>{movie.title}</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-400">{format.name}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedSeats.length} Seats ({sortSeats(selectedSeats).join(', ')})</span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 mt-1">
            <UtensilsCrossed className="w-5 h-5 text-amber-400" />
            Cinema Concessions & Gourmet Snacks
          </h2>
          <p className="text-xs text-neutral-400 mt-1">Pick up at the dedicated express concession counter upon ticket arrival</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onContinue}
            className="text-xs font-semibold text-neutral-400 hover:text-white px-4 py-2.5 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-neutral-900 transition-colors cursor-pointer"
          >
            Skip to Payment
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3.5 py-2 rounded-xl font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeCategory === cat.id
                ? 'bg-amber-400 text-neutral-950 font-bold shadow-sm shadow-amber-400/20'
                : 'bg-neutral-900/70 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Combos, apart from the single items */}
      {shownCombos.length > 0 && (
        <section className="space-y-4 p-5 rounded-3xl border border-amber-400/25 bg-amber-400/[0.03]">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Combos
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">Several things together for less. You still choose the size and flavor of each one.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">{shownCombos.map(renderCard)}</div>
        </section>
      )}

      {/* Snacks Grid */}
      {filteredSnacks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">{filteredSnacks.map(renderCard)}</div>
      )}

      {/* Sticky Bottom Order Bar */}
      <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-2 min-w-0">
          <div className="text-xs text-neutral-400">
            <span>Snacks Selected: </span>
            <span className="font-semibold text-white">{totalSnacksCount > 0 ? `${totalSnacksCount} items` : 'No snacks added yet'}</span>
          </div>
          {totals.snackLines.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {totals.snackLines.map((line) => (
                <div key={line.key} className="flex items-center gap-2 py-1 pl-2.5 pr-1 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-300">
                  <span className="font-bold text-amber-400 tabular-nums">{line.qty}x</span>
                  <span>{line.name}</span>
                  <span className="text-neutral-500 tabular-nums">{money(line.total)}</span>
                  <button
                    onClick={() => onRemoveSnack(line.key)}
                    aria-label={`Remove ${line.name}`}
                    className="w-5 h-5 rounded-md bg-neutral-800 hover:bg-red-500/80 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {snackDeals.map((deal) => (
            <div key={deal.name} className="text-xs text-emerald-400 tabular-nums">
              {deal.name}: -{money(deal.amount)}
            </div>
          ))}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white tabular-nums">{money(round2(totals.snacks - snackSaved))}</span>
            <span className="text-xs text-neutral-400">Concessions Subtotal</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onBack}
            className="text-xs font-semibold text-neutral-400 hover:text-white px-4 py-2.5 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-neutral-900 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Seats
          </button>

          <button
            onClick={onContinue}
            className="px-6 py-3 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold rounded-xl text-sm transition-all flex items-center gap-2 shadow-lg shadow-amber-400/20 cursor-pointer"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {openSnack && <SnackOptions snack={openSnack} catalog={catalog} use={use} onAdd={onAddSnack} onClose={() => setOpenSnack(null)} />}
    </div>
  );
};
