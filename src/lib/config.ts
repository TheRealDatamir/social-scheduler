// ─── App Configuration ─────────────────────────────────────────────────────
// Single source of truth for app-wide settings

/**
 * The hour (0-23) when the daily cron runs and posts go out.
 * This should match the schedule in vercel.json: "0 20 * * *" = 20:00 UTC = 3 PM ET
 */
export const POSTING_HOUR: number = 15; // 3 PM in ET (local time)

/**
 * Timezone for display purposes
 */
export const TIMEZONE = "America/New_York";
export const TIMEZONE_ABBR = "ET";

/**
 * Format the posting time for display (e.g., "3:00 PM ET")
 */
export function getPostingTimeDisplay(): string {
  const hour = POSTING_HOUR;
  const period = hour >= 12 ? "PM" : "AM";
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}:00 ${period} ${TIMEZONE_ABBR}`;
}

/**
 * Check if the current time is past the daily posting time
 */
export function isPastPostingTime(): boolean {
  const now = new Date();
  return now.getHours() >= POSTING_HOUR;
}
