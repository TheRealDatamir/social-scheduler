import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 client (S3-compatible)
// Set these in your .env.local:
// R2_ACCOUNT_ID=your-account-id
// R2_ACCESS_KEY_ID=your-access-key
// R2_SECRET_ACCESS_KEY=your-secret-key
// R2_BUCKET_NAME=social-scheduler
// R2_PUBLIC_URL=https://your-bucket.r2.dev (or custom domain)

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'social-scheduler';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

export async function uploadImage(
  file: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const key = `images/${Date.now()}-${filename}`;
  
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  );

  // Return public URL
  return `${PUBLIC_URL}/${key}`;
}

export async function deleteImage(imageUrl: string): Promise<void> {
  // Extract key from URL
  const key = imageUrl.replace(`${PUBLIC_URL}/`, '');
  
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );
}

export async function getPresignedUploadUrl(
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const key = `images/${Date.now()}-${filename}`;
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
  const publicUrl = `${PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl };
}
