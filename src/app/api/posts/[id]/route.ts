import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { deleteImage } from '@/lib/r2';

// GET /api/posts/[id] - Get a single post
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const { id } = await params;
    const result = await db.execute({
      sql: 'SELECT * FROM posts WHERE id = ?',
      args: [parseInt(id)],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching post:', error);
    return NextResponse.json({ error: 'Failed to fetch post' }, { status: 500 });
  }
}

// PATCH /api/posts/[id] - Update a post
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const { id } = await params;
    const body = await request.json();
    const { caption, scheduled_at, is_pinned, status } = body;

    const updates: string[] = [];
    const args: (string | number)[] = [];

    if (caption !== undefined) {
      updates.push('caption = ?');
      args.push(caption);
    }
    if (scheduled_at !== undefined) {
      updates.push('scheduled_at = ?');
      args.push(scheduled_at);
    }
    if (is_pinned !== undefined) {
      updates.push('is_pinned = ?');
      args.push(is_pinned ? 1 : 0);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      args.push(status);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    args.push(parseInt(id));
    await db.execute({
      sql: `UPDATE posts SET ${updates.join(', ')} WHERE id = ?`,
      args,
    });

    return NextResponse.json({ message: 'Post updated' });
  } catch (error) {
    console.error('Error updating post:', error);
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

// DELETE /api/posts/[id] - Delete a post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDb();
    const { id } = await params;

    // Get the post first to delete the image
    const result = await db.execute({
      sql: 'SELECT image_url FROM posts WHERE id = ?',
      args: [parseInt(id)],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Delete from R2 (best effort - don't fail if this fails)
    try {
      const imageUrl = result.rows[0].image_url as string;
      if (imageUrl && process.env.R2_PUBLIC_URL) {
        await deleteImage(imageUrl);
      }
    } catch (e) {
      console.error('Failed to delete image from R2:', e);
    }

    // Delete from database
    await db.execute({
      sql: 'DELETE FROM posts WHERE id = ?',
      args: [parseInt(id)],
    });

    return NextResponse.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
