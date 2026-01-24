import { NextRequest, NextResponse } from "next/server";

// Default settings (not persisted for now)
const defaultSettings = {
  post_frequency: "daily",
  preferred_time: "14:00",
  timezone: "America/New_York",
};

// GET /api/settings - Return default settings
export async function GET() {
  return NextResponse.json(defaultSettings);
}

// PATCH /api/settings - Accept updates (no-op for now, just return what was sent)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json({ ...defaultSettings, ...body });
  } catch {
    return NextResponse.json(defaultSettings);
  }
}
