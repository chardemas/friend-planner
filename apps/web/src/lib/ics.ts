/** Build a tiny .ics file so a plan can go into Google/Apple Calendar. */
export function downloadIcs(p: {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  weekly?: boolean;
  until?: Date | null;
}) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//lowkey//EN",
    "BEGIN:VEVENT",
    `UID:${p.id}@lowkey`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(p.start)}`,
    `DTEND:${fmt(p.end)}`,
    `SUMMARY:${esc(p.title)}`,
    p.location ? `LOCATION:${esc(p.location)}` : "",
    p.description ? `DESCRIPTION:${esc(p.description)}` : "",
    p.weekly ? `RRULE:FREQ=WEEKLY${p.until ? `;UNTIL=${fmt(p.until)}` : ""}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${p.title.replace(/[^\w]+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(a.href);
}
