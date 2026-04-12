require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = require('@mysten/sui/jsonRpc');
const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');
const { Transaction } = require('@mysten/sui/transactions');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8081;
const SUI_RPC_URL = process.env.SUI_RPC_URL || getJsonRpcFullnodeUrl('testnet');
const client = new SuiJsonRpcClient({ url: SUI_RPC_URL });

let sponsorKeypair;
try {
    if (process.env.SPONSOR_SECRET_KEY) {
        // If it's a bech32 key (suiprivkey...), decode it.
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

app.post('/api/sponsor', async (req, res) => {
    try {
        const { txBytes } = req.body;
        if (!txBytes) {
            return res.status(400).json({ error: "Missing txBytes in request body." });
        }

        const tx = Transaction.from(txBytes);

        // Explicitly set the gas owner to the sponsor
        tx.setGasOwner(sponsorKeypair.getPublicKey().toSuiAddress());

        // Re-build the transaction to finalize gas object selection
        const builtTxBytes = await tx.build({ client });

        // Co-sign as the Sponsor
        const { signature } = await sponsorKeypair.signTransaction(builtTxBytes);

        res.json({ sponsorSignature: signature });
    } catch (error) {
        console.error("Sponsorship error:", error);
        res.status(500).json({ error: "Internal Server Error during sponsorship" });
    }
});

app.listen(PORT, () => {
    console.log(`HEX Gas Station running on http://localhost:${PORT}`);
});
