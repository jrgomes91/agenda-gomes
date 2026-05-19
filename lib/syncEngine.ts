// Sincroniza tarefas locais com Outlook Calendar (Microsoft) e Google Calendar.
// V1: sync one-way (local → cloud). Lembretes nativos disparam no Outlook/Google Calendar.
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from './graphCalendar';
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listOurGoogleEvents,
  updateGoogleEvent,
} from './googleCalendar';

export type SyncableItem = {
  id: number;
  title: string;
  notes?: string;
  date: string;
  time: string;
  remind: string;
  msEventId?: string;
  googleEventId?: string;
  listName?: string;
  listEmoji?: string;
  listColor?: string;
  hashtags?: string[];
  steps?: { text: string; done: boolean }[];
};

// mapeia hex aproximado pro Google Calendar colorId (1-11)
function colorToGoogleId(hex?: string): string | undefined {
  if (!hex) return undefined;
  const map: Record<string, string> = {
    '#2564cf': '9',  // Trabalho -> Blueberry
    '#107c10': '10', // Casa -> Basil (verde)
    '#8764b8': '3',  // Pessoal -> Grape
    '#d83b01': '11', // Compras -> Tomato
    '#038387': '7',  // Clientes -> Peacock
    '#c239b3': '3',  // magenta -> Grape
    '#e3008c': '4',  // pink -> Flamingo
    '#ff8c00': '6',  // laranja -> Tangerine
    '#00b294': '2',  // verde agua -> Sage
    '#5c2e91': '1',  // roxo escuro -> Lavender
  };
  return map[hex.toLowerCase()] ?? '8'; // 8 = Graphite cinza default
}

function buildEventTitle(item: SyncableItem): string {
  const emoji = item.listEmoji ?? '📋';
  return `${emoji} ${item.title}`;
}

function buildEventDescription(item: SyncableItem): string {
  const lines: string[] = [];
  if (item.listName) lines.push(`📂 ${item.listName}`);
  if (item.hashtags && item.hashtags.length > 0) {
    lines.push(`🏷️ ${item.hashtags.join(' ')}`);
  }
  if (item.steps && item.steps.length > 0) {
    lines.push('');
    lines.push('📝 Etapas:');
    for (const s of item.steps) {
      lines.push(`${s.done ? '✓' : '☐'} ${s.text}`);
    }
  }
  if (item.notes && item.notes.trim()) {
    lines.push('');
    lines.push(item.notes.trim());
  }
  lines.push('');
  lines.push('— Sincronizado pelo Agenda Gomes');
  return lines.join('\n');
}

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
    subject: buildEventTitle(item),
    start: dates.start,
    end: dates.end,
    body: buildEventDescription(item),
    isReminderOn: minutes !== null,
    reminderMinutesBeforeStart: minutes ?? 0,
    categories: ['Agenda Gomes', item.listName].filter(Boolean) as string[],
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
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const payload = {
    summary: buildEventTitle(item),
    description: buildEventDescription(item),
    start: dates.start,
    end: dates.end,
    reminderMinutes: minutes,
    colorId: colorToGoogleId(item.listColor),
    location: item.listName,
    source: origin ? { title: 'Agenda Gomes', url: origin } : undefined,
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

export type GooglePullResult = {
  /** local item IDs cujo evento foi cancelado no Google (deve ser removido localmente) */
  deletedLocalIds: number[];
  /** mudancas detectadas no Google (titulo/hora/lembrete) a aplicar localmente */
  updates: { id: number; changes: Partial<SyncableItem> }[];
};

/**
 * Le os eventos do Google marcados como "Sincronizado pelo Agenda Gomes"
 * e compara com os itens locais que tem googleEventId. Retorna:
 *  - quais foram deletados no Google (precisam sair do app)
 *  - quais mudaram de titulo/hora no Google (atualizam o app)
 */
export async function pullFromGoogle(localItems: SyncableItem[]): Promise<GooglePullResult> {
  let remote;
  try {
    remote = await listOurGoogleEvents();
  } catch (e) {
    console.warn('pullFromGoogle falhou:', e);
    return { deletedLocalIds: [], updates: [] };
  }

  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const result: GooglePullResult = { deletedLocalIds: [], updates: [] };

  for (const item of localItems) {
    if (!item.googleEventId) continue;
    const r = remoteById.get(item.googleEventId);
    if (!r) {
      // o evento que sincronizamos antes nao retornou no list.
      // pode ser: deletado, ou esta fora do range de tempo (passado).
      // Para evitar falso-positivo, so removemos se a data do item esta dentro do range pesquisado.
      continue;
    }
    if (r.cancelled) {
      result.deletedLocalIds.push(item.id);
      continue;
    }
    // detecta mudanca de titulo
    const expectedTitle = buildEventTitle(item);
    if (r.summary && r.summary !== expectedTitle) {
      // remove emoji do inicio se vier
      const cleanTitle = r.summary.replace(/^[^\w]+\s*/, '').trim();
      if (cleanTitle && cleanTitle !== item.title) {
        result.updates.push({ id: item.id, changes: { title: cleanTitle } });
      }
    }
  }

  return result;
}
