import React, { useState } from 'react';
import { CartSnack, Catalog, Movie, TheaterFormat, PaymentMethod, Order } from '../types';
import { BRAND_NAMES, PAY_NAMES, computeTotals, money, niceDate, niceTime, post, posterUrl, sortSeats } from '../api';
import { ArrowLeft, Lock, ShieldCheck, CreditCard, Sparkles } from 'lucide-react';

interface PaymentScreenProps {
  catalog: Catalog;
  movie: Movie;
  format: TheaterFormat;
  date: string;
  showtime: string;
  tickets: Record<string, number>;
  selectedSeats: string[];
  cartSnacks: CartSnack[];
  onPaymentSuccess: (order: Order) => void;
  onSeatsTaken: (message: string) => void;
  onBack: () => void;
}

const METHODS: { id: PaymentMethod; name: string; note: string; logos: string[] }[] = [
  { id: 'card', name: 'Credit or Debit Card', note: 'Visa, Mastercard, American Express', logos: ['visa', 'mastercard', 'amex'] },
  { id: 'paypal', name: 'PayPal', note: 'Safe online purchase protection', logos: ['paypal'] },
  { id: 'applepay', name: 'Apple Pay', note: 'One-touch biometric authorization', logos: ['applepay'] },
  { id: 'googlepay', name: 'Google Pay', note: 'Fast checkout with Google Account', logos: ['googlepay'] },
];

