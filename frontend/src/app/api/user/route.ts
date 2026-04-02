import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { wallet_address } = await req.json();

        if (!wallet_address) {
            return NextResponse.json({ error: 'Missing wallet_address' }, { status: 400 });
        }

        // Insert user if not exists
        await db.execute(
            'INSERT IGNORE INTO users (wallet_address) VALUES (?)',
            [wallet_address]
        );
        
        // Initialize balance if new
        // Start users off with 0 HEX and 5000 MYRC for the demo
        await db.execute(
            'INSERT IGNORE INTO balances (wallet_address, hex_balance, myrc_balance) VALUES (?, 0, 5000)',
            [wallet_address]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API /user POST Error:', error);
        return NextResponse.json({ error: 'Database Error while provisioning user' }, { status: 500 });
    }
}
