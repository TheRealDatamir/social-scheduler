import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl } from '@/lib/r2';

// POST /api/upload - Get a presigned URL for uploading
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, contentType } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'filename and contentType are required' },
        { status: 400 }
      );
    }

    // Validate content type
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are allowed' },
        { status: 400 }
      );
    }

    const { uploadUrl, publicUrl } = await getPresignedUploadUrl(filename, contentType);

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