// The provider window differs a little per wallet: button color and the line at the bottom.
const WALLETS: Record<string, { button: string; footer: string }> = {
  paypal: { button: 'bg-[#0070e0] hover:bg-[#005fc0]', footer: 'Developed by PayPal in San Jose, California' },
  applepay: { button: 'bg-black hover:bg-neutral-800', footer: 'Developed by Apple in California' },
  googlepay: { button: 'bg-black hover:bg-neutral-800', footer: 'Developed by Google in Mountain View, California' },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cardBrand(digits: string) {
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  return '';
}

function luhn(digits: string) {
  let sum = 0;
  [...digits].reverse().forEach((d, i) => {
    let n = +d;
    if (i % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  });
  return sum % 10 === 0;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({
  catalog,
  movie,
  format,
  date,
  showtime,
  tickets,
  selectedSeats,
  cartSnacks,
  onPaymentSuccess,
  onSeatsTaken,
  onBack,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const [customerName, setCustomerName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [badFields, setBadFields] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [walletOpen, setWalletOpen] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  const totals = computeTotals(catalog, format, tickets, cartSnacks);
  const digits = cardNumber.replace(/\D/g, '');
  const brand = cardBrand(digits);
  const name = customerName.trim();

  const formatCardNumber = (value: string) => {
    const d = value.replace(/\D/g, '').slice(0, 16);
    return cardBrand(d) === 'amex'
      ? [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ')
      : d.replace(/(.{4})(?=.)/g, '$1 ');
  };

  const validate = () => {
    const bad: string[] = [];
    const need = (field: string, ok: unknown) => {
      if (!ok) bad.push(field);
    };
    need('name', name.length > 1);
    if (selectedMethod === 'card') {
      need('number', brand && digits.length === (brand === 'amex' ? 15 : 16) && luhn(digits));
      need('cardName', cardName.trim().length > 1);
      const exp = cardExpiry.match(/^(\d{2})\/(\d{2})$/);
      need('expiry', exp && +exp[1] >= 1 && +exp[1] <= 12 && new Date(2000 + +exp[2], +exp[1], 1) > new Date());
      need('cvc', new RegExp(`^\\d{${brand === 'amex' ? 4 : 3}}$`).test(cardCvc));
    }
    setBadFields(bad);
    if (!bad.length) return '';
    if (bad.includes('name')) return 'Enter the name for the ticket.';
    if (bad.includes('number')) return brand || !digits ? 'Check the card number.' : 'We accept Visa, Mastercard and American Express.';
    return 'Check the highlighted fields.';
  };

  const handleSubmit = () => {
    const problem = validate();
    setError(problem);
    if (problem) return;
    if (selectedMethod === 'card') executePayment();
    else setWalletOpen(true);
  };

  const executePayment = async () => {
    setWalletOpen(false);
    // Only the brand and last four digits are kept; the full card number is never sent anywhere.
    const payment = selectedMethod === 'card' ? { method: 'card', brand, last4: digits.slice(-4) } : { method: selectedMethod };
    try {
      setProcessingStep(selectedMethod === 'card' ? 'Authorizing your card' : `Confirming with ${PAY_NAMES[selectedMethod]}`);
      await sleep(1400);
      setProcessingStep('Reserving your seats');
      const [order] = await Promise.all([
        post<Order>('/api/orders', {
          movie,
          formatId: format.id,
          date,
          time: showtime,
          tickets,
          seats: selectedSeats,
          snacks: cartSnacks,
          payment,
          customer: { name },
        }),
        sleep(1100),
      ]);
      onPaymentSuccess(order);
    } catch (err: any) {
      setProcessingStep('');
      if (err.status === 409) onSeatsTaken(err.message);
      else setError(err.message || 'The payment could not be completed.');
    }
  };

  const inputClass = (field: string) =>
    `w-full mt-1 bg-neutral-900 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-amber-400 ${
      badFields.includes(field) ? 'border-red-500' : 'border-neutral-700'
    }`;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="flex items-center justify-between gap-4 bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>Checkout</span>
            <span aria-hidden="true">·</span>
            <span>256-Bit SSL Encrypted</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified Cinema Merchant
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1">Payment & Ticket Issuance</h2>
        </div>

        <button
          onClick={onBack}
          className="text-xs font-semibold text-neutral-400 hover:text-white px-3.5 py-2 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-neutral-900 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Edit Order
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Payment Options (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-5">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-400" />
              Choose Payment Method
            </h3>

            {/* Payment Method Selector Grid */}
            <div className="space-y-3">
              {METHODS.map((method) => {
                const isSelected = selectedMethod === method.id;
                return (
                  <div
                    key={method.id}
                    onClick={() => {
                      setSelectedMethod(method.id);
                      setError('');
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-neutral-900 border-amber-400 ring-1 ring-amber-400/30' : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-1.5 shrink-0">
                        {method.logos.map((logo) => (
                          <img
                            key={logo}
                            src={`/img/pay/${logo}.svg`}
                            alt={BRAND_NAMES[logo] || method.name}
                            className="w-12 h-8 object-contain bg-white rounded-md px-1.5 py-1 shadow-sm"
                          />
                        ))}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-white">{method.name}</div>
                        <div className="text-xs text-neutral-400">{method.note}</div>
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-amber-400 bg-amber-400 text-neutral-950' : 'border-neutral-600'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-neutral-950" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Credit Card Input Form if 'card' selected */}
            {selectedMethod === 'card' && (
              <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-3 pt-4">
                <div>
                  <label className="text-[11px] font-medium text-neutral-400 uppercase">Card Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      className={inputClass('number') + ' font-mono'}
                    />
                    {brand && (
                      <img
                        src={`/img/pay/${brand}.svg`}
                        alt={BRAND_NAMES[brand]}
                        className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 w-11 h-7 object-contain bg-white rounded px-1 py-0.5"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-neutral-400 uppercase">Cardholder Name</label>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="As shown on the card"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    className={inputClass('cardName')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400 uppercase">Expires</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="MM/YY"
                      value={cardExpiry}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setCardExpiry(d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d);
                      }}
                      className={inputClass('expiry') + ' font-mono'}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400 uppercase">CVV</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="CVC"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className={inputClass('cvc') + ' font-mono'}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-neutral-500">Test card: 4242 4242 4242 4242, any future expiry, any CVC.</p>
              </div>
            )}

            {/* Name for the ticket */}
            <div className="pt-2">
              <label className="text-[11px] font-medium text-neutral-400 uppercase">Name for Digital Pass & Receipt</label>
              <input
                type="text"
                autoComplete="name"
                placeholder="Full name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={`w-full mt-1 bg-neutral-950 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-amber-400 ${
                  badFields.includes('name') ? 'border-red-500' : 'border-neutral-700'
                }`}
              />
            </div>

            {/* Realistic Safe Disclaimer */}
            <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 text-neutral-400 text-[11px] flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Demonstration checkout environment. Real payment brand UI flow without live credit card billing.</span>
            </div>
          </div>
        </div>

        {/* Right Column: Order Summary (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 space-y-5">
            <h3 className="font-bold text-base text-white">Order Summary</h3>

            {/* Movie Feature Row */}
            <div className="flex gap-4 pb-4 border-b border-neutral-800">
              <div className="w-16 h-24 rounded-lg overflow-hidden shrink-0 border border-neutral-800">
                <img src={posterUrl(movie.posterPath, 'w185')} alt={movie.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-sm text-white line-clamp-1">{movie.title}</h4>
                <div className="text-xs font-semibold text-amber-400">{format.name}</div>
                <div className="text-xs text-neutral-400">
                  {niceDate(date)} · {niceTime(showtime)}
                </div>
                <div className="text-xs text-neutral-400">
                  Seats: <span className="text-neutral-200 font-medium">{sortSeats(selectedSeats).join(', ')}</span>
                </div>
              </div>
            </div>

            {/* Line Items Breakdown */}
            <div className="space-y-2.5 text-xs text-neutral-300">
              {totals.ticketLines.map((line) => (
                <div key={line.name} className="flex justify-between gap-3">
                  <span>
                    {line.qty}x {line.name} Ticket · {format.name} ({money(line.unit)}/ea)
                  </span>
                  <span className="font-semibold text-white tabular-nums">{money(line.total)}</span>
                </div>
              ))}

              {totals.snackLines.map((line) => (
                <div key={line.key} className="flex justify-between gap-3 text-neutral-400">
                  <span>
                    {line.qty}x {line.name}
                  </span>
                  <span className="font-medium text-neutral-300 tabular-nums">{money(line.total)}</span>
                </div>
              ))}

              {totals.deals.map((deal) => (
                <div key={deal.name} className="flex justify-between gap-3 text-emerald-400">
                  <span>Offer: {deal.name}</span>
                  <span className="font-semibold tabular-nums">-{money(deal.amount)}</span>
                </div>
              ))}

              <div className="flex justify-between text-neutral-400">
                <span>Online Booking & Licensing Fee</span>
                <span className="font-medium text-neutral-300 tabular-nums">{money(totals.fees)}</span>
              </div>

              <div className="flex justify-between text-neutral-400">
                <span>Estimated Sales Tax ({Math.round(catalog.cinema.taxRate * 100)}%)</span>
                <span className="font-medium text-neutral-300 tabular-nums">{money(totals.tax)}</span>
              </div>

              <div className="pt-3 border-t border-neutral-800 flex justify-between items-baseline text-sm">
                <span className="font-bold text-white">Total Amount</span>
                <span className="text-2xl font-black text-amber-400 tabular-nums">{money(totals.total)}</span>
              </div>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-300">
                {error}
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={handleSubmit}
              className="w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xl cursor-pointer bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-amber-400/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Complete Payment ({money(totals.total)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Provider window for PayPal / Apple Pay / Google Pay */}
      {walletOpen && selectedMethod !== 'card' && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3" onClick={() => setWalletOpen(false)}>
          <div
            role="dialog"
            aria-label={PAY_NAMES[selectedMethod]}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] bg-white text-[#1b1b1f] rounded-[18px] p-[26px] text-center shadow-2xl"
          >
            <div className="flex items-center mb-[22px]">
              <img src={`/img/pay/${selectedMethod}.svg`} alt={PAY_NAMES[selectedMethod]} className="h-[30px] max-w-[150px] object-contain" />
            </div>
            <p className="text-[#6b6b76]">Lumen Cinema</p>
            <p className="text-[2.2rem] leading-tight font-extrabold mt-0.5 mb-3 tabular-nums">{money(totals.total)}</p>
            <p className="bg-[#f3f3f6] rounded-[10px] p-2.5 text-sm mb-2">Paying as {name}</p>
            <button
              onClick={executePayment}
              className={`w-full mt-2.5 rounded-full py-[11px] px-[22px] font-bold text-white cursor-pointer ${WALLETS[selectedMethod].button}`}
            >
              Approve payment
            </button>
            <button
              onClick={() => {
                setWalletOpen(false);
                setError(`${PAY_NAMES[selectedMethod]} payment was cancelled.`);
              }}
              className="w-full mt-2.5 rounded-full py-[11px] px-[22px] font-bold border border-[#cfcfd6] hover:border-[#9d9da8] cursor-pointer"
            >
              Cancel and return
            </button>
            <p className="text-[#6b6b76] mt-3.5 text-xs">{WALLETS[selectedMethod].footer}</p>
          </div>
        </div>
      )}

      {/* Loading screen while the payment and booking go through */}
      {processingStep && (
        <div className="fixed inset-0 z-[60] bg-neutral-950/95 backdrop-blur-sm flex flex-col items-center justify-center gap-5">
          <div className="w-14 h-14 rounded-full border-[5px] border-neutral-800 border-t-amber-400 animate-spin" />
          <p className="text-sm font-semibold text-white">{processingStep}</p>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-neutral-950 font-black text-xs">L</span>
            <span className="tracking-widest font-bold">LUMEN CINEMA</span>
          </div>
        </div>
      )}
    </div>
  );
};
