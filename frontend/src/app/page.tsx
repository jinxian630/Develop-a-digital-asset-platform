"use client";
import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Zap, Wallet, ArrowRightLeft, CheckCircle2, Info, Loader2, AlertTriangle, Copy, LogOut } from 'lucide-react';
import { Transaction } from '@mysten/sui/transactions';
import { Auth } from '@/components/Auth';
import { suiClient } from '@/lib/zklogin';

export default function HEXDashboard() {
  const MYR_BALANCE = 5000;          // wallet balance cap
  const HEX_RATE    = 0.01;          // 1 MYR = 0.01 HEX  (100 MYR = 1 HEX)

  const [latency, setLatency] = useState<number | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [hexBalance, setHexBalance] = useState<number>(0);
  const [myrBalance, setMyrBalance] = useState<number>(5000);
  const [showToast, setShowToast] = useState(false);
  const [spendInput, setSpendInput] = useState<string>("100");
  const spendAmount = parseFloat(spendInput) || 0;
  
  // Phase 2 Engine Modal State
  // Phase 4 General UX State
  const [isSwapping, setIsSwapping] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  // Phase 4: Auth & zkLogin State
  const [suiAddress, setSuiAddress] = useState<string | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [testnetCoins, setTestnetCoins] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [liveLatency, setLiveLatency] = useState<number>(0);

  const fetchBalanceFromDB = async (address: string) => {
    try {
      const res = await fetch(`/api/balance?wallet_address=${address}`);
      const data = await res.json();
      if (data && typeof data.hex_balance !== 'undefined') {
        setHexBalance(parseFloat(data.hex_balance));
        if (typeof data.myrc_balance !== 'undefined') setMyrBalance(parseFloat(data.myrc_balance));
      }
    } catch (e) {
      console.error("Failed to fetch DB balance", e);
    }
  };

  const fetchSuiCoins = async (address: string) => {
    try {
      const { data } = await suiClient.getCoins({ owner: address });
      setTestnetCoins(data);
    } catch (e) {
      console.error("Failed to fetch SUI coins", e);
    }
  };

  // Load Session
  useEffect(() => {
    const savedAddress = localStorage.getItem('hex_user_address');
    if (savedAddress) {
      setSuiAddress(savedAddress);
      fetchBalanceFromDB(savedAddress);
      fetchSuiCoins(savedAddress);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem('hex_user_address');
    setSuiAddress(null);
    setHexBalance(0);
    setMyrBalance(5000);
    setTestnetCoins([]);
  };

  const copyAddress = () => {
    if (suiAddress) {
      navigator.clipboard.writeText(suiAddress);
      // Toast could be added here for copied text
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    // Remove leading zero if the next character is a digit
    if (value.startsWith('0') && value.length > 1 && value[1] !== '.') {
        value = value.substring(1);
    }
    
    setSpendInput(value);
  };

  useEffect(() => {
    // Generate mock latency every 2 seconds to make the UI feel alive
    const interval = setInterval(() => {
      const newLatency = Math.floor(Math.random() * 800) + 10;
      setLiveLatency(newLatency);
      setLatencyHistory(prev => [...prev.slice(-9), newLatency]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Phase 3 Settlement Pool Mock State
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTimeActive, setBatchTimeActive] = useState(0);

  // We can track time spent in 0 state
  useEffect(() => {
    const timer = setInterval(() => {
      setBatchTimeActive(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const receiveAmount    = (spendAmount * HEX_RATE).toFixed(2);
  const isInsufficient   = spendAmount > myrBalance;
  const priceImpactPct   = (spendAmount / (myrBalance || 1)) * 100;
  const showPriceImpact  = priceImpactPct > 2;

  const latencyColor = liveLatency < 500 ? "bg-emerald-500" : liveLatency < 1000 ? "bg-amber-400" : "bg-rose-500";
  const avgLatency = latencyHistory.length ? (latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length).toFixed(0) : 0;

  const executeSwap = async () => {
    setIsSwapping(true);
    setTradeError(null);
    setShowConfirmModal(false);
    const startTime = performance.now();
    
    if (testnetCoins.length < 2) {
      setTradeError("You need at least 2 SUI coins in your wallet to test local settlement swaps. Please get more from the Testnet Faucet or split your coins.");
      setIsSwapping(false);
      return;
    }

    const order = {
      order_id: Math.floor(Math.random() * 100000),
      player_address: suiAddress || "0xAnonymous",
      asset: "HEX",
      price: 100,
      quantity: 1,
      type: 'Buy'
    };

    try {
      // 1. Submit Order to Rust Matching Engine
      const response = await fetch('http://localhost:8080/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      }).catch(() => {
        throw new Error("Network Error: Make sure Matching Engine is running on port 8080");
      });

      if (!response.ok) {
        throw new Error(`ORDER_QUEUED timeout (${response.status})`);
      }

      const { match_result, logs: engineLogs } = await response.json();
      
      // 2. Build Transaction Block for Dual-Signing
      const tx = new Transaction();
      const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID || "0x0"; 
      
      const coinAObjectId = testnetCoins[0].coinObjectId;
      const coinBObjectId = testnetCoins[1].coinObjectId;
      const recipientA = suiAddress;
      const recipientB = "0x0000000000000000000000000000000000000000000000000000000000000000";

      tx.moveCall({
          target: `${PACKAGE_ID}::settlement::execute_trade`,
          typeArguments: ["0x2::sui::SUI", "0x2::sui::SUI"],
          arguments: [
              tx.object(coinAObjectId),
              tx.object(coinBObjectId),
              tx.pure.address(recipientA as string),
              tx.pure.address(recipientB),
          ],
      });

      // 3. Request Gas Station Sponsor
      const gasStationUrl = process.env.NEXT_PUBLIC_GAS_STATION_URL || 'http://localhost:8081';
      // Set a generic sender to allow building without a sponsor
      tx.setSender(suiAddress || "0x0000000000000000000000000000000000000000000000000000000000000000");
      const txBytes = await tx.build({ client: suiClient });
      const txBase64 = btoa(txBytes.reduce((data, byte) => data + String.fromCharCode(byte), ''));
      
      const sponsorRes = await fetch(`${gasStationUrl}/api/sponsor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txBytes: txBase64 }),
      });
      
      if (!sponsorRes.ok) {
        throw new Error("Failed to get gas sponsorship: " + sponsorRes.statusText);
      }
      const { sponsorSignature } = await sponsorRes.json();
      console.log("Gas Station Response Signature:", sponsorSignature);

      // Note: Actual zkLogin signature submission is omitted for this UI mock since ephemeral keys aren't fully wired for signing here.
      // await suiClient.executeTransactionBlock({ transactionBlock: txBytes, signature: [userSignature, sponsorSignature] });

      const endTime = performance.now();
      
      setLatency(endTime - startTime);
      setLogs(prev => [...engineLogs.reverse(), ...prev].slice(0, 50));
      
      await fetch('/api/balance/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              address: suiAddress, 
              add_amount: parseFloat(receiveAmount) 
          })
      });
      if (suiAddress) {
          fetchBalanceFromDB(suiAddress);
          fetchSuiCoins(suiAddress); // Refresh coins after mock trade
      }

      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
      setSpendInput("0");

    } catch (error: any) {
      console.error("Trade failed:", error);
      setTradeError(error.message || "Network Error");
      setTimeout(() => setTradeError(null), 4000);
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* Top Bar Navigation */}
      <header className="sticky top-0 z-50 flex justify-between items-center px-6 py-4 bg-slate-900/80 backdrop-blur-md border-b border-white/5">
        <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2 tracking-tight">
          <Zap size={20} className="text-emerald-400" /> HEX Hybrid Exchange
        </h1>
        <div className="flex items-center gap-4">
          {suiAddress && (
            <div className="flex items-center gap-2">
              <button 
                onClick={copyAddress}
                className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 px-3 py-1.5 rounded-full border border-white/5 transition-colors group cursor-pointer"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span className="font-mono text-sm text-slate-300">{suiAddress.slice(0, 6)}...{suiAddress.slice(-4)}</span>
                <Copy size={12} className="text-slate-500 group-hover:text-emerald-400" />
              </button>
              <button onClick={logout} className="p-1.5 bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 rounded-full transition-colors">
                <LogOut size={14} />
              </button>
            </div>
          )}
          <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-emerald-500/20">
            <Activity size={12} className="animate-pulse" /> Engine Online
          </span>
        </div>
      </header>

      {/* 60 / 40 Split Layout */}
      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* Left Column (User Perspective - 60%) */}
        <section className="lg:col-span-3 space-y-6">
          
          {/* Wallet Status Card (Asset Dashboard) */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800/50 border border-white/10 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <ShieldCheck size={120} />
            </div>
            <h2 className="text-sm text-slate-400 font-medium mb-1 tracking-wider uppercase">Asset Dashboard</h2>
            <div className="flex justify-between items-end relative z-10">
               {suiAddress ? (
                 <div>
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/30">
                        <Wallet size={24} className="text-emerald-400" />
                      </div>
                      <p className="text-4xl font-light tracking-tight">{hexBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xl text-emerald-400 font-medium">HEX</span></p>
                    </div>
                 </div>
               ) : (
                 <div className="mt-4">
                    <Auth onLoginSuccess={async (addr, epoch, token) => {
                      await fetch('/api/user', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ wallet_address: addr })
                      });
                      localStorage.setItem('hex_user_address', addr);
                      setSuiAddress(addr);
                      setJwtToken(token);
                      fetchBalanceFromDB(addr);
                    }} />
                 </div>
               )}
               <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-md text-sm backdrop-blur-sm border border-emerald-500/30">
                 <CheckCircle2 size={14} /> {suiAddress ? "Session Active" : "Not Authenticated"}
               </div>
            </div>
          </div>

          {/* Core Swap Interface */}
          <div className="p-1 rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 shadow-2xl relative">
             <div className="bg-slate-950/80 rounded-[1.4rem] p-6 backdrop-blur-xl border border-white/5">
                <div className="flex justify-between items-center mb-6">
                   <h2 className="text-lg font-medium text-slate-200">Express Swap</h2>
                </div>
                
                {/* Input Fields Mockup */}
                <div className="space-y-2">
                   <div className={`bg-slate-900 p-4 rounded-xl border transition-colors ${isInsufficient ? 'border-rose-500/50' : 'border-white/5 group hover:border-slate-700'}`}>
                      <div className="flex justify-between text-sm text-slate-400 mb-2">
                         <span>Spend</span>
                         <div className="flex items-center gap-2">
                            <span>Balance: {myrBalance.toLocaleString()} MYR</span>
                            <button onClick={() => setSpendInput(myrBalance.toString())} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded text-emerald-400 transition-colors border border-slate-700">MAX</button>
                         </div>
                      </div>
                      <div className="flex justify-between items-center">
                         <input
                           id="spend-amount"
                           type="text"
                           value={spendInput}
                           onChange={handleInputChange}
                           className="bg-transparent text-3xl font-light outline-none w-1/2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                         />
                         <span className="bg-slate-800 px-3 py-1.5 rounded-lg font-medium">MYR</span>
                      </div>
                      {isInsufficient && (
                        <p className="text-xs text-rose-400 mt-2">⚠ Insufficient balance (max {myrBalance} MYR)</p>
                      )}
                   </div>

                   <div className="flex justify-center -my-3 relative z-10">
                      <button className="bg-slate-800 p-2 rounded-xl border border-slate-700 hover:bg-slate-700 hover:border-emerald-500/50 transition-all text-slate-400 hover:text-emerald-400">
                         <ArrowRightLeft size={18} className="rotate-90" />
                      </button>
                   </div>

                   {/* Exchange Rate Info */}
                   <div className="flex justify-between items-center px-1 pt-2 text-xs text-slate-500">
                     <span>Exchange Rate: 100 MYR = 1 HEX</span>
                     {showPriceImpact && (
                       <span className="text-amber-400 font-semibold">⚠ &gt;2% price impact</span>
                     )}
                   </div>

                   <div className="bg-slate-900 p-4 rounded-xl border border-white/5 group hover:border-slate-700 transition-colors">
                      <div className="flex justify-between text-sm text-slate-400 mb-2">
                         <span>Receive (Estimated)</span>
                      </div>
                      <div className="flex justify-between items-center">
                         <span className="text-3xl font-light text-emerald-400 w-1/2 tabular-nums">{receiveAmount}</span>
                         <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg font-medium border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">HEX</span>
                      </div>
                   </div>
                </div>

                {/* Execution Buttons */}
                <div className="mt-8 grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setShowConfirmModal(true)}
                    disabled={isInsufficient || spendAmount <= 0 || isSwapping || !suiAddress}
                    className="col-span-1 flex justify-center items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {!suiAddress ? (
                      'LOGIN REQUIRED'
                    ) : isSwapping ? (
                      <><Loader2 size={18} className="animate-spin" /> SWAPPING...</>
                    ) : (
                      'SWAP NOW (BUY)'
                    )}
                  </button>
                  <div className="col-span-1 relative group">
                    <button 
                      disabled
                      className="w-full bg-slate-800 text-slate-500 font-bold py-4 rounded-xl transition-all cursor-not-allowed border border-slate-700"
                    >
                      SELL HEX
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-slate-800 text-slate-200 text-xs rounded-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl border border-slate-700">
                      Sell flow coming soon
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                    </div>
                  </div>
                </div>
             </div>

             {/* Success Notification Toast */}
             <div className={`absolute -top-12 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 px-6 py-2 rounded-full font-medium shadow-lg flex items-center gap-2 transition-all duration-300 ${showToast ? 'opacity-100 translate-y-16' : 'opacity-0 translate-y-0 pointer-events-none'}`}>
                <CheckCircle2 size={18} /> HEX Coins successfully added to wallet
             </div>

             {/* Error Notification Toast */}
             <div className={`absolute -top-12 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-6 py-2 rounded-full font-medium shadow-lg flex items-center gap-2 transition-all duration-300 ${tradeError ? 'opacity-100 translate-y-16' : 'opacity-0 translate-y-0 pointer-events-none'}`}>
                <AlertTriangle size={18} /> Swap failed — {tradeError}
             </div>
          </div>
        </section>

        {/* Right Column (Admin Perspective - 40%) */}
        <section className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Compact Latency Status Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${latencyColor} animate-pulse`}></div>
              <span className="text-slate-300 font-medium">Engine</span>
              <span className="text-slate-500 font-mono text-sm">{liveLatency}ms</span>
            </div>
            <button 
              onClick={() => setShowModal(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors border border-emerald-500/20"
            >
              Details →
            </button>
          </div>

          {/* Settlement Mock Queue - Part 3 Redesign */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
             <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-300">Phase 3: Pending Settlement Pool</h3>
                  {/* Tooltip implementation */}
                  <div className="relative group cursor-help">
                    <Info size={14} className="text-slate-500 hover:text-emerald-400 transition-colors" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 text-slate-200 text-xs rounded-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl border border-slate-700">
                      Your transaction is grouped with others to reduce gas costs. This typically takes 30–90 seconds.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                    </div>
                  </div>
                </div>
             </div>
             
             {/* Text labels rather than 0/3 */}
             <div className="flex justify-between items-end mb-2">
                <span className="text-xs text-slate-400">{batchProgress} of 3 transactions batched</span>
                <span className="text-[10px] text-slate-500 font-mono">Estimated compression: ~45s</span>
             </div>

             <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden shadow-inner flex">
               <div 
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-1000 ease-out" 
                  style={{ width: `${(batchProgress / 3) * 100}%` }}
                ></div>
             </div>
             
             {/* Stuck State Warning > 120s */}
             {batchProgress === 0 && batchTimeActive > 120 ? (
               <div className="animate-in slide-in-from-top-2 fade-in bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 flex justify-between items-center mt-2">
                 <span className="text-xs text-rose-400 flex items-center gap-2">
                   ⚠️ Batch is taking longer than expected.
                 </span>
                 <div className="flex gap-2">
                   <button onClick={() => setBatchTimeActive(0)} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-300 transition-colors border border-slate-700">Retry</button>
                   <button onClick={() => setBatchTimeActive(0)} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-rose-400 transition-colors border border-slate-700">Cancel</button>
                 </div>
               </div>
             ) : null}
          </div>
        </section>

      </main>

      {/* Swap Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <h3 className="text-lg font-medium text-slate-200 mb-4 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400" /> Confirm Swap
              </h3>
              
              <div className="space-y-3 bg-slate-800/50 p-4 rounded-xl border border-slate-800 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">You Spend</span>
                  <span className="text-slate-100 font-medium">{spendAmount} MYR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">You Receive</span>
                  <span className="text-emerald-400 font-medium">{receiveAmount} HEX</span>
                </div>
                <div className="border-t border-slate-700 my-2 pt-2 flex justify-between">
                  <span className="text-slate-400">Rate</span>
                  <span className="text-slate-300">100 MYR = 1 HEX</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Est. Gas Savings</span>
                  <span className="text-emerald-400">~$4.20</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-800/30 flex gap-3">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 text-sm font-medium bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700"
              >
                Cancel
              </button>
              <button 
                onClick={executeSwap}
                className="flex-1 py-3 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-xl transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Engine Details Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-800/50">
              <h3 className="font-medium text-slate-200">Engine Status</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <Activity size={18} />
              </button>
            </div>

            {/* Modal Body: Stats */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-slate-500">Current Latency:</div>
                <div className="text-slate-200 font-mono text-right">{liveLatency} ms</div>
                
                <div className="text-slate-500">Rolling Avg (10s):</div>
                <div className="text-slate-200 font-mono text-right">{avgLatency} ms</div>
                
                <div className="text-slate-500">Engine Version:</div>
                <div className="text-slate-200 text-right">MatchingEngine_V1</div>
                
                <div className="text-slate-500">Order Status:</div>
                <div className="text-emerald-400 text-right">ONLINE</div>
              </div>

              {/* Modal Body: Live Log Terminal */}
              <div className="mt-6">
                <h4 className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Live Log</h4>
                <div className="bg-black rounded-xl p-3 border border-slate-800 h-48 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-2">
                  {logs.length === 0 ? (
                     <div className="opacity-50 text-center mt-6">Awaiting Order Flow...</div>
                  ) : (
                     logs.map((log, i) => (
                       <div key={i} className="border-l-2 border-slate-800 pl-3 py-1 hover:border-emerald-500 transition-colors">
                         <span className="opacity-50">[{log.timestamp || new Date().toISOString()}]</span>{" "}
                         <span className="text-cyan-400">{log.module || "Engine"}</span> ::{" "}
                         <span className={log.event === 'ORDER_MATCHED' ? 'text-emerald-400' : 'text-amber-400'}>{log.event || "LOG"}</span>{" "}
                         <span className="opacity-50 text-emerald-400/50">{log.performance || ""}</span>
                       </div>
                     ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
              <button 
                onClick={() => navigator.clipboard.writeText(JSON.stringify(logs, null, 2))}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
              >
                Copy Log
              </button>
              <button 
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-slate-900 font-medium bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
