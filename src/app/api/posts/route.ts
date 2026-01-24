import { NextRequest, NextResponse } from 'next/server';
import { db, initDb, Post } from '@/lib/db';

// GET /api/posts - List all posts
export async function GET() {
  try {
    await initDb();
    const result = await db.execute('SELECT * FROM posts ORDER BY scheduled_at ASC');
    return NextResponse.json(result.rows as Post[]);
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

// POST /api/posts - Create a new post
export async function POST(request: NextRequest) {
  try {
    await initDb();
    const body = await request.json();
    const { image_url, caption, scheduled_at, is_pinned } = body;

    if (!image_url || !scheduled_at) {
      return NextResponse.json(
        { error: 'image_url and scheduled_at are required' },
        { status: 400 }
      );
    }

    const result = await db.execute({
      sql: `INSERT INTO posts (image_url, caption, scheduled_at, is_pinned) 
            VALUES (?, ?, ?, ?)`,
      args: [image_url, caption || '', scheduled_at, is_pinned ? 1 : 0],
    });

    return NextResponse.json({ 
      id: Number(result.lastInsertRowid),
      message: 'Post created' 
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
