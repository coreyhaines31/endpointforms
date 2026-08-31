/**
 * Times, in the two forms an inbox needs.
 *
 * "4 minutes ago" is what you want while watching submissions arrive; the exact
 * timestamp is what you want when a customer is on the phone disputing one. So
 * the relative form is the text and the absolute form is the `title` and the
 * `dateTime` — both always present, neither hidden behind an interaction.
 *
 * Rendered on the server. Every page under `/app` is `force-dynamic`, so there
 * is no cached "2 minutes ago" going stale in someone's CDN, and no hydration
 * mismatch from a clock that moved between render and paint.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(value: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - value.getTime();

  if (elapsed < 0) return absoluteTime(value);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} min ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (elapsed < 7 * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  return absoluteTime(value);
}

/** `31 Aug 2026, 14:22` — unambiguous in both hemispheres, unlike 08/31. */
export function absoluteTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}

export function RelativeTime({ value, className }: { value: Date; className?: string }) {
  return (
    <time dateTime={value.toISOString()} title={absoluteTime(value)} className={className}>
      {relativeTime(value)}
    </time>
  );
}

export function AbsoluteTime({ value, className }: { value: Date; className?: string }) {
  return (
    <time dateTime={value.toISOString()} className={className}>
      {absoluteTime(value)}
    </time>
  );
}
