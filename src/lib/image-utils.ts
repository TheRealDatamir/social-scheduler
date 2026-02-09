import sharp from 'sharp';
import { put, del } from '@vercel/blob';

const THUMBNAIL_SIZE = 200;
const THUMBNAIL_QUALITY = 70;

/**
 * Compress an image to a thumbnail after publishing.
 * Fetches the original, compresses it, uploads the thumbnail,
 * and deletes the original to save storage.
 * 
 * @param originalUrl - The Vercel Blob URL of the original image
 * @returns The new thumbnail URL, or null if compression failed
 */
export async function compressToThumbnail(originalUrl: string): Promise<string | null> {
  try {
    // 1. Fetch the original image
    const response = await fetch(originalUrl);
    if (!response.ok) {
      console.error(`Failed to fetch original image: ${response.status}`);
      return null;
    }
    
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // 2. Compress to thumbnail
    const thumbnail = await sharp(imageBuffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { 
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer();
    
    // 3. Upload thumbnail with new name
    const originalPath = new URL(originalUrl).pathname;
    const thumbnailPath = originalPath.replace(/\.[^.]+$/, '-thumb.jpg');
    
    const { url: thumbnailUrl } = await put(thumbnailPath, thumbnail, {
      access: 'public',
      contentType: 'image/jpeg',
    });
    
    // 4. Delete original
    await del(originalUrl);
    
    console.log(`Compressed image: ${(imageBuffer.length / 1024).toFixed(1)}KB → ${(thumbnail.length / 1024).toFixed(1)}KB`);
    
    return thumbnailUrl;
  } catch (error) {
    console.error('Failed to compress image:', error);
    return null;
  }
}
