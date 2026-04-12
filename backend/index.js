require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = require('@mysten/sui/jsonRpc');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { Transaction } = require('@mysten/sui/transactions');

// ── Fix 4C: Process-level crash guards ─────────────────────────────────────
// These prevent ANY unhandled error from killing the server process.
process.on('uncaughtException', (err) => {
    console.error('[CRASH PREVENTED] Uncaught exception:', err.message);
    // Server keeps running
});

process.on('unhandledRejection', (reason) => {
    console.error('[CRASH PREVENTED] Unhandled promise rejection:', reason);
    // Server keeps running
});

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8081;
const SUI_RPC_URL = process.env.SUI_RPC_URL || getJsonRpcFullnodeUrl('testnet');
const client = new SuiJsonRpcClient({ url: SUI_RPC_URL });

let sponsorKeypair;
try {
    if (process.env.SPONSOR_SECRET_KEY) {
        sponsorKeypair = Ed25519Keypair.fromSecretKey(process.env.SPONSOR_SECRET_KEY);
        console.log(`Gas Station Sponsor Address: ${sponsorKeypair.getPublicKey().toSuiAddress()}`);
    } else {
        console.log("No SPONSOR_SECRET_KEY provided, generating ephemeral keypair for dev mock.");
        sponsorKeypair = new Ed25519Keypair();
        console.log(`Ephemeral Sponsor Address: ${sponsorKeypair.getPublicKey().toSuiAddress()}`);
    }
} catch (e) {
    console.error("Failed to parse SPONSOR_SECRET_KEY:", e.message);
    sponsorKeypair = new Ed25519Keypair();
}

// ── Fix 4A: Wrapped sponsor handler — never crashes the server ─────────────
app.post('/api/sponsor', async (req, res) => {
    try {
        const {
            coinAObjectId, coinBObjectId,
            coinTypeA, coinTypeB,
            recipientA, recipientB,
            buyOrderId, sellOrderId,
            amount
        } = req.body;

        if (!coinAObjectId || !coinBObjectId || !recipientA || !recipientB) {
            return res.status(400).json({ error: "Missing match parameters from engine." });
        }

        console.log(`\n[SPONSOR] Received match — Buy: ${buyOrderId} <-> Sell: ${sellOrderId}`);
        console.log(`[SPONSOR] Buyer:  ${recipientA.slice(0, 10)}… | HEX coin: ${coinAObjectId.slice(0, 10)}…`);
        console.log(`[SPONSOR] Seller: ${recipientB.slice(0, 10)}… | HEX coin: ${coinBObjectId.slice(0, 10)}…`);

        const PACKAGE_ID    = process.env.PACKAGE_ID    || "0x8989aa462ea4a4cfed9fdcacb6e16d2575795c96e7bacbb8b63cb12a4cfd2bc9";
        const TREASURY_CAP_ID = process.env.TREASURY_CAP_ID || "";
        const HEX_COIN_TYPE = process.env.HEX_COIN_TYPE || `${PACKAGE_ID}::hex_coin::HEX_COIN`;
        const sponsorAddr   = sponsorKeypair.getPublicKey().toSuiAddress();

        const tx = new Transaction();
        tx.setSender(sponsorAddr);
        tx.setGasOwner(sponsorAddr);

        // ── Determine if the sell side used a HEX coin (for burn) ───────────
        // coinTypeB is the sell order's coin_type — HEX_COIN_TYPE means we can burn it
        const sellIsHex = coinTypeB && coinTypeB.includes('hex_coin');
        const mintAmount = Math.max(1, Math.floor((amount || 5) / 1));

        if (TREASURY_CAP_ID && sellIsHex) {
            // ── Settlement A: Burn seller's HEX + Mint to buyer ─────────────
            console.log(`[SPONSOR] Settlement: BURN ${coinBObjectId.slice(0, 10)}… + MINT ${mintAmount} raw HEX to buyer`);

            // Step 1: Burn the seller's HEX coin
            tx.moveCall({
                target: `${PACKAGE_ID}::hex_coin::burn`,
                typeArguments: [],
                arguments: [
                    tx.object(TREASURY_CAP_ID),
                    tx.object(coinBObjectId),  // seller's HEX coin — consumed+burned
                ],
            });

            // Step 2: Mint equivalent HEX to the buyer
            tx.moveCall({
                target: `${PACKAGE_ID}::hex_coin::mint`,
                typeArguments: [],
                arguments: [
                    tx.object(TREASURY_CAP_ID),
                    tx.pure.u64(mintAmount),
                    tx.pure.address(recipientA),
                ],
            });

            console.log(`[SPONSOR] Minting ${mintAmount} raw HEX (${(mintAmount / 100).toFixed(2)} HEX) to buyer ${recipientA.slice(0, 10)}…`);

        } else if (TREASURY_CAP_ID) {
            // ── Settlement B: Mint only (BUY-only flow, no HEX coin to burn) ─
            console.log(`[SPONSOR] Settlement: MINT-only — ${mintAmount} raw HEX to buyer`);

            tx.moveCall({
                target: `${PACKAGE_ID}::hex_coin::mint`,
                typeArguments: [],
                arguments: [
                    tx.object(TREASURY_CAP_ID),
                    tx.pure.u64(mintAmount),
                    tx.pure.address(recipientA),
                ],
            });

        } else {
            // ── Settlement C: No TreasuryCap — use mock SUI swap ────────────
            console.log(`[SPONSOR] Settlement: Mock SUI swap (no TreasuryCap configured)`);

            const [sponsorCoinA, sponsorCoinB] = tx.splitCoins(tx.gas, [
                tx.pure.u64(5000),
                tx.pure.u64(5000),
            ]);
            tx.moveCall({
                target: `${PACKAGE_ID}::settlement::execute_trade`,
                typeArguments: [coinTypeA || "0x2::sui::SUI", coinTypeB || "0x2::sui::SUI"],
                arguments: [
                    sponsorCoinA,
                    sponsorCoinB,
                    tx.pure.address(recipientA),
                    tx.pure.address(recipientB),
                ],
            });
        }

        const builtTxBytes = await tx.build({ client });
        const { signature } = await sponsorKeypair.signTransaction(builtTxBytes);

        const executeResponse = await client.executeTransactionBlock({
            transactionBlock: builtTxBytes,
            signature: signature,
            options: { showEffects: true },
        });

        // ── Fix 4A: Check transaction status ────────────────────────────────
        if (executeResponse.effects?.status?.status !== 'success') {
            const errDetail = executeResponse.effects?.status?.error ?? 'Unknown error';
            console.error(`[SPONSOR] Transaction FAILED — ${errDetail}`);
            return res.status(400).json({
                error: 'Transaction failed on-chain',
                detail: errDetail,
            });
        }

        console.log(`[SPONSOR] Transaction success — digest: ${executeResponse.digest}`);
        console.log(`[SPONSOR] Explorer: https://suiexplorer.com/txblock/${executeResponse.digest}?network=testnet`);

        return res.json({
            sponsorSignature: signature,
            status: "success",
            digest: executeResponse.digest,
        });

    } catch (err) {
        // ── Fix 4A: Catch ALL errors — log and return 500, never crash ───────
        console.error(`[SPONSOR] Error: ${err.message}`);
        return res.status(500).json({
            error: 'Sponsorship failed',
            detail: err.message,
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'gas-station' });
});

app.listen(PORT, () => {
    console.log(`HEX Gas Station running on http://localhost:${PORT}`);
});
