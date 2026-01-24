import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

// POST /api/upload - Handle file upload
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Upload to Vercel Blob
    const blob = await put(file.name, file, {
      access: "public",
    });

    return NextResponse.json({
      url: blob.url,
      uploadUrl: blob.url, // For compatibility with existing frontend
      publicUrl: blob.url,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
