import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

// POST /api/upload - Handle file upload
export async function POST(request: NextRequest) {
  try {
    // Check for blob token
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("BLOB_READ_WRITE_TOKEN not configured");
      return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Add unique timestamp to filename to prevent collisions
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const extension = file.name.split('.').pop() || 'jpg';
    const uniqueFilename = `${timestamp}-${randomId}.${extension}`;

    // Convert File to Buffer for Vercel Blob
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Vercel Blob
    const blob = await put(uniqueFilename, buffer, {
      access: "public",
      contentType: file.type,
    });

    return NextResponse.json({
      url: blob.url,
      uploadUrl: blob.url,
      publicUrl: blob.url,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
