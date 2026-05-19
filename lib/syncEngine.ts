// Sincroniza tarefas locais com Outlook Calendar (Microsoft) e Google Calendar.
// V1: sync one-way (local → cloud). Lembretes nativos disparam no Outlook/Google Calendar.
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from './graphCalendar';
import { createGoogleEvent, deleteGoogleEvent, updateGoogleEvent } from './googleCalendar';

export type SyncableItem = {
  id: number;
  title: string;
  notes?: string;
  date: string;
  time: string;
  remind: string;
  msEventId?: string;
  googleEventId?: string;
};

function reminderToMinutes(remind: string): number | null {
  if (!remind || remind === 'Sem lembrete') return null;
  if (remind.includes('15 min')) return 15;
  if (remind.includes('1 hora')) return 60;
  if (remind.includes('1 dia')) return 1440;
  return 15;
}

function parseLocalDate(value: string): Date | null {
  const norm = value.trim().toLowerCase();
  if (!norm || norm === 'sem data') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (norm === 'hoje') return today;
  if (norm === 'amanha' || norm === 'amanhã') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }
  const iso = norm.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const br = norm.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (br) {
    const year = br[3] ? Number(br[3].padStart(4, '20')) : today.getFullYear();
    return new Date(year, Number(br[2]) - 1, Number(br[1]));
  }
  return null;
}

function parseLocalTime(value: string): { hours: number; minutes: number } {
  if (!value || value === 'Sem hora') return { hours: 9, minutes: 0 };
  const m = value.match(/(\d{1,2})(?::|h)?(\d{2})?/);
  if (!m) return { hours: 9, minutes: 0 };
  return { hours: Number(m[1]), minutes: Number(m[2] ?? '00') };
}

function toIsoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  );
}

function buildEventDates(item: SyncableItem) {
  const date = parseLocalDate(item.date);
  if (!date) return null;
  const { hours, minutes } = parseLocalTime(item.time);
  const start = new Date(date);
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start);
  // duração default 30 min
  end.setMinutes(end.getMinutes() + 30);
  return { start: toIsoLocal(start), end: toIsoLocal(end) };
}

export async function syncItemToMicrosoft(item: SyncableItem): Promise<string | null> {
  const dates = buildEventDates(item);
  if (!dates) {
    if (item.msEventId) {
      try {
        await deleteCalendarEvent(item.msEventId);
      } catch (e) {
        console.warn('sync MS delete falhou:', e);
      }
    }
    return null;
  }

  const minutes = reminderToMinutes(item.remind);
  const payload = {
    subject: item.title,
    start: dates.start,
    end: dates.end,
    body: item.notes,
    isReminderOn: minutes !== null,
    reminderMinutesBeforeStart: minutes ?? 0,
    categories: ['Agenda Gomes'],
  };

  try {
    if (item.msEventId) {
      await updateCalendarEvent(item.msEventId, payload);
      return item.msEventId;
    }
    const result = await createCalendarEvent(payload);
    return result.id;
  } catch (e) {
    console.warn('sync MS falhou:', e);
    return item.msEventId ?? null;
  }
}

export async function deleteItemFromMicrosoft(item: SyncableItem): Promise<void> {
  if (!item.msEventId) return;
  try {
    await deleteCalendarEvent(item.msEventId);
  } catch (e) {
    console.warn('sync MS delete falhou:', e);
  }
}

export async function syncItemToGoogle(item: SyncableItem): Promise<string | null> {
  const dates = buildEventDates(item);
  if (!dates) {
    if (item.googleEventId) {
      try {
        await deleteGoogleEvent(item.googleEventId);
      } catch (e) {
        console.warn('sync Google delete falhou:', e);
      }
    }
    return null;
  }

  const minutes = reminderToMinutes(item.remind);
  const payload = {
    summary: item.title,
    description: item.notes,
    start: dates.start,
    end: dates.end,
    reminderMinutes: minutes,
  };

  try {
    if (item.googleEventId) {
      await updateGoogleEvent(item.googleEventId, payload);
      return item.googleEventId;
    }
    const result = await createGoogleEvent(payload);
    return result.id;
  } catch (e) {
    console.warn('sync Google falhou:', e);
    return item.googleEventId ?? null;
  }
}

export async function deleteItemFromGoogle(item: SyncableItem): Promise<void> {
  if (!item.googleEventId) return;
  try {
    await deleteGoogleEvent(item.googleEventId);
  } catch (e) {
    console.warn('sync Google delete falhou:', e);
  }
}
