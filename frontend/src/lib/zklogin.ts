import { generateRandomness } from "@mysten/zklogin";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce } from "@mysten/zklogin";
import { jwtDecode } from "jwt-decode";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

// Setup Sui Client
export const suiClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl("testnet"),
  network: "testnet",
});

export const prepareZkLogin = () => {
  // 1. Generate an Ephemeral Key
  const ephemeralKeyPair = new Ed25519Keypair();
  const ephemeralPublicKey = ephemeralKeyPair.getPublicKey();

  // 2. Generate Randomness (for the nonce)
  const randomness = generateRandomness();

  // 3. Define Expiration Epoch (e.g., current epoch + 2)
  // Usually requires querying the network to get current epoch, 
  // but for the demo we can just set an arbitrary future epoch like 100 or query it.
  const maxEpoch = 1000; // Hardcoded future epoch for simplicity in demo

  // 4. Generate Nonce
  const nonce = generateNonce(ephemeralPublicKey, maxEpoch, randomness);

  return { ephemeralKeyPair, randomness, maxEpoch, nonce };
};
