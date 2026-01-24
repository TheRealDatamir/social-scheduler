import { NextRequest, NextResponse } from 'next/server';
import { db, initDb, Settings } from '@/lib/db';

// GET /api/settings - Get settings
export async function GET() {
  try {
    await initDb();
    const result = await db.execute('SELECT * FROM settings WHERE id = 1');
    
    if (result.rows.length === 0) {
      // Return defaults if somehow missing
      return NextResponse.json({
        id: 1,
        post_frequency: 'daily',
        preferred_time: '14:00',
        timezone: 'America/New_York',
      });
    }

    return NextResponse.json(result.rows[0] as Settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PATCH /api/settings - Update settings
export async function PATCH(request: NextRequest) {
  try {
    await initDb();
    const body = await request.json();
    const { post_frequency, preferred_time, timezone } = body;

    const updates: string[] = [];
    const args: string[] = [];

    if (post_frequency !== undefined) {
      updates.push('post_frequency = ?');
      args.push(post_frequency);
    }
    if (preferred_time !== undefined) {
      updates.push('preferred_time = ?');
      args.push(preferred_time);
    }
    if (timezone !== undefined) {
      updates.push('timezone = ?');
      args.push(timezone);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await db.execute({
      sql: `UPDATE settings SET ${updates.join(', ')} WHERE id = 1`,
      args,
    });

    // Return updated settings
    const result = await db.execute('SELECT * FROM settings WHERE id = 1');
    return NextResponse.json(result.rows[0] as Settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
