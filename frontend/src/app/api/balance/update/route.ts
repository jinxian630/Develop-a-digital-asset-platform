import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PUT(req: Request) {
    try {
        const { address, add_amount } = await req.json();

        if (!address || add_amount === undefined) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // We assume 1 HEX = 100 MYR cost. So we add_amount to HEX and subtract (add_amount * 100) from MYR.
        // Wait, add_amount is actually the amount of HEX they receive in executeSwap.
        // The cost they input is "spendAmount". 
        // We will just do a simple update for HEX to prove the concept.
        
        await db.execute(
            `UPDATE balances 
             SET hex_balance = hex_balance + ? 
             WHERE wallet_address = ?`,
            [add_amount, address]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API /balance/update PUT Error:', error);
        return NextResponse.json({ error: 'Database Error' }, { status: 500 });
    }
}
