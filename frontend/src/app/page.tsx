"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Wallet,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  Layers,
  LogOut,
  Copy,
  KeyRound,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { suiClient } from "@/lib/zklogin";
import { Auth } from "@/components/Auth";

const HEX_COIN_TYPE = process.env.NEXT_PUBLIC_HEX_COIN_TYPE ?? "";
const HEX_MYR_RATE = 100; // 1 HEX = 100 MYR

// ── Fix 2: Unit conversion constants ────────────────────────────────────────
// HEX stablecoin has 2 decimal places: 100 raw units = 1.00 HEX
// (matches how the gas station mints: mintAmount = orderAmount / 100)
const RAW_PER_HEX = 100; // 100 raw HEX units = 1 displayed HEX

// MIST conversion: SUI uses 1e9 MIST per SUI.
// For the orderbook engine, price and amount are passed as raw integers.
// We display them in HEX units (divide by RAW_PER_HEX).
const toHexDisplay = (raw: number) => (raw / RAW_PER_HEX).toFixed(4);

// Minimum order size: 0.01 HEX = 1 raw unit (engine MIN_TRADE_AMOUNT = 1)
const MIN_HEX_ORDER = 0.01;

export default function HEXDashboard() {
  // ── zkLogin Auth State ──────────────────────────────────────────
  const [suiAddress, setSuiAddress] = useState<string | null>(null);

  // ── Manual Address / Coin Loading ───────────────────────────────
  const [manualAddress, setManualAddress] = useState(
    "0x8beae79f9b62a33d0646535684e4aa6c5eb755a7772a331e376b884bd428f77b",
  );
  const [coins, setCoins] = useState<any[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<string>("");
  const [isLoadingCoins, setIsLoadingCoins] = useState(false);

  // ── Order Form State (values entered in HEX, not MIST) ─────────
  const [side, setSide] = useState<"Buy" | "Sell">("Sell");
  const [hexAmount, setHexAmount] = useState<string>("0.05"); // Fix 2: HEX not MIST
  const [hexPrice, setHexPrice] = useState<string>("1.00"); // Fix 2: HEX price
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // ── HEX Stablecoin Balance (on-chain) ──────────────────────────
  const [hexRawBalance, setHexRawBalance] = useState<number>(0);
  const [isLoadingHex, setIsLoadingHex] = useState(false);
  // HEX coin objects (for SELL orders — we need the actual object ID to burn)
  const [hexCoins, setHexCoins] = useState<any[]>([]);
  const [selectedHexCoin, setSelectedHexCoin] = useState<string>("");

  // ── Live Orderbook ──────────────────────────────────────────────
  const [orderbook, setOrderbook] = useState<{ bids: any[]; asks: any[] }>({
    bids: [],
    asks: [],
  });

  // The effective address to use — zkLogin address takes priority over manual
  const effectiveAddress = suiAddress ?? manualAddress;

  // ── Fetch on-chain HEX balance + coin objects (needed for SELL orders) ────
  const fetchHexBalance = useCallback(
    async (addr: string) => {
      if (!addr || !HEX_COIN_TYPE) return;
      setIsLoadingHex(true);
      try {
        const { data } = await suiClient.getCoins({
          owner: addr,
          coinType: HEX_COIN_TYPE,
        });
        const total = data.reduce((sum, c) => sum + parseInt(c.balance), 0);
        setHexRawBalance(total);
        // Store HEX coin objects so Sell orders can select one to burn
        setHexCoins(data);
        if (data.length > 0 && !selectedHexCoin) {
          setSelectedHexCoin(data[0].coinObjectId);
        }
      } catch (e) {
        console.error("Failed to fetch HEX balance", e);
      } finally {
        setIsLoadingHex(false);
      }
    },
    [selectedHexCoin],
  );

  // ── Auto-load coins + HEX balance when zkLogin address resolves ─
  useEffect(() => {
    if (suiAddress) {
      loadCoins(suiAddress);
      fetchHexBalance(suiAddress);
      // Poll HEX balance every 5 seconds
      const iv = setInterval(() => fetchHexBalance(suiAddress), 5000);
      return () => clearInterval(iv);
    }
  }, [suiAddress, fetchHexBalance]);

  // silent=true → skip clearing the status message (used when called after order submission)
  const loadCoins = async (addr?: string, silent = false) => {
    const target = addr ?? effectiveAddress;
    if (!target) return;
    setIsLoadingCoins(true);
    if (!silent) setMessage(null); // only clear message on explicit user-initiated loads
    try {
      const { data } = await suiClient.getCoins({ owner: target });
      setCoins(data);
      if (data.length > 0) {
        setSelectedCoin(data[0].coinObjectId);
      } else if (!silent) {
        setMessage({
          text: "No coins found. Get SUI from the Testnet Faucet.",
          type: "error",
        });
      }
    } catch (e: any) {
      if (!silent)
        setMessage({
          text: "Failed to load coins. Check the address.",
          type: "error",
        });
    } finally {
      setIsLoadingCoins(false);
    }
  };

  const fetchOrderbook = async () => {
    try {
      const res = await fetch("http://localhost:8080/orderbook");
      if (res.ok) setOrderbook(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchOrderbook();
    const iv = setInterval(fetchOrderbook, 2000);
    return () => clearInterval(iv);
  }, []);

  // ── Submit order — SELL uses HEX coin (to burn), BUY uses SUI coin ─────────
  const submitOrder = async () => {
    if (!effectiveAddress || !selectedCoin) {
      setMessage({
        text: "Load a SUI coin first (Wallet section).",
        type: "error",
      });
      return;
    }

    // SELL requires a HEX coin to burn on settlement
    if (side === "Sell" && !selectedHexCoin) {
      setMessage({
        text: "No HEX coin found. You need HEX tokens to sell. Buy some first.",
        type: "error",
      });
      return;
    }

    const parsedAmount = parseFloat(hexAmount);
    const parsedPrice = parseFloat(hexPrice);

    if (isNaN(parsedAmount) || parsedAmount < MIN_HEX_ORDER) {
      setMessage({
        text: `Minimum order is ${MIN_HEX_ORDER} HEX`,
        type: "error",
      });
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setMessage({ text: "Price must be greater than 0", type: "error" });
      return;
    }

    // SELL: validate user has enough HEX balance
    if (side === "Sell") {
      const amountNeeded = Math.floor(parsedAmount * RAW_PER_HEX);
      if (amountNeeded > hexRawBalance) {
        setMessage({
          text: `Insufficient HEX balance. You have ${(hexRawBalance / RAW_PER_HEX).toFixed(2)} HEX, trying to sell ${parsedAmount.toFixed(2)} HEX.`,
          type: "error",
        });
        return;
      }
    }

    const amountRaw = Math.floor(parsedAmount * RAW_PER_HEX);
    const priceRaw = Math.floor(parsedPrice * RAW_PER_HEX);

    setIsSubmitting(true);
    setMessage(null);
    try {
      const order = {
        side: side.toLowerCase(),
        // SELL: use HEX coin type (gas station will burn it)
        // BUY:  use SUI coin type
        coin_type: side === "Sell" ? HEX_COIN_TYPE : "0x2::sui::SUI",
        amount: amountRaw,
        price: priceRaw,
        owner_address: effectiveAddress,
        // SELL: pass HEX coin object so gas station can burn it on match
        // BUY:  pass SUI coin object (used for gas / settlement reference)
        coin_object_id: side === "Sell" ? selectedHexCoin : selectedCoin,
      };

      const res = await fetch("http://localhost:8080/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody?.error ?? `Engine rejected order (${res.status})`,
        );
      }
      const data = await res.json();

      // Refresh coins + orderbook silently (don't wipe the success message)
      fetchOrderbook();
      await loadCoins(effectiveAddress, true);
      if (effectiveAddress) fetchHexBalance(effectiveAddress);

      const counterSide = side === "Buy" ? "Sell" : "Buy";
      setSide(counterSide); // auto-flip for next order

      setMessage({
        text: `✓ ${side} order accepted! (ID: ${data.order_id?.slice(0, 8)}…) — now submit a matching ${counterSide} order to trigger the match.`,
        type: "success",
      });
    } catch (e: any) {
      setMessage({
        text: e.message ?? "Failed to submit order.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = () => {
    setSuiAddress(null);
    setCoins([]);
    setSelectedCoin("");
  };

  const copyAddress = () => {
    if (suiAddress) navigator.clipboard.writeText(suiAddress);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex justify-between items-center px-6 py-3 bg-slate-900/80 backdrop-blur-md border-b border-white/5">
        <h1 className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
          <Layers size={18} className="text-emerald-400" /> HEX Hybrid Exchange
        </h1>
        <div className="flex items-center gap-3">
          {suiAddress ? (
            <>
              <button
                onClick={copyAddress}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full border border-white/5 transition-colors text-sm"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                <span className="font-mono text-slate-300">
                  {suiAddress.slice(0, 8)}…{suiAddress.slice(-4)}
                </span>
                <Copy size={11} className="text-slate-500" />
              </button>
              <button
                onClick={logout}
                className="p-1.5 bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 rounded-full transition-colors"
                title="Sign Out"
              >
                <LogOut size={14} />
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-500 italic">
              Not signed in — use Google zkLogin or enter address manually
            </span>
          )}
          <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-emerald-500/20">
            <Activity size={11} className="animate-pulse" /> Engine Online
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* ── Left Column ── */}
        <div className="md:col-span-5 space-y-5">
          {/* ── HEX Stablecoin Balance Card ── */}
          <section className="bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-500/25 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            {/* Decorative glow */}
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-400" />
                <h2 className="text-base font-semibold text-slate-200">
                  My HEX Balance
                </h2>
              </div>
              <button
                onClick={() => {
                  const addr = suiAddress ?? manualAddress;
                  if (addr) fetchHexBalance(addr);
                }}
                disabled={isLoadingHex}
                className="p-1.5 text-slate-500 hover:text-emerald-400 transition-colors"
                title="Refresh"
              >
                <RefreshCw
                  size={14}
                  className={isLoadingHex ? "animate-spin" : ""}
                />
              </button>
            </div>

            <div className="relative z-10">
              {/* HEX Amount */}
              <div className="mb-1">
                <span className="text-4xl font-light tracking-tight text-white tabular-nums">
                  {(hexRawBalance / RAW_PER_HEX).toFixed(2)}
                </span>
                <span className="ml-2 text-lg font-semibold text-emerald-400">
                  HEX
                </span>
              </div>

              {/* MYR Value */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-slate-400">≈</span>
                <span className="text-xl font-medium text-slate-300 tabular-nums">
                  MYR{" "}
                  {(
                    (hexRawBalance / RAW_PER_HEX) *
                    HEX_MYR_RATE
                  ).toLocaleString("en-MY", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              {/* Peg Info */}
              <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-800">
                <span>Peg Rate</span>
                <span className="font-mono text-emerald-400/80">
                  1 HEX = MYR 100.00{" "}
                  <span className="text-slate-600">(fixed)</span>
                </span>
              </div>

              {!suiAddress && hexRawBalance === 0 && (
                <p className="text-xs text-slate-600 mt-3 italic text-center">
                  Sign in via zkLogin to see your live on-chain balance
                </p>
              )}
            </div>
          </section>

          {/* ── zkLogin Card ── */}
          <section className="bg-gradient-to-br from-slate-900 to-violet-950/20 border border-violet-500/20 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-semibold mb-1 flex items-center gap-2 text-slate-200">
              <KeyRound size={16} className="text-violet-400" /> Sui zkLogin
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Sign in with Google to get your Sui address — no seed phrase
              needed.
            </p>

            {suiAddress ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-3 rounded-xl text-sm">
                  <CheckCircle2
                    size={16}
                    className="text-emerald-400 shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="font-semibold">Session Active</p>
                    <p className="font-mono text-xs text-slate-400 mt-1 break-all">
                      {suiAddress}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <Auth
                onLoginSuccess={async (addr, epoch, jwt) => {
                  setSuiAddress(addr);
                  // No-op API call — session state lives in React, not MySQL
                  await fetch("/api/user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ wallet_address: addr }),
                  }).catch(() => {});
                }}
              />
            )}
          </section>

          {/* ── Wallet / Coin Loader ── */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-slate-200">
              <Wallet size={16} className="text-cyan-400" /> Wallet
            </h2>
            <div className="space-y-4">
              {/* Manual address input (only if NOT logged in via zkLogin) */}
              {!suiAddress && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block uppercase tracking-wider">
                    Manual Address{" "}
                    <span className="text-slate-600 normal-case">
                      (for protocol testing)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualAddress}
                      onChange={(e) => setManualAddress(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                    <button
                      onClick={() => loadCoins()}
                      disabled={isLoadingCoins}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                    >
                      {isLoadingCoins ? "…" : "Load"}
                    </button>
                  </div>
                </div>
              )}

              {/* Refresh button when using zkLogin */}
              {suiAddress && (
                <button
                  onClick={() => loadCoins(suiAddress)}
                  disabled={isLoadingCoins}
                  className="w-full bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-600/30 text-cyan-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isLoadingCoins ? "Refreshing…" : "↻ Refresh My Coins"}
                </button>
              )}

              {/* Coin Selector */}
              {coins.length > 0 && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block uppercase tracking-wider">
                    Select Coin ({coins.length} found)
                  </label>
                  <select
                    value={selectedCoin}
                    onChange={(e) => setSelectedCoin(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                  >
                    {coins.map((c) => (
                      <option key={c.coinObjectId} value={c.coinObjectId}>
                        {c.coinObjectId.slice(0, 12)}… —{" "}
                        {(parseInt(c.balance) / 1_000_000_000).toFixed(4)} SUI
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Coins loaded from Sui Testnet
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ── Order Form (Fix 2: amounts in HEX) ── */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-slate-200">
              <ArrowRightLeft size={16} className="text-emerald-400" /> Place
              Order
            </h2>
            <div className="space-y-4">
              {/* Side Toggle */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block uppercase tracking-wider">
                  Side
                </label>
                <div className="flex gap-2 p-1 bg-slate-950 rounded-lg">
                  {(["Buy", "Sell"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${
                        side === s
                          ? s === "Buy"
                            ? "bg-emerald-500 text-white shadow"
                            : "bg-rose-500 text-white shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* HEX Coin selector — only visible on SELL (user picks which coin to burn) */}
              {side === "Sell" && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
                  <label className="text-xs text-rose-400/80 mb-1 block uppercase tracking-wider font-semibold">
                    HEX Coin to Sell (will be burned on settlement)
                  </label>
                  {hexCoins.length > 0 ? (
                    <>
                      <select
                        value={selectedHexCoin}
                        onChange={(e) => setSelectedHexCoin(e.target.value)}
                        className="w-full bg-slate-950 border border-rose-500/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-400 text-slate-200"
                      >
                        {hexCoins.map((c) => (
                          <option key={c.coinObjectId} value={c.coinObjectId}>
                            {c.coinObjectId.slice(0, 12)}… —{" "}
                            {(parseInt(c.balance) / RAW_PER_HEX).toFixed(2)} HEX
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-rose-400/60 mt-1">
                        Available: {(hexRawBalance / RAW_PER_HEX).toFixed(2)}{" "}
                        HEX total
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-rose-400/60 italic py-1">
                      No HEX coins found. Place a Buy order first to receive
                      HEX.
                    </p>
                  )}
                </div>
              )}

              {/* Fix 2: Amount + Price labelled in HEX with raw unit hint */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block uppercase tracking-wider">
                    Amount{" "}
                    <span className="text-emerald-400/60 normal-case">
                      (HEX)
                    </span>
                  </label>
                  <input
                    id="order-amount-hex"
                    type="number"
                    step="0.01"
                    min={MIN_HEX_ORDER}
                    value={hexAmount}
                    onChange={(e) => setHexAmount(e.target.value)}
                    placeholder="0.05"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    ={" "}
                    {(
                      parseFloat(hexAmount || "0") * RAW_PER_HEX
                    ).toLocaleString()}{" "}
                    raw units
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block uppercase tracking-wider">
                    Price{" "}
                    <span className="text-emerald-400/60 normal-case">
                      (HEX)
                    </span>
                  </label>
                  <input
                    id="order-price-hex"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={hexPrice}
                    onChange={(e) => setHexPrice(e.target.value)}
                    placeholder="1.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">
                    ={" "}
                    {(
                      parseFloat(hexPrice || "0") * RAW_PER_HEX
                    ).toLocaleString()}{" "}
                    raw units
                  </p>
                </div>
              </div>

              <button
                id="submit-order-btn"
                onClick={submitOrder}
                disabled={
                  isSubmitting ||
                  !selectedCoin ||
                  (side === "Sell" && !selectedHexCoin)
                }
                className={`w-full py-3 rounded-xl font-bold transition-all shadow-lg text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                  side === "Buy"
                    ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-emerald-900/40"
                    : "bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-rose-900/40"
                }`}
              >
                {isSubmitting ? "Submitting…" : `Submit ${side} Order`}
              </button>

              {message && (
                <div
                  className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                    message.type === "error"
                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {message.type === "success" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  {message.text}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Right Column: Live Orderbook (Fix 3: display in HEX) ── */}
        <div className="md:col-span-7">
          <section
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col"
            style={{ minHeight: "680px" }}
          >
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-slate-200">
              <BookOpen size={16} className="text-indigo-400" /> Live Orderbook
              <span className="ml-auto text-xs text-slate-600 font-normal">
                Auto-refresh 2s
              </span>
            </h2>

            <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden text-sm flex flex-col">
              {/* Fix 3: Column headers now say HEX */}
              <div className="grid grid-cols-3 px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <div>Price (HEX)</div>
                <div className="text-center">Total Qty (HEX)</div>
                <div className="text-right">Orders</div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                {/* Asks */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-rose-400/50 px-2 mb-1.5 font-semibold">
                    Asks — Sell
                  </p>
                  {orderbook.asks?.length > 0 ? (
                    orderbook.asks.map((ask) => {
                      const totalRaw = ask.orders.reduce(
                        (a: number, o: any) => a + o.amount,
                        0,
                      );
                      const totalHex = parseFloat(toHexDisplay(totalRaw));
                      const priceHex = toHexDisplay(ask.price);
                      return (
                        <div
                          key={ask.price}
                          className="grid grid-cols-3 px-3 py-2 rounded-lg text-rose-400 relative overflow-hidden hover:bg-slate-800/60 transition-colors mb-1"
                        >
                          <div
                            className="absolute inset-0 bg-rose-500/5"
                            style={{
                              width: `${Math.min(100, totalHex * 10)}%`,
                            }}
                          />
                          <div className="z-10 font-mono font-semibold">
                            {priceHex}
                          </div>
                          <div className="z-10 font-mono text-center text-slate-300">
                            {toHexDisplay(totalRaw)}
                          </div>
                          <div className="z-10 font-mono text-right text-slate-500">
                            {ask.orders.length}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-slate-700 text-xs italic">
                      No asks in the book
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800" />

                {/* Bids */}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-emerald-400/50 px-2 mb-1.5 font-semibold">
                    Bids — Buy
                  </p>
                  {orderbook.bids?.length > 0 ? (
                    orderbook.bids.map((bid) => {
                      const totalRaw = bid.orders.reduce(
                        (a: number, o: any) => a + o.amount,
                        0,
                      );
                      const totalHex = parseFloat(toHexDisplay(totalRaw));
                      const priceHex = toHexDisplay(bid.price);
                      return (
                        <div
                          key={bid.price}
                          className="grid grid-cols-3 px-3 py-2 rounded-lg text-emerald-400 relative overflow-hidden hover:bg-slate-800/60 transition-colors mb-1"
                        >
                          <div
                            className="absolute inset-0 bg-emerald-500/5"
                            style={{
                              width: `${Math.min(100, totalHex * 10)}%`,
                            }}
                          />
                          <div className="z-10 font-mono font-semibold">
                            {priceHex}
                          </div>
                          <div className="z-10 font-mono text-center text-slate-300">
                            {toHexDisplay(totalRaw)}
                          </div>
                          <div className="z-10 font-mono text-right text-slate-500">
                            {bid.orders.length}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-slate-700 text-xs italic">
                      No bids in the book
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-600 mt-3 text-center italic">
              When a bid &amp; ask cross at the same price, the engine matches
              them instantly and the Gas Station settles on-chain.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
