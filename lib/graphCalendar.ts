// Operações no Outlook Calendar via Microsoft Graph.
// Cria, atualiza e exclui eventos. Lembrete dispara nativo no celular pelo Outlook/Apple Calendar.
import { msGetToken } from './msAuth';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export type GraphEventInput = {
  subject: string;
  start: string; // ISO 8601 com timezone, ex: 2026-05-20T09:00:00
  end: string;   // ISO 8601
  timeZone?: string; // ex: 'America/Sao_Paulo'
  body?: string;
  reminderMinutesBeforeStart?: number;
  isReminderOn?: boolean;
  categories?: string[];
};

function tzGuess() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

function buildBody(ev: GraphEventInput) {
  const tz = ev.timeZone || tzGuess();
  return {
    subject: ev.subject,
    body: ev.body ? { contentType: 'text', content: ev.body } : undefined,
    start: { dateTime: ev.start, timeZone: tz },
    end: { dateTime: ev.end, timeZone: tz },
    isReminderOn: ev.isReminderOn ?? true,
    reminderMinutesBeforeStart: ev.reminderMinutesBeforeStart ?? 15,
    categories: ev.categories,
  };
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const token = await msGetToken();
  if (!token) throw new Error('Sem token Microsoft.');
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function createCalendarEvent(ev: GraphEventInput): Promise<{ id: string }> {
  const data = await authedFetch('/me/events', {
    method: 'POST',
    body: JSON.stringify(buildBody(ev)),
  });
  return { id: data.id };
}

export async function updateCalendarEvent(id: string, ev: GraphEventInput): Promise<void> {
  await authedFetch(`/me/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(buildBody(ev)),
  });
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  await authedFetch(`/me/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
