import { NextRequest, NextResponse } from 'next/server';
import { db, initDb, Post } from '@/lib/db';

// This endpoint is called by Vercel Cron to publish scheduled posts
// Configure in vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/publish",
//     "schedule": "*/15 * * * *"  // every 15 minutes
//   }]
// }

export async function GET(request: NextRequest) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initDb();
    const now = new Date().toISOString();

    // Get all scheduled posts that are due
    const result = await db.execute({
      sql: `SELECT * FROM posts 
            WHERE status = 'scheduled' 
            AND scheduled_at <= ? 
            ORDER BY scheduled_at ASC`,
      args: [now],
    });

    const postsToPublish = result.rows as Post[];
    const results: { id: number; status: string; error?: string }[] = [];

    for (const post of postsToPublish) {
      try {
        // TODO: Implement actual Instagram/Facebook publishing here
        // This would use the Meta Graph API to publish the post
        // For now, we'll just mark it as published
        
        // Example Instagram publishing flow:
        // 1. Create media container: POST /{ig-user-id}/media
        // 2. Publish: POST /{ig-user-id}/media_publish
        
        // Simulate publishing (replace with real implementation)
        console.log(`Publishing post ${post.id}: ${post.image_url}`);
        
        // Mark as published
        await db.execute({
          sql: `UPDATE posts 
                SET status = 'published', published_at = ? 
                WHERE id = ?`,
          args: [now, post.id],
        });

        results.push({ id: post.id, status: 'published' });
      } catch (error) {
        console.error(`Error publishing post ${post.id}:`, error);
        
        // Mark as failed
        await db.execute({
          sql: `UPDATE posts 
                SET status = 'failed', error_message = ? 
                WHERE id = ?`,
          args: [error instanceof Error ? error.message : 'Unknown error', post.id],
        });

        results.push({ 
          id: post.id, 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return NextResponse.json({
      message: `Processed ${postsToPublish.length} posts`,
      results,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
