// Fix 1: MySQL removed.
// User identity is tracked via zkLogin session state in the frontend only.
// No database record is needed — the Sui address IS the user identity.
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { wallet_address } = await req.json();

        if (!wallet_address) {
            return NextResponse.json({ error: 'Missing wallet_address' }, { status: 400 });
        }

        // No-op: previously wrote to MySQL. Now we acknowledge the address exists
        // and let the frontend manage session state. On-chain data (HEX balance,
        // trade history) is queried live from Sui Testnet.
        return NextResponse.json({ success: true, address: wallet_address });
    } catch (error) {
        console.error('API /user POST Error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
