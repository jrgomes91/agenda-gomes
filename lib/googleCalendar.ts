// Operações no Google Calendar via Calendar API v3.
import { googleGetToken } from './googleAuth';

const API = 'https://www.googleapis.com/calendar/v3';

export type GoogleEventInput = {
  summary: string;
  description?: string;
  start: string; // ISO 8601 local: 2026-05-20T09:00:00
  end: string;   // ISO 8601 local
  timeZone?: string;
  reminderMinutes?: number | null;
};

function tzGuess() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

function buildBody(ev: GoogleEventInput) {
  const tz = ev.timeZone || tzGuess();
  const body: any = {
    summary: ev.summary,
    description: ev.description,
    start: { dateTime: ev.start, timeZone: tz },
    end: { dateTime: ev.end, timeZone: tz },
  };
  if (ev.reminderMinutes && ev.reminderMinutes > 0) {
    body.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: ev.reminderMinutes }],
    };
  } else {
    body.reminders = { useDefault: false };
  }
  return body;
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const token = await googleGetToken();
  if (!token) throw new Error('Sem token Google.');
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function createGoogleEvent(ev: GoogleEventInput): Promise<{ id: string }> {
  const data = await authedFetch('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(buildBody(ev)),
  });
  return { id: data.id };
}

export async function updateGoogleEvent(id: string, ev: GoogleEventInput): Promise<void> {
  await authedFetch(`/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(buildBody(ev)),
  });
}

export async function deleteGoogleEvent(id: string): Promise<void> {
  await authedFetch(`/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
