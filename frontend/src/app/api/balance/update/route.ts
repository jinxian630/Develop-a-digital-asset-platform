// Fix 1: MySQL removed.
// HEX balances are now sourced exclusively from on-chain state via suiClient.getCoins().
// This endpoint is retained as a stub so existing callers don't 404,
// but it performs no database writes. The authoritative balance is always on-chain.
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
    try {
        const { address, add_amount } = await req.json();

        if (!address || add_amount === undefined) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // No-op: previously updated MySQL hex_balance.
        // Balance is now read live from Sui via client.getCoins({ coinType: HEX_COIN_TYPE }).
        // The gas station mints HEX on-chain after a successful trade — that IS the update.
        return NextResponse.json({ success: true, note: 'Balance is authoritative on-chain' });
    } catch (error) {
        console.error('API /balance/update PUT Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
