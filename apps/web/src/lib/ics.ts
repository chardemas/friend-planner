export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  weekly?: boolean;
  until?: Date | null;
  /** Link back to the plan, added to the event notes. */
  url?: string;
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const rrule = (e: CalendarEvent) => (e.weekly ? `RRULE:FREQ=WEEKLY${e.until ? `;UNTIL=${utc(e.until)}` : ""}` : "");
const notes = (e: CalendarEvent) => [e.description, e.url && `On kiki: ${e.url}`].filter(Boolean).join("\n\n");

/** Opens Google Calendar's "new event" page, prefilled. */
export function googleCalendarUrl(e: CalendarEvent) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${utc(e.start)}/${utc(e.end)}` });
  if (notes(e)) q.set("details", notes(e));
  if (e.location) q.set("location", e.location);
  if (e.weekly) q.set("recur", rrule(e));
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Opens Outlook.com's compose-event page, prefilled. Outlook links can't carry a repeat rule. */
export function outlookCalendarUrl(e: CalendarEvent) {
  const q = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, startdt: e.start.toISOString(), enddt: e.end.toISOString() });
  if (notes(e)) q.set("body", notes(e));
  if (e.location) q.set("location", e.location);
  return `https://outlook.live.com/calendar/0/action/compose?${q}`;
}

/** Download a tiny .ics file: Apple Calendar (and most other apps) open it straight into "add event". */
export function downloadIcs(e: CalendarEvent) {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//lowkey//EN",
    "BEGIN:VEVENT",
    `UID:${e.id}@lowkey`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : "",
    notes(e) ? `DESCRIPTION:${esc(notes(e))}` : "",
    e.url ? `URL:${e.url}` : "",
    rrule(e),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[^\w]+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}
