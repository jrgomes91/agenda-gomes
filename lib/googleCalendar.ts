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
  colorId?: string; // 1-11
  location?: string;
  source?: { title: string; url: string };
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
  if (ev.colorId) body.colorId = ev.colorId;
  if (ev.location) body.location = ev.location;
  if (ev.source) body.source = ev.source;
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

export type RemoteEvent = {
  id: string;
  summary: string;
  description: string;
  start: string; // ISO local
  end: string;
  reminderMinutes: number | null;
  cancelled: boolean;
};

// Lista todos os eventos sincronizados pelo Agenda Gomes (filtra pelo marker na descricao).
// Inclui eventos cancelados (deletados) para podermos detectar exclusoes.
export async function listOurGoogleEvents(opts?: {
  timeMin?: string;
  timeMax?: string;
}): Promise<RemoteEvent[]> {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 90);
  const future = new Date(now);
  future.setFullYear(future.getFullYear() + 2);

  const params = new URLSearchParams({
    timeMin: opts?.timeMin ?? past.toISOString(),
    timeMax: opts?.timeMax ?? future.toISOString(),
    showDeleted: 'true',
    singleEvents: 'true',
    maxResults: '500',
    q: 'Sincronizado pelo Agenda Gomes',
  });

  const data = await authedFetch(`/calendars/primary/events?${params.toString()}`);
  const items = (data?.items ?? []) as any[];
  return items.map((ev) => {
    const reminderMin =
      ev.reminders?.overrides?.find((o: any) => o.method === 'popup')?.minutes ?? null;
    return {
      id: ev.id,
      summary: ev.summary ?? '',
      description: ev.description ?? '',
      start: ev.start?.dateTime ?? ev.start?.date ?? '',
      end: ev.end?.dateTime ?? ev.end?.date ?? '',
      reminderMinutes: reminderMin,
      cancelled: ev.status === 'cancelled',
    } as RemoteEvent;
  });
}
