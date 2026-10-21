"use client";

import { useEffect, useRef, useState } from "react";
import { downloadIcs, googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from "@/lib/ics";

/** "Add to calendar" button with a menu for Google, Apple, and Outlook. */
export function AddToCalendar({ event, compact }: { event: Omit<CalendarEvent, "url">; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const withUrl = (): CalendarEvent => ({ ...event, url: `${window.location.origin}/plans/${event.id}` });
  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-brand-soft";

  return (
    <div ref={ref} className={`relative ${compact ? "" : "w-full"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Add to calendar"
        className={compact ? "btn-ghost h-8 w-8 p-0 text-base" : "btn-ghost w-full"}
      >
        📅{!compact && " Add to calendar"}
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-40 mt-1.5 w-56 p-1.5">
          <a role="menuitem" className={item} href={googleCalendarUrl(withUrl())} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <GoogleIcon /> Google Calendar
          </a>
          <button role="menuitem" type="button" className={item} onClick={() => { downloadIcs(withUrl()); setOpen(false); }}>
            <span className="w-4 text-center">🍎</span> Apple Calendar
          </button>
          <a role="menuitem" className={item} href={outlookCalendarUrl(withUrl())} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[#0a64c8] text-[10px] font-bold text-white">O</span> Outlook
          </a>
          <button role="menuitem" type="button" className={`${item} font-normal text-muted`} onClick={() => { downloadIcs(withUrl()); setOpen(false); }}>
            <span className="w-4 text-center">⬇︎</span> Other (.ics file)
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.8-.7-4.3s.3-3 .7-4.3V14H4.5C3 17 2 20.4 2 24s1 7 2.5 10l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.8 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
    </svg>
  );
}
