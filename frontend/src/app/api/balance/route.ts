// Fix 1: MySQL removed.
// HEX balance is now queried live from Sui Testnet via suiClient.getCoins().
// This endpoint is retained as a stub — the frontend fetches balance directly
// using the suiClient in page.tsx (fetchHexBalance function).
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const wallet_address = searchParams.get('wallet_address');

    if (!wallet_address) {
        return NextResponse.json({ error: 'Missing wallet_address' }, { status: 400 });
    }

    // No-op: previously queried MySQL balances table.
    // Balance is now authoritative on-chain — query the Sui client directly from
    // the frontend using suiClient.getCoins({ owner: addr, coinType: HEX_COIN_TYPE }).
    return NextResponse.json({
        note: 'Balances are on-chain. Query suiClient.getCoins() from the frontend.',
        hex_balance: null,
    });
}
