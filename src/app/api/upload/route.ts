import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// POST /api/upload - Handle Vercel Blob client upload token generation
// The actual file upload goes directly from the browser to Vercel Blob,
// bypassing the serverless function body size limit entirely.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Instagram API limit is 8MB for images
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/heic",
            "image/heif",
          ],
          maximumSizeInBytes: 8 * 1024 * 1024, // 8MB — matches Instagram's limit
          addRandomSuffix: true, // Prevent duplicate filename errors
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Optional: could log or process after upload
        console.log("Upload completed:", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Upload failed:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
