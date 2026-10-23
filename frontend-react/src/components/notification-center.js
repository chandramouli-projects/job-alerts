/* Notification bell logic: the icons and what happens when a note is opened.
   Ported from frontend/js/components/notification-center.js (the bell and panel are in NotificationCenter.jsx).
   The notes themselves come from services/notifications.js. */
import { S, refresh, saveUser } from "../core/state.js";
import { openJob, go } from "../core/nav.js";
import { findJob, searchParts, liveSearch } from "../services/job-store.js";
import { notesState } from "../services/notifications.js";
import { FILTERS_OFF } from "./saved-searches.js";
import { resetFilters } from "./filters.js";

export const NOTE_ICON = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  status:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5h6v2M9 13.5l2 2 4-4"/></svg>',
  jobs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  remind:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 2M9 3h6"/></svg>',
  tip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
};

/* The panel: S.noteOpen (shown), S.noteMode ("list" | "settings"), S.noteTab ("all" | "unread"),
   S.notePos ({ top, right } next to the bell on wide screens; null = bottom sheet on phones) */
export function openNotePanel() {
  S.noteMode = "list";
  S.noteTab = S.noteTab || "all";
  const b = document.getElementById("noteBell")?.getBoundingClientRect();
  S.notePos =
    b && innerWidth > 560
      ? {
          top: Math.round(b.bottom + 10) + "px",
          right: Math.max(12, Math.round(innerWidth - b.right - 8)) + "px",
        }
      : null;
  S.noteOpen = true;
  refresh();
  setTimeout(() => document.querySelector("#notePanel .np-item, #notePanel button")?.focus(), 0);
}
export function closeNotePanel() {
  if (!S.noteOpen) return;
  S.noteOpen = false;
  refresh();
  document.getElementById("noteBell")?.focus();
}

// "Today" / "Earlier" groups of the notes to show
export function noteGroups(items) {
  const today = new Date().setHours(0, 0, 0, 0);
  return [
    ["Today", items.filter(x => x.at >= today)],
    ["Earlier", items.filter(x => x.at < today)],
  ].filter(g => g[1].length);
}

/* Opening a note: mark it read, close the panel, then go where it points */
export function openNote(id) {
  const U = S.U,
    x = notesState().items.find(n => n.id === id);
  if (!x) return;
  x.read = true;
  saveUser();
  closeNotePanel();
  refresh();
  const to = x.to || {};
  if (to.job) {
    if (findJob(to.job) || U.jobs[to.job]?.snap) openJob(to.job);
    else go("mine");
    return;
  }
  if (to.search) {
    const s = (U.searches || []).find(v => v.id === to.search);
    if (s) {
      S.F = { ...FILTERS_OFF, ...s.f, forYou: false, days: 21 };
      s.seenAt = Date.now();
      saveUser();
      go("jobs");
      if (s.f.q) {
        const p = searchParts(s.f.q);
        liveSearch(p.what, p.where);
      }
      return;
    }
  }
  if (to.newest) {
    resetFilters();
    S.F.sort = "new";
    go("jobs");
    return;
  }
  go(to.view || "jobs");
}
export function readAllNotes() {
  notesState().items.forEach(x => (x.read = true));
  saveUser();
  refresh();
}
