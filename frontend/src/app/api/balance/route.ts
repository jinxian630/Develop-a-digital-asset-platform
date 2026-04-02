import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const wallet_address = searchParams.get('wallet_address');

    if (!wallet_address) {
        return NextResponse.json({ error: 'Missing wallet_address' }, { status: 400 });
    }

    try {
        const [rows]: any = await db.execute(
            'SELECT hex_balance, myrc_balance FROM balances WHERE wallet_address = ?',
            [wallet_address]
        );

        if (rows.length === 0) {
            return NextResponse.json({ hex_balance: 0, myrc_balance: 0 }); // Fallback if no user
        }

        return NextResponse.json(rows[0]);
    } catch (error) {
        console.error('API /balance GET Error:', error);
        return NextResponse.json({ error: 'Database Error' }, { status: 500 });
    }
}
