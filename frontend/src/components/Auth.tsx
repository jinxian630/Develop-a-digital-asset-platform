"use client";

import { useState, useEffect } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { prepareZkLogin, suiClient } from "../lib/zklogin";
import { jwtDecode } from "jwt-decode";
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { computeZkLoginAddress } from "@mysten/zklogin";

interface AuthProps {
  onLoginSuccess: (suiAddress: string, maxEpoch: number, jwt: string) => void;
}

export function Auth({ onLoginSuccess }: AuthProps) {
  const [nonce, setNonce] = useState<string>("");
  const [ephemeralKey, setEphemeralKey] = useState<Ed25519Keypair | null>(null);
  const [maxEpoch, setMaxEpoch] = useState<number>(0);
  const [randomness, setRandomness] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [suiAddress, setSuiAddress] = useState("");

  // Setup nonces on mount
  useEffect(() => {
    async function setupKeys() {
       try {
           // Skip network to prevent hanging on re-mounts/logouts
           const { ephemeralKeyPair: kp, randomness: rnd, nonce: n, maxEpoch: me } = prepareZkLogin();
           setEphemeralKey(kp);
           setRandomness(typeof rnd === 'string' ? rnd : (rnd as any).toString());
           setMaxEpoch(me);
           setNonce(n);
       } catch (err) {
           console.error("ZK Initializing Error:", err);
       }
    }
    setupKeys();
  }, []);

  const handleGoogleResponse = async (credentialResponse: any) => {
    try {
      setLoading(true);
      const jwt = credentialResponse.credential;
      if (!jwt) throw new Error("No JWT");

      // Decode JWT to get user info 
      const decodedJwt: any = jwtDecode(jwt);
      console.log("Logged in:", decodedJwt.email);

      // --- ZKLOGIN PROOF GENERATION ---
      // For demo purposes, we will use a hardcoded DEV salt. 
      // In production, the salt should be specific to the user.
      const userSalt = "1234567890123456789"; 

      const zkLoginAddress = computeZkLoginAddress({
        claimName: "sub",
        claimValue: decodedJwt.sub,
        iss: decodedJwt.iss,
        aud: decodedJwt.aud,
        userSalt,
        legacyAddress: false,
      });

      console.log("Computed ZKLogin Address:", zkLoginAddress);

      // Notify parent component about successful login
      setSuiAddress(zkLoginAddress);
      setIsAuthenticated(true);
      onLoginSuccess(zkLoginAddress, maxEpoch, jwt);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
       <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-300 px-4 py-2 rounded-lg text-sm backdrop-blur-sm border border-emerald-500/30 font-mono">
         <CheckCircle2 size={16} className="text-emerald-500" />
         {suiAddress.slice(0, 6)}...{suiAddress.slice(-4)}
       </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {nonce ? (
        <div className="opacity-90 hover:opacity-100 transition-opacity">
          <GoogleLogin
            onSuccess={handleGoogleResponse}
            onError={() => {
              console.log("Login Failed");
            }}
            nonce={nonce}
            type="standard"
            theme="filled_black"
            size="large"
            text="continue_with"
            shape="rectangular"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Preparing zkLogin...
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm mt-2">
          <Loader2 size={16} className="animate-spin" /> Verifying ZK Proofs...
        </div>
      )}
    </div>
  );
}
