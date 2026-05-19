import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { ensureMsInitialized, getMsAccount, msSignIn, msSignOut } from './lib/msAuth';
import { getGoogleUserEmail, googleSignIn, googleSignOut } from './lib/googleAuth';
import {
  deleteItemFromGoogle,
  deleteItemFromMicrosoft,
  syncItemToGoogle,
  syncItemToMicrosoft,
} from './lib/syncEngine';
import { integrationsEnabled } from './lib/syncConfig';

type Step = { id: string; text: string; done: boolean };
type Attachment = { id: string; name: string; size?: number; dataUrl?: string };

type AgendaItem = {
  id: number;
  title: string;
  listId: string;
  date: string;
  time: string;
  remind: string;
  repeat: string;
  myDay: boolean;
  important: boolean;
  steps: Step[];
  attachments: Attachment[];
  notes: string;
  status: 'Pendente' | 'Confirmado' | 'Concluido';
  createdAt: number;
  msEventId?: string;
  googleEventId?: string;
};

type TaskList = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  groupId: string | null;
};

type ListGroup = {
  id: string;
  name: string;
  collapsed: boolean;
};

type SmartView =
  | 'Meu Dia'
  | 'Importante'
  | 'Planejado'
  | 'Atribuído a mim'
  | 'Tudo'
  | 'Concluído'
  | 'Agenda'
  | 'Escrever';
type CalendarView = 'Dia' | 'Semana' | 'Mes';
type SortMode = 'Manual' | 'Importância' | 'Prazo' | 'A-Z' | 'Criação';

const ITEMS_KEY = '@agenda-gomes/items';
const LISTS_KEY = '@agenda-gomes/lists';
const GROUPS_KEY = '@agenda-gomes/groups';
const THEME_KEY = '@agenda-gomes/theme';

const palette = [
  '#2564cf',
  '#107c10',
  '#8764b8',
  '#d83b01',
  '#038387',
  '#c239b3',
  '#e3008c',
  '#ff8c00',
  '#00b294',
  '#5c2e91',
];

const emojiOptions = [
  '📋',
  '💼',
  '🏠',
  '👤',
  '🛒',
  '🤝',
  '⭐',
  '🎯',
  '📚',
  '🎨',
  '✈️',
  '🍎',
  '💡',
  '🏋️',
  '🎵',
  '🐾',
];

const defaultLists: TaskList[] = [
  { id: 'trabalho', name: 'Trabalho', emoji: '💼', color: palette[0], groupId: null },
  { id: 'casa', name: 'Casa', emoji: '🏠', color: palette[1], groupId: null },
  { id: 'pessoal', name: 'Pessoal', emoji: '👤', color: palette[2], groupId: null },
  { id: 'compras', name: 'Compras', emoji: '🛒', color: palette[3], groupId: null },
  { id: 'clientes', name: 'Clientes', emoji: '🤝', color: palette[4], groupId: null },
];

const remindOptions = ['Sem lembrete', '15 min antes', '1 hora antes', '1 dia antes'];
const repeatOptions = ['Nunca', 'Diariamente', 'Dias da semana', 'Semanalmente', 'Mensalmente', 'Anualmente'];
const weekdayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

const initialItems: AgendaItem[] = [
  {
    id: 1,
    title: 'Manutencao piscina Carlos #cliente',
    listId: 'trabalho',
    date: 'Hoje',
    time: '09:00',
    remind: '1 hora antes',
    repeat: 'Mensalmente',
    myDay: true,
    important: true,
    steps: [
      { id: 's1', text: 'Levar cloro', done: true },
      { id: 's2', text: 'Medir PH', done: false },
      { id: 's3', text: 'Fotografar a placa', done: false },
    ],
    attachments: [],
    notes: 'Levar cloro, medir PH e fotografar a placa.',
    status: 'Confirmado',
    createdAt: Date.now() - 86400000,
  },
  {
    id: 2,
    title: 'Comprar material da semana #urgente',
    listId: 'compras',
    date: 'Amanha',
    time: '16:30',
    remind: '15 min antes',
    repeat: 'Nunca',
    myDay: false,
    important: false,
    steps: [
      { id: 's4', text: 'Conferir estoque', done: false },
      { id: 's5', text: 'Comprar itens prioritarios', done: false },
    ],
    attachments: [],
    notes: 'Separar itens por prioridade.',
    status: 'Pendente',
    createdAt: Date.now() - 3600000,
  },
];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateLong(date: Date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseItemDate(value: string) {
  const normalized = value.trim().toLowerCase();
  const today = startOfDay(new Date());

  if (!normalized || normalized === 'sem data') return null;
  if (normalized === 'hoje') return today;
  if (normalized === 'amanha' || normalized === 'amanhã') return addDays(today, 1);

  const brMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (brMatch) {
    const year = brMatch[3] ? Number(brMatch[3].padStart(4, '20')) : today.getFullYear();
    return new Date(year, Number(brMatch[2]) - 1, Number(brMatch[1]));
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const targetWeekday = weekdayNames.findIndex((day) => normalized.includes(day));
  if (targetWeekday >= 0) {
    const diff = (targetWeekday - today.getDay() + 7) % 7 || 7;
    return addDays(today, diff);
  }

  return null;
}

function parseItemTime(value: string) {
  const match = value.match(/(\d{1,2})(?::|h)?(\d{2})?/);
  if (!match || value === 'Sem hora') return { hours: 9, minutes: 0 };
  return { hours: Number(match[1]), minutes: Number(match[2] ?? '00') };
}

function getDueDateTime(item: AgendaItem) {
  const date = parseItemDate(item.date);
  if (!date) return null;
  const { hours, minutes } = parseItemTime(item.time);
  const due = new Date(date);
  due.setHours(hours, minutes, 0, 0);
  return due;
}

function getReminderDateTime(item: AgendaItem) {
  const due = getDueDateTime(item);
  if (!due || item.remind === 'Sem lembrete') return null;
  const reminder = new Date(due);
  if (item.remind === '15 min antes') reminder.setMinutes(reminder.getMinutes() - 15);
  if (item.remind === '1 hora antes') reminder.setHours(reminder.getHours() - 1);
  if (item.remind === '1 dia antes') reminder.setDate(reminder.getDate() - 1);
  return reminder;
}

function occurrenceMatches(item: AgendaItem, date: Date) {
  const base = parseItemDate(item.date);
  const day = startOfDay(date);
  if (!base || day < base) return false;
  if (item.repeat === 'Nunca') return sameDay(base, day);
  if (item.repeat === 'Diariamente') return true;
  if (item.repeat === 'Dias da semana') return day.getDay() >= 1 && day.getDay() <= 5;
  if (item.repeat === 'Semanalmente') return day.getDay() === base.getDay();
  if (item.repeat === 'Mensalmente') return day.getDate() === base.getDate();
  if (item.repeat === 'Anualmente') {
    return day.getDate() === base.getDate() && day.getMonth() === base.getMonth();
  }
  return sameDay(base, day);
}

function getCalendarDays(view: CalendarView) {
  const today = startOfDay(new Date());
  const total = view === 'Dia' ? 1 : view === 'Semana' ? 7 : 30;
  return Array.from({ length: total }, (_, index) => addDays(today, index));
}

function extractHashtags(item: AgendaItem) {
  const source = `${item.title} ${item.notes}`;
  const matches = source.match(/#[\wÀ-ÿ-]+/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((tag) => tag.toLowerCase())));
}

function sortItems(items: AgendaItem[], mode: SortMode) {
  const copy = [...items];
  if (mode === 'Manual') {
    return copy.sort((a, b) => b.createdAt - a.createdAt);
  }
  if (mode === 'Importância') {
    return copy.sort((a, b) => {
      const ai = a.important ? 0 : 1;
      const bi = b.important ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const am = a.myDay ? 0 : 1;
      const bm = b.myDay ? 0 : 1;
      if (am !== bm) return am - bm;
      return (getDueDateTime(a)?.getTime() ?? Infinity) - (getDueDateTime(b)?.getTime() ?? Infinity);
    });
  }
  if (mode === 'Prazo') {
    return copy.sort(
      (a, b) => (getDueDateTime(a)?.getTime() ?? Infinity) - (getDueDateTime(b)?.getTime() ?? Infinity)
    );
  }
  if (mode === 'A-Z') {
    return copy.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  }
  if (mode === 'Criação') {
    return copy.sort((a, b) => a.createdAt - b.createdAt);
  }
  return copy;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type Colors = {
  appBg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentSoft: string;
  danger: string;
  star: string;
  topBar: string;
  topBarText: string;
  topBarSub: string;
  sidebarBg: string;
};

const lightColors: Colors = {
  appBg: '#f3f2f1',
  surface: '#ffffff',
  surfaceAlt: '#faf9f8',
  border: '#e1dfdd',
  borderStrong: '#c8c6c4',
  text: '#201f1e',
  textMuted: '#605e5c',
  textInverse: '#ffffff',
  accent: '#2564cf',
  accentSoft: '#eff6ff',
  danger: '#d13438',
  star: '#f7c948',
  topBar: '#2564cf',
  topBarText: '#ffffff',
  topBarSub: '#dce9ff',
  sidebarBg: '#ffffff',
};

const darkColors: Colors = {
  appBg: '#1f1f1f',
  surface: '#2b2b2b',
  surfaceAlt: '#252525',
  border: '#3d3d3d',
  borderStrong: '#525252',
  text: '#f3f2f1',
  textMuted: '#a6a6a6',
  textInverse: '#ffffff',
  accent: '#3b82f6',
  accentSoft: '#1e3a5f',
  danger: '#ef6b6e',
  star: '#f7c948',
  topBar: '#1a1a1a',
  topBarText: '#ffffff',
  topBarSub: '#a6a6a6',
  sidebarBg: '#262626',
};

function migrateItems(raw: any[]): AgendaItem[] {
  return raw.map((it: any, idx: number) => {
    const listId =
      it.listId ||
      defaultLists.find((l) => l.name.toLowerCase() === String(it.list ?? '').toLowerCase())?.id ||
      defaultLists[0].id;
    const steps: Step[] = Array.isArray(it.steps)
      ? it.steps.map((s: any, i: number) =>
          typeof s === 'string'
            ? { id: `s-${idx}-${i}`, text: s, done: false }
            : { id: s.id ?? `s-${idx}-${i}`, text: s.text ?? '', done: !!s.done }
        )
      : [];
    const attachments: Attachment[] = Array.isArray(it.attachments)
      ? it.attachments.map((a: any, i: number) =>
          typeof a === 'string'
            ? { id: `a-${idx}-${i}`, name: a }
            : { id: a.id ?? `a-${idx}-${i}`, name: a.name ?? 'arquivo', size: a.size, dataUrl: a.dataUrl }
        )
      : [];
    return {
      id: it.id ?? Date.now() + idx,
      title: it.title ?? 'Sem título',
      listId,
      date: it.date ?? 'Sem data',
      time: it.time ?? 'Sem hora',
      remind: it.remind ?? 'Sem lembrete',
      repeat: it.repeat ?? 'Nunca',
      myDay: !!it.myDay,
      important: !!it.important || it.status === 'Confirmado',
      steps,
      attachments,
      notes: it.notes ?? '',
      status: it.status ?? 'Pendente',
      createdAt: it.createdAt ?? Date.now() - idx * 1000,
    };
  });
}

export default function App() {
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const isPhone = width < 560;

  const [mode, setMode] = useState<SmartView | { kind: 'list'; id: string }>('Meu Dia');
  const [calendarView, setCalendarView] = useState<CalendarView>('Dia');
  const [items, setItems] = useState<AgendaItem[]>(initialItems);
  const [lists, setLists] = useState<TaskList[]>(defaultLists);
  const [groups, setGroups] = useState<ListGroup[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('Manual');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [showListDialog, setShowListDialog] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [inkText, setInkText] = useState(
    'Trabalho\nManutencao piscina Joao\nsegunda 14:30\nlembre-me 1 dia antes\nrepetir mensalmente\nadicionar ao meu dia'
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAttachItemId = useRef<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [backupMessage, setBackupMessage] = useState('');
  const [msEmail, setMsEmail] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const prevItemsRef = useRef<AgendaItem[]>([]);

  const colors = theme === 'dark' ? darkColors : lightColors;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    async function load() {
      try {
        const [savedItems, savedLists, savedGroups, savedTheme] = await Promise.all([
          AsyncStorage.getItem(ITEMS_KEY),
          AsyncStorage.getItem(LISTS_KEY),
          AsyncStorage.getItem(GROUPS_KEY),
          AsyncStorage.getItem(THEME_KEY),
        ]);
        if (savedLists) {
          const parsed = JSON.parse(savedLists);
          if (Array.isArray(parsed) && parsed.length) setLists(parsed);
        }
        if (savedGroups) {
          const parsed = JSON.parse(savedGroups);
          if (Array.isArray(parsed)) setGroups(parsed);
        }
        if (savedItems) {
          const parsed = JSON.parse(savedItems);
          if (Array.isArray(parsed)) setItems(migrateItems(parsed));
        }
        if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(items)).catch(() => undefined);
  }, [items, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(LISTS_KEY, JSON.stringify(lists)).catch(() => undefined);
  }, [lists, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(GROUPS_KEY, JSON.stringify(groups)).catch(() => undefined);
  }, [groups, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(THEME_KEY, theme).catch(() => undefined);
  }, [theme, loaded]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const win: any = typeof window !== 'undefined' ? window : null;
    if (!win) return undefined;
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    win.addEventListener('beforeinstallprompt', handler);
    return () => win.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (integrationsEnabled.microsoft()) {
      ensureMsInitialized().then(() => {
        const acc = getMsAccount();
        setMsEmail(acc?.username ?? null);
      });
    }
    if (integrationsEnabled.google()) {
      setGoogleEmail(getGoogleUserEmail());
    }
  }, []);

  useEffect(() => {
    if (!loaded) {
      prevItemsRef.current = items;
      return;
    }
    const msActive = !!msEmail && integrationsEnabled.microsoft();
    const googleActive = !!googleEmail && integrationsEnabled.google();
    if (!msActive && !googleActive) {
      prevItemsRef.current = items;
      return;
    }
    const prev = prevItemsRef.current;
    const prevById = new Map(prev.map((it) => [it.id, it]));
    const currentIds = new Set(items.map((it) => it.id));

    const created: AgendaItem[] = [];
    const updated: AgendaItem[] = [];
    for (const it of items) {
      const before = prevById.get(it.id);
      if (!before) {
        created.push(it);
        continue;
      }
      if (
        before.title !== it.title ||
        before.date !== it.date ||
        before.time !== it.time ||
        before.remind !== it.remind ||
        before.notes !== it.notes
      ) {
        updated.push(it);
      }
    }
    const deleted = prev.filter((it) => !currentIds.has(it.id));

    const work = [...created, ...updated];
    if (work.length === 0 && deleted.length === 0) {
      prevItemsRef.current = items;
      return;
    }

    setSyncBusy(true);
    (async () => {
      for (const it of work) {
        if (msActive) {
          const newId = await syncItemToMicrosoft(it);
          if (newId && newId !== it.msEventId) {
            setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, msEventId: newId } : x)));
          }
        }
        if (googleActive) {
          const newId = await syncItemToGoogle(it);
          if (newId && newId !== it.googleEventId) {
            setItems((cur) =>
              cur.map((x) => (x.id === it.id ? { ...x, googleEventId: newId } : x))
            );
          }
        }
      }
      for (const it of deleted) {
        if (msActive) await deleteItemFromMicrosoft(it);
        if (googleActive) await deleteItemFromGoogle(it);
      }
      setSyncBusy(false);
    })();
    prevItemsRef.current = items;
  }, [items, loaded, msEmail, googleEmail]);

  useEffect(() => {
    const notificationApi = typeof globalThis !== 'undefined' ? globalThis.Notification : undefined;
    if (!notificationApi || notificationApi.permission !== 'granted') return undefined;

    const timers = items
      .map((item) => {
        const reminder = getReminderDateTime(item);
        if (!reminder) return null;
        const delay = reminder.getTime() - Date.now();
        if (delay <= 0 || delay > 2147483647) return null;
        return setTimeout(() => {
          new notificationApi('Agenda Gomes', {
            body: `${item.title} • ${item.date} ${item.time}`,
          });
        }, delay);
      })
      .filter((timer): timer is ReturnType<typeof setTimeout> => Boolean(timer));

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [items]);

  const currentListId = typeof mode === 'object' ? mode.id : null;
  const currentList = lists.find((l) => l.id === currentListId) ?? null;

  const searchTerm = search.trim().toLowerCase();
  const hashtagTerm = searchTerm.startsWith('#') ? searchTerm : null;

  const matchSearch = (item: AgendaItem) => {
    if (!searchTerm) return true;
    if (hashtagTerm) {
      return extractHashtags(item).some((tag) => tag === hashtagTerm || tag.startsWith(hashtagTerm));
    }
    const list = lists.find((l) => l.id === item.listId)?.name ?? '';
    return (
      item.title.toLowerCase().includes(searchTerm) ||
      item.notes.toLowerCase().includes(searchTerm) ||
      list.toLowerCase().includes(searchTerm) ||
      item.steps.some((s) => s.text.toLowerCase().includes(searchTerm))
    );
  };

  const today = startOfDay(new Date());

  const baseFiltered = useMemo(() => {
    let filtered = items.filter(matchSearch);
    if (mode === 'Meu Dia') filtered = filtered.filter((i) => i.myDay);
    else if (mode === 'Importante') filtered = filtered.filter((i) => i.important);
    else if (mode === 'Planejado') filtered = filtered.filter((i) => parseItemDate(i.date));
    else if (mode === 'Concluído') filtered = filtered.filter((i) => i.status === 'Concluido');
    else if (mode === 'Atribuído a mim') filtered = filtered.filter((i) => i.important && i.myDay);
    else if (typeof mode === 'object') filtered = filtered.filter((i) => i.listId === mode.id);
    return filtered;
  }, [items, mode, searchTerm, lists]);

  const sortedItems = useMemo(() => sortItems(baseFiltered, sortMode), [baseFiltered, sortMode]);
  const pendingItems = sortedItems.filter((i) => i.status !== 'Concluido');
  const completedItems = sortedItems.filter((i) => i.status === 'Concluido');

  const myDaySuggestions = useMemo(() => {
    if (mode !== 'Meu Dia') return [] as AgendaItem[];
    return items.filter((i) => {
      if (i.myDay || i.status === 'Concluido') return false;
      const due = parseItemDate(i.date);
      if (!due) return false;
      return due <= today;
    });
  }, [items, mode, today.getTime()]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  const screenTitle = (() => {
    if (typeof mode === 'object') return currentList?.name ?? 'Lista';
    if (mode === 'Escrever') return 'Entrada por caneta';
    return mode;
  })();

  const screenAccent = (() => {
    if (typeof mode === 'object') return currentList?.color ?? colors.accent;
    return colors.accent;
  })();

  async function enableReminders() {
    const notificationApi = typeof globalThis !== 'undefined' ? globalThis.Notification : undefined;
    if (!notificationApi) return;
    if (notificationApi.permission === 'default') {
      await notificationApi.requestPermission();
    }
  }

  function addQuickTask() {
    const titleValue = quickTitle.trim();
    if (!titleValue) return;

    let listId = currentListId ?? lists[0]?.id ?? 'trabalho';
    let myDay = mode === 'Meu Dia';
    let important = mode === 'Importante';

    const newItem: AgendaItem = {
      id: Date.now(),
      title: titleValue,
      listId,
      date: mode === 'Meu Dia' ? 'Hoje' : 'Sem data',
      time: 'Sem hora',
      remind: 'Sem lembrete',
      repeat: 'Nunca',
      myDay,
      important,
      notes: '',
      status: 'Pendente',
      steps: [],
      attachments: [],
      createdAt: Date.now(),
    };

    setItems((current) => [newItem, ...current]);
    setSelectedItemId(newItem.id);
    setQuickTitle('');
  }

  function createFromPenText() {
    const lines = inkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const list = lists.find((item) =>
      lines.some((line) => line.toLowerCase() === item.name.toLowerCase())
    );
    const timeLine = lines.find((line) => /\b\d{1,2}[:h]\d{0,2}\b/i.test(line));
    const repeatLine = lines.find((line) => line.toLowerCase().includes('repetir'));
    const remindLine = lines.find((line) => line.toLowerCase().includes('lembre'));
    const myDay = lines.some((line) => line.toLowerCase().includes('meu dia'));
    const titleLine =
      lines.find(
        (line) =>
          line !== list?.name &&
          line !== timeLine &&
          line !== repeatLine &&
          line !== remindLine &&
          !line.toLowerCase().includes('meu dia')
      ) ?? 'Novo compromisso';

    const newItem: AgendaItem = {
      id: Date.now(),
      title: titleLine,
      listId: list?.id ?? lists[0]?.id ?? 'trabalho',
      date: timeLine?.replace(/\b\d{1,2}[:h]\d{0,2}\b/i, '').trim() || 'Hoje',
      time: timeLine?.match(/\b\d{1,2}[:h]\d{0,2}\b/i)?.[0].replace('h', ':') || 'Sem hora',
      remind: remindLine?.replace(/lembre-me/gi, '').trim() || 'Sem lembrete',
      repeat: repeatLine?.replace(/repetir/gi, '').trim() || 'Nunca',
      myDay,
      important: false,
      notes: lines
        .filter((line) => ![list?.name, titleLine, timeLine, repeatLine, remindLine].includes(line))
        .filter((line) => !line.toLowerCase().includes('meu dia'))
        .join('\n'),
      status: 'Pendente',
      steps: lines
        .filter((line) => line.startsWith('-') || line.toLowerCase().startsWith('etapa'))
        .map((line, i) => ({
          id: `pen-${i}`,
          text: line.replace(/^-\s*/, '').replace(/^etapa[:\s-]*/i, ''),
          done: false,
        })),
      attachments: [],
      createdAt: Date.now(),
    };

    setItems((current) => [newItem, ...current]);
    setSelectedItemId(newItem.id);
    setMode('Meu Dia');
  }

  function updateItem(id: number, changes: Partial<AgendaItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function deleteItem(id: number) {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedItemId(null);
  }

  function toggleMyDay(id: number) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, myDay: !item.myDay } : item)));
  }

  function toggleImportant(id: number) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, important: !item.important } : item))
    );
  }

  function toggleComplete(id: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: item.status === 'Concluido' ? 'Pendente' : 'Concluido' }
          : item
      )
    );
  }

  function addListToMyDay(id: number) {
    updateItem(id, { myDay: true });
  }

  function createList(name: string, groupId: string | null = null) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${uid()}`;
    const color = palette[lists.length % palette.length];
    const newList: TaskList = { id, name: trimmed, emoji: '📋', color, groupId };
    setLists((current) => [...current, newList]);
    setMode({ kind: 'list', id });
    setShowListDialog(false);
    setNewListName('');
  }

  function updateList(id: string, changes: Partial<TaskList>) {
    setLists((current) => current.map((l) => (l.id === id ? { ...l, ...changes } : l)));
  }

  function deleteList(id: string) {
    if (lists.length <= 1) return;
    const fallback = lists.find((l) => l.id !== id)?.id ?? 'trabalho';
    setItems((current) => current.map((i) => (i.listId === id ? { ...i, listId: fallback } : i)));
    setLists((current) => current.filter((l) => l.id !== id));
    if (typeof mode === 'object' && mode.id === id) setMode('Tudo');
  }

  function createGroup(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newGroup: ListGroup = { id: `g-${uid()}`, name: trimmed, collapsed: false };
    setGroups((current) => [...current, newGroup]);
    setShowGroupDialog(false);
    setNewGroupName('');
  }

  function toggleGroup(id: string) {
    setGroups((current) =>
      current.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g))
    );
  }

  function deleteGroup(id: string) {
    setLists((current) => current.map((l) => (l.groupId === id ? { ...l, groupId: null } : l)));
    setGroups((current) => current.filter((g) => g.id !== id));
  }

  function pickAttachment(itemId: number) {
    if (Platform.OS !== 'web') return;
    pendingAttachItemId.current = itemId;
    fileInputRef.current?.click();
  }

  function handleFileChosen(file: File) {
    const itemId = pendingAttachItemId.current;
    if (!itemId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : undefined;
      setItems((current) =>
        current.map((it) =>
          it.id === itemId
            ? {
                ...it,
                attachments: [
                  ...it.attachments,
                  { id: uid(), name: file.name, size: file.size, dataUrl },
                ],
              }
            : it
        )
      );
    };
    reader.readAsDataURL(file);
  }

  async function triggerInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    try {
      await installPrompt.userChoice;
    } catch {
      // ignore
    }
    setInstallPrompt(null);
  }

  function exportBackup() {
    if (Platform.OS !== 'web') return;
    const payload = {
      schema: 'agenda-gomes/v1',
      exportedAt: new Date().toISOString(),
      items,
      lists,
      groups,
      theme,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a: any = (typeof document !== 'undefined' ? document.createElement('a') : null);
    if (!a) return;
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `agenda-gomes-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupMessage('Backup exportado.');
    setTimeout(() => setBackupMessage(''), 3000);
  }

  function pickBackupFile() {
    if (Platform.OS !== 'web') return;
    backupInputRef.current?.click();
  }

  function handleBackupFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const data = JSON.parse(text);
        if (!data || data.schema !== 'agenda-gomes/v1') {
          setBackupMessage('Arquivo inválido.');
          setTimeout(() => setBackupMessage(''), 3000);
          return;
        }
        const mergedLists: TaskList[] = Array.isArray(data.lists)
          ? [
              ...lists,
              ...data.lists.filter((l: TaskList) => !lists.some((x) => x.id === l.id)),
            ]
          : lists;
        const mergedGroups: ListGroup[] = Array.isArray(data.groups)
          ? [
              ...groups,
              ...data.groups.filter((g: ListGroup) => !groups.some((x) => x.id === g.id)),
            ]
          : groups;
        const incomingItems: AgendaItem[] = Array.isArray(data.items) ? migrateItems(data.items) : [];
        const mergedItems: AgendaItem[] = [
          ...items,
          ...incomingItems.filter((it) => !items.some((x) => x.id === it.id)),
        ];
        setLists(mergedLists);
        setGroups(mergedGroups);
        setItems(mergedItems);
        setBackupMessage(`Importado: ${incomingItems.length} tarefas.`);
        setTimeout(() => setBackupMessage(''), 4000);
      } catch (err) {
        setBackupMessage('Falha ao ler arquivo.');
        setTimeout(() => setBackupMessage(''), 3000);
      }
    };
    reader.readAsText(file);
  }

  const isAgenda = mode === 'Agenda';
  const isInk = mode === 'Escrever';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {Platform.OS === 'web' && (
        <>
          {/* @ts-ignore web-only */}
          <input
            ref={(el: any) => (fileInputRef.current = el)}
            type="file"
            style={{ display: 'none' }}
            onChange={(e: any) => {
              const file = e.target?.files?.[0];
              if (file) handleFileChosen(file);
              if (e.target) e.target.value = '';
            }}
          />
          {/* @ts-ignore web-only */}
          <input
            ref={(el: any) => (backupInputRef.current = el)}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e: any) => {
              const file = e.target?.files?.[0];
              if (file) handleBackupFile(file);
              if (e.target) e.target.value = '';
            }}
          />
        </>
      )}
      <View style={[styles.app, !isWide && styles.appStack]}>
        {isWide ? (
          <Sidebar
            mode={mode}
            setMode={setMode}
            lists={lists}
            groups={groups}
            items={items}
            theme={theme}
            setTheme={setTheme}
            onAddList={() => setShowListDialog(true)}
            onAddGroup={() => setShowGroupDialog(true)}
            onToggleGroup={toggleGroup}
            onDeleteGroup={deleteGroup}
            onEditList={setEditingListId}
            onDeleteList={deleteList}
            colors={colors}
            styles={styles}
          />
        ) : (
          <MobileNav
            mode={mode}
            setMode={setMode}
            lists={lists}
            items={items}
            colors={colors}
            styles={styles}
          />
        )}

        <View style={styles.main}>
          <View style={[styles.topBar, { backgroundColor: screenAccent }, isPhone && styles.topBarStack]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.appName}>Agenda Gomes</Text>
              <Text style={styles.screenTitle}>{screenTitle}</Text>
              <Text style={styles.screenSub}>
                {isInk
                  ? 'Escreva livre com a S Pen e organize nos campos.'
                  : `${pendingItems.length} pendentes • ${completedItems.length} concluídas`}
              </Text>
            </View>
            <View style={[styles.topActions, isPhone && { marginTop: 8 }]}>
              {installPrompt && (
                <Pressable onPress={triggerInstall} style={styles.penButton}>
                  <Text style={styles.penButtonText}>📲 Instalar</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                style={styles.penButton}
              >
                <Text style={styles.penButtonText}>{theme === 'dark' ? '☀️ Claro' : '🌙 Escuro'}</Text>
              </Pressable>
              <Pressable onPress={() => setMode('Escrever')} style={styles.penButton}>
                <Text style={styles.penButtonText}>✒️ Caneta</Text>
              </Pressable>
              <Pressable onPress={enableReminders} style={styles.penButton}>
                <Text style={styles.penButtonText}>🔔 Lembretes</Text>
              </Pressable>
              {Platform.OS === 'web' && (
                <>
                  <Pressable onPress={exportBackup} style={styles.penButton}>
                    <Text style={styles.penButtonText}>📤 Exportar</Text>
                  </Pressable>
                  <Pressable onPress={pickBackupFile} style={styles.penButton}>
                    <Text style={styles.penButtonText}>📥 Importar</Text>
                  </Pressable>
                  {integrationsEnabled.microsoft() && (
                    msEmail ? (
                      <Pressable
                        onPress={() => msSignOut().then(() => setMsEmail(null))}
                        style={styles.penButton}
                      >
                        <Text style={styles.penButtonText}>
                          {syncBusy ? '⏳' : '✓'} MS: {msEmail.split('@')[0]}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => msSignIn()} style={styles.penButton}>
                        <Text style={styles.penButtonText}>🔗 Conectar Microsoft</Text>
                      </Pressable>
                    )
                  )}
                  {integrationsEnabled.google() && (
                    googleEmail ? (
                      <Pressable
                        onPress={() => {
                          googleSignOut();
                          setGoogleEmail(null);
                        }}
                        style={styles.penButton}
                      >
                        <Text style={styles.penButtonText}>
                          {syncBusy ? '⏳' : '✓'} G: {googleEmail.split('@')[0]}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => {
                          googleSignIn()
                            .then(() => setGoogleEmail(getGoogleUserEmail()))
                            .catch((e) => {
                              setBackupMessage('Login Google falhou: ' + (e?.message ?? ''));
                              setTimeout(() => setBackupMessage(''), 4000);
                            });
                        }}
                        style={styles.penButton}
                      >
                        <Text style={styles.penButtonText}>🔗 Conectar Google</Text>
                      </Pressable>
                    )
                  )}
                </>
              )}
            </View>
          </View>

          {!!backupMessage && (
            <View style={styles.backupBanner}>
              <Text style={styles.backupBannerText}>{backupMessage}</Text>
            </View>
          )}

          {!isInk && (
            <View style={styles.toolbar}>
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar tarefas, #hashtags, listas..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                />
              </View>
              <View style={styles.toolbarRight}>
                <SortMenu sortMode={sortMode} setSortMode={setSortMode} colors={colors} styles={styles} />
              </View>
            </View>
          )}

          <View style={[styles.workArea, isWide && selectedItem && styles.workAreaWide]}>
            {isInk ? (
              <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.penPanel}>
                  <View style={styles.panelHeader}>
                    <Text style={styles.panelTitle}>Anotação inteligente</Text>
                    <Pressable onPress={createFromPenText} style={styles.addButtonSolid}>
                      <Text style={styles.addButtonSolidText}>Organizar</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    multiline
                    value={inkText}
                    onChangeText={setInkText}
                    placeholder="Ex: Trabalho, cliente, segunda 14:30, lembre-me, repetir..."
                    placeholderTextColor={colors.textMuted}
                    style={styles.penInput}
                    textAlignVertical="top"
                  />
                </View>
              </ScrollView>
            ) : isAgenda ? (
              <ScrollView contentContainerStyle={styles.content}>
                <AgendaBoard
                  view={calendarView}
                  setView={setCalendarView}
                  items={items.filter(matchSearch)}
                  lists={lists}
                  selectedItemId={selectedItemId}
                  onOpen={setSelectedItemId}
                  onToggleComplete={toggleComplete}
                  onToggleImportant={toggleImportant}
                  colors={colors}
                  styles={styles}
                />
                {!isWide && selectedItem && (
                  <DetailPane
                    item={selectedItem}
                    lists={lists}
                    onClose={() => setSelectedItemId(null)}
                    onUpdate={updateItem}
                    onDelete={deleteItem}
                    onPickAttachment={pickAttachment}
                    onToggleImportant={toggleImportant}
                    colors={colors}
                    styles={styles}
                  />
                )}
              </ScrollView>
            ) : (
              <ScrollView contentContainerStyle={styles.content}>
                <View style={[styles.quickAdd, { borderColor: screenAccent }]}>
                  <Text style={[styles.plus, { color: screenAccent }]}>+</Text>
                  <TextInput
                    value={quickTitle}
                    onChangeText={setQuickTitle}
                    onSubmitEditing={addQuickTask}
                    placeholder="Adicionar uma tarefa"
                    placeholderTextColor={colors.textMuted}
                    style={styles.quickInput}
                    returnKeyType="done"
                  />
                  <Pressable onPress={addQuickTask} style={[styles.addButton, { borderColor: screenAccent }]}>
                    <Text style={[styles.addButtonText, { color: screenAccent }]}>Adicionar</Text>
                  </Pressable>
                </View>

                {mode === 'Meu Dia' && myDaySuggestions.length > 0 && (
                  <SuggestionsPanel
                    items={myDaySuggestions}
                    lists={lists}
                    onAdd={addListToMyDay}
                    open={showSuggestions}
                    setOpen={setShowSuggestions}
                    colors={colors}
                    styles={styles}
                  />
                )}

                <View style={styles.taskList}>
                  {pendingItems.length === 0 && completedItems.length === 0 && (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>Nada por aqui ainda</Text>
                      <Text style={styles.emptyText}>
                        {searchTerm
                          ? 'Nenhuma tarefa para sua busca.'
                          : 'Use a entrada rápida ou a aba Caneta para criar.'}
                      </Text>
                    </View>
                  )}

                  {pendingItems.map((item) => (
                    <TaskRow
                      key={item.id}
                      item={item}
                      list={lists.find((l) => l.id === item.listId)}
                      selected={item.id === selectedItemId}
                      onOpen={setSelectedItemId}
                      onToggleComplete={toggleComplete}
                      onToggleImportant={toggleImportant}
                      onToggleMyDay={toggleMyDay}
                      colors={colors}
                      styles={styles}
                    />
                  ))}

                  {completedItems.length > 0 && (
                    <Pressable
                      onPress={() => setShowCompleted(!showCompleted)}
                      style={styles.completedHeader}
                    >
                      <Text style={styles.completedHeaderText}>
                        {showCompleted ? '▾' : '▸'} Concluído {completedItems.length}
                      </Text>
                    </Pressable>
                  )}

                  {showCompleted &&
                    completedItems.map((item) => (
                      <TaskRow
                        key={item.id}
                        item={item}
                        list={lists.find((l) => l.id === item.listId)}
                        selected={item.id === selectedItemId}
                        onOpen={setSelectedItemId}
                        onToggleComplete={toggleComplete}
                        onToggleImportant={toggleImportant}
                        onToggleMyDay={toggleMyDay}
                        colors={colors}
                        styles={styles}
                      />
                    ))}

                  {!isWide && selectedItem && (
                    <DetailPane
                      item={selectedItem}
                      lists={lists}
                      onClose={() => setSelectedItemId(null)}
                      onUpdate={updateItem}
                      onDelete={deleteItem}
                      onPickAttachment={pickAttachment}
                      onToggleImportant={toggleImportant}
                      colors={colors}
                      styles={styles}
                    />
                  )}
                </View>
              </ScrollView>
            )}

            {isWide && selectedItem && (
              <DetailPane
                item={selectedItem}
                lists={lists}
                onClose={() => setSelectedItemId(null)}
                onUpdate={updateItem}
                onDelete={deleteItem}
                onPickAttachment={pickAttachment}
                onToggleImportant={toggleImportant}
                colors={colors}
                styles={styles}
              />
            )}
          </View>
        </View>
      </View>

      {showListDialog && (
        <Dialog
          title="Nova lista"
          onClose={() => setShowListDialog(false)}
          colors={colors}
          styles={styles}
        >
          <TextInput
            value={newListName}
            onChangeText={setNewListName}
            placeholder="Nome da lista"
            placeholderTextColor={colors.textMuted}
            style={styles.dialogInput}
            autoFocus
          />
          <View style={styles.dialogActions}>
            {groups.length > 0 && (
              <Text style={styles.mutedText}>Para escolher grupo, edite depois pela lista.</Text>
            )}
          </View>
          <View style={styles.dialogActions}>
            <Pressable onPress={() => setShowListDialog(false)} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={() => createList(newListName)} style={styles.addButtonSolid}>
              <Text style={styles.addButtonSolidText}>Criar</Text>
            </Pressable>
          </View>
        </Dialog>
      )}

      {showGroupDialog && (
        <Dialog
          title="Novo grupo"
          onClose={() => setShowGroupDialog(false)}
          colors={colors}
          styles={styles}
        >
          <TextInput
            value={newGroupName}
            onChangeText={setNewGroupName}
            placeholder="Nome do grupo"
            placeholderTextColor={colors.textMuted}
            style={styles.dialogInput}
            autoFocus
          />
          <View style={styles.dialogActions}>
            <Pressable onPress={() => setShowGroupDialog(false)} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={() => createGroup(newGroupName)} style={styles.addButtonSolid}>
              <Text style={styles.addButtonSolidText}>Criar</Text>
            </Pressable>
          </View>
        </Dialog>
      )}

      {editingListId && (
        <ListEditor
          list={lists.find((l) => l.id === editingListId)!}
          groups={groups}
          onClose={() => setEditingListId(null)}
          onUpdate={(changes) => updateList(editingListId, changes)}
          onDelete={() => {
            deleteList(editingListId);
            setEditingListId(null);
          }}
          colors={colors}
          styles={styles}
        />
      )}
    </SafeAreaView>
  );
}

type SidebarProps = {
  mode: SmartView | { kind: 'list'; id: string };
  setMode: (m: SmartView | { kind: 'list'; id: string }) => void;
  lists: TaskList[];
  groups: ListGroup[];
  items: AgendaItem[];
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  onAddList: () => void;
  onAddGroup: () => void;
  onToggleGroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
  onEditList: (id: string) => void;
  onDeleteList: (id: string) => void;
  colors: Colors;
  styles: any;
};

function Sidebar({
  mode,
  setMode,
  lists,
  groups,
  items,
  onAddList,
  onAddGroup,
  onToggleGroup,
  onEditList,
  colors,
  styles,
}: SidebarProps) {
  const ungrouped = lists.filter((l) => !l.groupId);
  return (
    <View style={styles.sidebar}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>G</Text>
        </View>
        <View>
          <Text style={styles.profileName}>Gomes</Text>
          <Text style={styles.profileEmail}>agenda local</Text>
        </View>
      </View>

      <NavItem
        label="☀️ Meu Dia"
        count={items.filter((i) => i.myDay).length}
        active={mode === 'Meu Dia'}
        onPress={() => setMode('Meu Dia')}
        styles={styles}
      />
      <NavItem
        label="⭐ Importante"
        count={items.filter((i) => i.important).length}
        active={mode === 'Importante'}
        onPress={() => setMode('Importante')}
        styles={styles}
      />
      <NavItem
        label="📅 Planejado"
        count={items.filter((i) => parseItemDate(i.date)).length}
        active={mode === 'Planejado'}
        onPress={() => setMode('Planejado')}
        styles={styles}
      />
      <NavItem
        label="👥 Atribuído a mim"
        count={items.filter((i) => i.important && i.myDay).length}
        active={mode === 'Atribuído a mim'}
        onPress={() => setMode('Atribuído a mim')}
        styles={styles}
      />
      <NavItem
        label="🗓️ Agenda"
        count={items.filter((i) => parseItemDate(i.date)).length}
        active={mode === 'Agenda'}
        onPress={() => setMode('Agenda')}
        styles={styles}
      />
      <NavItem
        label="📥 Tudo"
        count={items.length}
        active={mode === 'Tudo'}
        onPress={() => setMode('Tudo')}
        styles={styles}
      />
      <NavItem
        label="✅ Concluído"
        count={items.filter((i) => i.status === 'Concluido').length}
        active={mode === 'Concluído'}
        onPress={() => setMode('Concluído')}
        styles={styles}
      />

      <View style={styles.divider} />

      {groups.map((group) => {
        const groupLists = lists.filter((l) => l.groupId === group.id);
        return (
          <View key={group.id}>
            <Pressable onPress={() => onToggleGroup(group.id)} style={styles.groupHeader}>
              <Text style={styles.groupHeaderText}>
                {group.collapsed ? '▸' : '▾'} {group.name}
              </Text>
            </Pressable>
            {!group.collapsed &&
              groupLists.map((list) => (
                <ListRow
                  key={list.id}
                  list={list}
                  count={items.filter((i) => i.listId === list.id).length}
                  active={typeof mode === 'object' && mode.id === list.id}
                  onPress={() => setMode({ kind: 'list', id: list.id })}
                  onEdit={() => onEditList(list.id)}
                  styles={styles}
                />
              ))}
          </View>
        );
      })}

      {groups.length > 0 && <View style={styles.divider} />}

      <Text style={styles.sidebarLabel}>Listas</Text>
      {ungrouped.map((list) => (
        <ListRow
          key={list.id}
          list={list}
          count={items.filter((i) => i.listId === list.id).length}
          active={typeof mode === 'object' && mode.id === list.id}
          onPress={() => setMode({ kind: 'list', id: list.id })}
          onEdit={() => onEditList(list.id)}
          styles={styles}
        />
      ))}

      <View style={styles.sidebarFooter}>
        <Pressable onPress={onAddList} style={styles.sidebarAction}>
          <Text style={styles.sidebarActionText}>+ Nova lista</Text>
        </Pressable>
        <Pressable onPress={onAddGroup} style={styles.sidebarActionGhost}>
          <Text style={styles.sidebarActionTextGhost}>+ Novo grupo</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ListRow({
  list,
  count,
  active,
  onPress,
  onEdit,
  styles,
}: {
  list: TaskList;
  count: number;
  active: boolean;
  onPress: () => void;
  onEdit: () => void;
  styles: any;
}) {
  return (
    <View style={[styles.listRowWrap, active && styles.navItemActive]}>
      <Pressable onPress={onPress} style={styles.listRowMain}>
        <View style={[styles.listColorDot, { backgroundColor: list.color }]} />
        <Text style={styles.listRowEmoji}>{list.emoji}</Text>
        <Text style={[styles.navLabel, { flex: 1 }]} numberOfLines={1}>
          {list.name}
        </Text>
        <Text style={styles.navCount}>{count}</Text>
      </Pressable>
      <Pressable onPress={onEdit} style={styles.listRowEdit}>
        <Text style={styles.listRowEditText}>⋯</Text>
      </Pressable>
    </View>
  );
}

function MobileNav({
  mode,
  setMode,
  lists,
  items,
  styles,
}: {
  mode: SmartView | { kind: 'list'; id: string };
  setMode: (m: SmartView | { kind: 'list'; id: string }) => void;
  lists: TaskList[];
  items: AgendaItem[];
  colors: Colors;
  styles: any;
}) {
  const smartViews: SmartView[] = ['Meu Dia', 'Importante', 'Planejado', 'Agenda', 'Tudo', 'Concluído'];
  return (
    <View style={styles.mobileNav}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileNavScroll}>
        {smartViews.map((view) => (
          <NavPill key={view} label={view} active={mode === view} onPress={() => setMode(view)} styles={styles} />
        ))}
        {lists.map((list) => (
          <NavPill
            key={list.id}
            label={`${list.emoji} ${list.name} ${items.filter((i) => i.listId === list.id).length}`}
            active={typeof mode === 'object' && mode.id === list.id}
            onPress={() => setMode({ kind: 'list', id: list.id })}
            styles={styles}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function NavItem({
  label,
  count,
  active,
  onPress,
  styles,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  styles: any;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.navItem, active && styles.navItemActive]}>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
      <Text style={[styles.navCount, active && styles.navLabelActive]}>{count}</Text>
    </Pressable>
  );
}

function NavPill({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: any;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.navPill, active && styles.navPillActive]}>
      <Text style={[styles.navPillText, active && styles.navPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SortMenu({
  sortMode,
  setSortMode,
  colors,
  styles,
}: {
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
  colors: Colors;
  styles: any;
}) {
  const [open, setOpen] = useState(false);
  const opts: SortMode[] = ['Manual', 'Importância', 'Prazo', 'A-Z', 'Criação'];
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={styles.sortButton}>
        <Text style={styles.sortButtonText}>↕ Classificar: {sortMode}</Text>
      </Pressable>
      {open && (
        <View style={styles.sortMenu}>
          {opts.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => {
                setSortMode(opt);
                setOpen(false);
              }}
              style={[styles.sortMenuItem, sortMode === opt && { backgroundColor: colors.accentSoft }]}
            >
              <Text style={styles.sortMenuItemText}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function SuggestionsPanel({
  items,
  lists,
  onAdd,
  open,
  setOpen,
  colors,
  styles,
}: {
  items: AgendaItem[];
  lists: TaskList[];
  onAdd: (id: number) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  colors: Colors;
  styles: any;
}) {
  return (
    <View style={styles.suggestionsPanel}>
      <Pressable onPress={() => setOpen(!open)} style={styles.suggestionsHeader}>
        <Text style={styles.suggestionsTitle}>💡 Sugestões ({items.length})</Text>
        <Text style={styles.mutedText}>{open ? 'Ocultar' : 'Mostrar'}</Text>
      </Pressable>
      {open &&
        items.map((it) => {
          const list = lists.find((l) => l.id === it.listId);
          return (
            <View key={it.id} style={styles.suggestionRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionTitle}>{it.title}</Text>
                <Text style={styles.mutedText}>
                  {list?.emoji} {list?.name} • {it.date} {it.time}
                </Text>
              </View>
              <Pressable onPress={() => onAdd(it.id)} style={styles.smallAction}>
                <Text style={styles.smallActionText}>+ Meu Dia</Text>
              </Pressable>
            </View>
          );
        })}
    </View>
  );
}

function TaskRow({
  item,
  list,
  selected,
  onOpen,
  onToggleComplete,
  onToggleImportant,
  onToggleMyDay,
  colors,
  styles,
}: {
  item: AgendaItem;
  list: TaskList | undefined;
  selected: boolean;
  onOpen: (id: number) => void;
  onToggleComplete: (id: number) => void;
  onToggleImportant: (id: number) => void;
  onToggleMyDay: (id: number) => void;
  colors: Colors;
  styles: any;
}) {
  const completed = item.status === 'Concluido';
  const hashtags = extractHashtags(item);

  return (
    <View style={[styles.taskRow, selected && { borderColor: colors.accent }]}>
      <Pressable
        onPress={() => onToggleComplete(item.id)}
        style={[styles.checkCircle, completed && { backgroundColor: colors.accent }]}
      >
        <Text style={styles.checkMark}>{completed ? '✓' : ''}</Text>
      </Pressable>
      <Pressable onPress={() => onOpen(item.id)} style={styles.taskBody}>
        <Text style={[styles.taskTitle, completed && styles.taskTitleDone]}>{item.title}</Text>
        <View style={styles.taskMetaRow}>
          {list && (
            <View style={[styles.listBadge, { borderColor: list.color }]}>
              <View style={[styles.listColorDot, { backgroundColor: list.color }]} />
              <Text style={styles.listBadgeText}>
                {list.emoji} {list.name}
              </Text>
            </View>
          )}
          <Text style={styles.taskMeta}>
            📅 {item.date} • ⏰ {item.time}
          </Text>
          {item.repeat !== 'Nunca' && <Text style={styles.taskMeta}>🔁 {item.repeat}</Text>}
          {item.remind !== 'Sem lembrete' && <Text style={styles.taskMeta}>🔔 {item.remind}</Text>}
          {item.myDay && <Text style={[styles.taskMeta, { color: colors.accent }]}>☀️ Meu Dia</Text>}
          {item.steps.length > 0 && (
            <Text style={styles.taskMeta}>
              📋 {item.steps.filter((s) => s.done).length}/{item.steps.length}
            </Text>
          )}
          {item.attachments.length > 0 && <Text style={styles.taskMeta}>📎 {item.attachments.length}</Text>}
        </View>
        {hashtags.length > 0 && (
          <View style={styles.hashtagRow}>
            {hashtags.map((tag) => (
              <Text key={tag} style={styles.hashtag}>
                {tag}
              </Text>
            ))}
          </View>
        )}
        {!!item.notes && (
          <Text style={styles.taskNotes} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => onToggleMyDay(item.id)}
        style={styles.iconBtn}
      >
        <Text style={[styles.iconText, item.myDay && { color: colors.accent }]}>
          {item.myDay ? '☀' : '+'}
        </Text>
      </Pressable>
      <Pressable onPress={() => onToggleImportant(item.id)} style={styles.iconBtn}>
        <Text style={[styles.iconText, item.important && { color: colors.star }]}>
          {item.important ? '★' : '☆'}
        </Text>
      </Pressable>
    </View>
  );
}

function AgendaBoard({
  view,
  setView,
  items,
  lists,
  selectedItemId,
  onOpen,
  onToggleComplete,
  onToggleImportant,
  colors,
  styles,
}: {
  view: CalendarView;
  setView: (view: CalendarView) => void;
  items: AgendaItem[];
  lists: TaskList[];
  selectedItemId: number | null;
  onOpen: (id: number) => void;
  onToggleComplete: (id: number) => void;
  onToggleImportant: (id: number) => void;
  colors: Colors;
  styles: any;
}) {
  const days = getCalendarDays(view);

  return (
    <View style={styles.agendaPanel}>
      <View style={styles.agendaHeader}>
        <View>
          <Text style={styles.panelTitle}>Visualização</Text>
          <Text style={styles.mutedText}>Dia, semana e mês respeitando repetições.</Text>
        </View>
        <View style={styles.viewSwitch}>
          {(['Dia', 'Semana', 'Mes'] as CalendarView[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => setView(option)}
              style={[styles.viewButton, view === option && styles.viewButtonActive]}
            >
              <Text style={[styles.viewButtonText, view === option && styles.viewButtonTextActive]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.calendarGrid}>
        {days.map((day) => {
          const dayItems = items.filter((item) => occurrenceMatches(item, day));
          return (
            <View key={day.toISOString()} style={styles.dayColumn}>
              <Text style={styles.dayTitle}>{formatDateLong(day)}</Text>
              <Text style={styles.daySub}>{formatDate(day)}</Text>
              {dayItems.length === 0 && <Text style={styles.emptyDay}>Sem tarefas</Text>}
              {dayItems.map((item) => (
                <TaskRow
                  key={`${item.id}-${day.toISOString()}`}
                  item={{ ...item, date: formatDate(day) }}
                  list={lists.find((l) => l.id === item.listId)}
                  selected={item.id === selectedItemId}
                  onOpen={onOpen}
                  onToggleComplete={onToggleComplete}
                  onToggleImportant={onToggleImportant}
                  onToggleMyDay={() => undefined}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DetailPane({
  item,
  lists,
  onClose,
  onUpdate,
  onDelete,
  onPickAttachment,
  onToggleImportant,
  colors,
  styles,
}: {
  item: AgendaItem;
  lists: TaskList[];
  onClose: () => void;
  onUpdate: (id: number, changes: Partial<AgendaItem>) => void;
  onDelete: (id: number) => void;
  onPickAttachment: (id: number) => void;
  onToggleImportant: (id: number) => void;
  colors: Colors;
  styles: any;
}) {
  const steps = item.steps;
  const attachments = item.attachments;

  function addStep() {
    onUpdate(item.id, {
      steps: [...steps, { id: `s-${Date.now()}`, text: 'Nova etapa', done: false }],
    });
  }

  function updateStepText(id: string, text: string) {
    onUpdate(item.id, { steps: steps.map((s) => (s.id === id ? { ...s, text } : s)) });
  }

  function toggleStepDone(id: string) {
    onUpdate(item.id, { steps: steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  }

  function removeStep(id: string) {
    onUpdate(item.id, { steps: steps.filter((s) => s.id !== id) });
  }

  function removeAttachment(id: string) {
    onUpdate(item.id, { attachments: attachments.filter((a) => a.id !== id) });
  }

  const dueDate = parseItemDate(item.date);
  const dateForInput = dueDate ? toIsoDate(dueDate) : '';
  const timeForInput = (() => {
    const { hours, minutes } = parseItemTime(item.time);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  })();

  return (
    <ScrollView style={styles.detailPane} contentContainerStyle={{ gap: 14 }}>
      <View style={styles.detailTop}>
        <Text style={styles.detailHeading}>Detalhes</Text>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Fechar</Text>
        </Pressable>
      </View>

      <View style={styles.detailTitleRow}>
        <Pressable
          onPress={() => onUpdate(item.id, { status: item.status === 'Concluido' ? 'Pendente' : 'Concluido' })}
          style={[
            styles.checkCircle,
            item.status === 'Concluido' && { backgroundColor: colors.accent },
          ]}
        >
          <Text style={styles.checkMark}>{item.status === 'Concluido' ? '✓' : ''}</Text>
        </Pressable>
        <TextInput
          value={item.title}
          onChangeText={(title) => onUpdate(item.id, { title })}
          style={[styles.detailTitleInput, { flex: 1 }]}
          placeholder="Título"
          placeholderTextColor={colors.textMuted}
        />
        <Pressable onPress={() => onToggleImportant(item.id)} style={styles.iconBtn}>
          <Text style={[styles.iconText, item.important && { color: colors.star }]}>
            {item.important ? '★' : '☆'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.detailBlock}>
        <View style={styles.detailLineHeader}>
          <Text style={styles.detailLabel}>Adicionar etapas</Text>
          <Pressable onPress={addStep} style={styles.smallAction}>
            <Text style={styles.smallActionText}>+ Etapa</Text>
          </Pressable>
        </View>
        {steps.length === 0 && <Text style={styles.mutedText}>Nenhuma etapa adicionada.</Text>}
        {steps.map((step) => (
          <View key={step.id} style={styles.stepRow}>
            <Pressable
              onPress={() => toggleStepDone(step.id)}
              style={[styles.stepCheck, step.done && { backgroundColor: colors.accent }]}
            >
              <Text style={styles.checkMark}>{step.done ? '✓' : ''}</Text>
            </Pressable>
            <TextInput
              value={step.text}
              onChangeText={(value) => updateStepText(step.id, value)}
              style={[styles.stepInput, step.done && { textDecorationLine: 'line-through', color: colors.textMuted }]}
              placeholder="Nome da etapa"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable onPress={() => removeStep(step.id)} style={styles.removeStep}>
              <Text style={styles.removeStepText}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => onUpdate(item.id, { myDay: !item.myDay })}
        style={[styles.fullOption, item.myDay && styles.fullOptionActive]}
      >
        <Text style={[styles.fullOptionText, item.myDay && styles.fullOptionTextActive]}>
          {item.myDay ? '☀️ Remover do Meu Dia' : '☀️ Adicionar ao Meu Dia'}
        </Text>
      </Pressable>

      <View style={styles.detailBlock}>
        <Text style={styles.detailLabel}>🔔 Lembre-me</Text>
        <View style={styles.optionWrap}>
          {remindOptions.map((remind) => (
            <OptionChip
              key={remind}
              label={remind}
              active={item.remind === remind}
              onPress={() => onUpdate(item.id, { remind })}
              styles={styles}
            />
          ))}
        </View>
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.field}>
          <Text style={styles.detailLabel}>📅 Data</Text>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <input
              type="date"
              value={dateForInput}
              onChange={(e: any) => {
                const v = e.target.value;
                onUpdate(item.id, { date: v ? v : 'Sem data' });
              }}
              style={webInputStyle(colors)}
            />
          ) : (
            <TextInput
              value={item.date}
              onChangeText={(date) => onUpdate(item.id, { date })}
              style={styles.fieldInput}
              placeholderTextColor={colors.textMuted}
            />
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.detailLabel}>⏰ Hora</Text>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <input
              type="time"
              value={timeForInput}
              onChange={(e: any) => {
                const v = e.target.value;
                onUpdate(item.id, { time: v ? v : 'Sem hora' });
              }}
              style={webInputStyle(colors)}
            />
          ) : (
            <TextInput
              value={item.time}
              onChangeText={(time) => onUpdate(item.id, { time })}
              style={styles.fieldInput}
              placeholderTextColor={colors.textMuted}
            />
          )}
        </View>
      </View>

      <View style={styles.detailBlock}>
        <Text style={styles.detailLabel}>🔁 Repetir</Text>
        <View style={styles.optionWrap}>
          {repeatOptions.map((repeat) => (
            <OptionChip
              key={repeat}
              label={repeat}
              active={item.repeat === repeat}
              onPress={() => onUpdate(item.id, { repeat })}
              styles={styles}
            />
          ))}
        </View>
      </View>

      <View style={styles.detailBlock}>
        <Text style={styles.detailLabel}>📎 Anexos</Text>
        <View style={styles.attachmentRow}>
          <Pressable onPress={() => onPickAttachment(item.id)} style={styles.attachmentButton}>
            <Text style={styles.attachmentText}>
              {Platform.OS === 'web' ? '+ Selecionar arquivo' : '+ Anexo (web apenas)'}
            </Text>
          </Pressable>
        </View>
        {attachments.map((attachment) => (
          <View key={attachment.id} style={styles.attachmentItemRow}>
            <Text style={styles.attachmentItem}>
              {attachment.name}
              {attachment.size ? ` • ${Math.round(attachment.size / 1024)} KB` : ''}
            </Text>
            <Pressable onPress={() => removeAttachment(attachment.id)} style={styles.removeStep}>
              <Text style={styles.removeStepText}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.detailBlock}>
        <Text style={styles.detailLabel}>📝 Anotações</Text>
        <TextInput
          multiline
          value={item.notes}
          onChangeText={(notes) => onUpdate(item.id, { notes })}
          style={styles.notesInput}
          placeholder="Adicionar anotações (use #hashtag para organizar)"
          placeholderTextColor={colors.textMuted}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.detailBlock}>
        <Text style={styles.detailLabel}>📂 Lista</Text>
        <View style={styles.optionWrap}>
          {lists.map((list) => (
            <OptionChip
              key={list.id}
              label={`${list.emoji} ${list.name}`}
              active={item.listId === list.id}
              onPress={() => onUpdate(item.id, { listId: list.id })}
              styles={styles}
            />
          ))}
        </View>
      </View>

      <Pressable onPress={() => onDelete(item.id)} style={styles.deleteButton}>
        <Text style={styles.deleteText}>🗑 Excluir tarefa</Text>
      </Pressable>
    </ScrollView>
  );
}

function OptionChip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: any;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.optionChip, active && styles.optionChipActive]}>
      <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Dialog({
  title,
  onClose,
  children,
  colors,
  styles,
}: {
  title: string;
  onClose: () => void;
  children: any;
  colors: Colors;
  styles: any;
}) {
  return (
    <View style={styles.dialogBackdrop}>
      <View style={styles.dialog}>
        <View style={styles.detailTop}>
          <Text style={styles.detailHeading}>{title}</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Fechar</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}

function ListEditor({
  list,
  groups,
  onClose,
  onUpdate,
  onDelete,
  colors,
  styles,
}: {
  list: TaskList;
  groups: ListGroup[];
  onClose: () => void;
  onUpdate: (changes: Partial<TaskList>) => void;
  onDelete: () => void;
  colors: Colors;
  styles: any;
}) {
  return (
    <View style={styles.dialogBackdrop}>
      <View style={styles.dialog}>
        <View style={styles.detailTop}>
          <Text style={styles.detailHeading}>Editar lista</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Fechar</Text>
          </Pressable>
        </View>

        <Text style={styles.detailLabel}>Nome</Text>
        <TextInput
          value={list.name}
          onChangeText={(name) => onUpdate({ name })}
          style={styles.dialogInput}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.detailLabel}>Cor</Text>
        <View style={styles.optionWrap}>
          {palette.map((color) => (
            <Pressable
              key={color}
              onPress={() => onUpdate({ color })}
              style={[
                styles.colorSwatch,
                { backgroundColor: color },
                list.color === color && { borderWidth: 3, borderColor: colors.text },
              ]}
            />
          ))}
        </View>

        <Text style={styles.detailLabel}>Ícone</Text>
        <View style={styles.optionWrap}>
          {emojiOptions.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => onUpdate({ emoji })}
              style={[
                styles.optionChip,
                list.emoji === emoji && styles.optionChipActive,
                { paddingHorizontal: 14 },
              ]}
            >
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>

        {groups.length > 0 && (
          <>
            <Text style={styles.detailLabel}>Grupo</Text>
            <View style={styles.optionWrap}>
              <OptionChip
                label="Sem grupo"
                active={!list.groupId}
                onPress={() => onUpdate({ groupId: null })}
                styles={styles}
              />
              {groups.map((g) => (
                <OptionChip
                  key={g.id}
                  label={g.name}
                  active={list.groupId === g.id}
                  onPress={() => onUpdate({ groupId: g.id })}
                  styles={styles}
                />
              ))}
            </View>
          </>
        )}

        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>🗑 Excluir lista</Text>
        </Pressable>
      </View>
    </View>
  );
}

function webInputStyle(colors: Colors): any {
  return {
    backgroundColor: colors.surfaceAlt,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 6,
    color: colors.text,
    fontSize: 14,
    fontFamily: 'inherit',
    minHeight: 40,
    padding: '8px 10px',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  };
}

function createStyles(c: Colors) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.appBg,
    },
    app: {
      flex: 1,
      flexDirection: 'row',
    },
    appStack: {
      flexDirection: 'column',
    },
    sidebar: {
      backgroundColor: c.sidebarBg,
      borderRightColor: c.border,
      borderRightWidth: 1,
      gap: 4,
      padding: 16,
      width: 300,
    },
    profile: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      marginBottom: 18,
    },
    avatar: {
      alignItems: 'center',
      backgroundColor: c.accent,
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '800',
    },
    profileName: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
    },
    profileEmail: {
      color: c.textMuted,
      fontSize: 12,
    },
    navItem: {
      alignItems: 'center',
      borderRadius: 6,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 38,
      paddingHorizontal: 12,
    },
    navItemActive: {
      backgroundColor: c.accentSoft,
    },
    navLabel: {
      color: c.text,
      fontSize: 14,
      fontWeight: '600',
    },
    navLabelActive: {
      color: c.accent,
    },
    navCount: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    divider: {
      backgroundColor: c.border,
      height: 1,
      marginVertical: 10,
    },
    sidebarLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '800',
      marginBottom: 4,
      paddingHorizontal: 12,
      textTransform: 'uppercase',
    },
    groupHeader: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    groupHeaderText: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    listRowWrap: {
      alignItems: 'center',
      borderRadius: 6,
      flexDirection: 'row',
      minHeight: 38,
    },
    listRowMain: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      minHeight: 38,
      paddingHorizontal: 12,
    },
    listRowEmoji: {
      fontSize: 14,
    },
    listColorDot: {
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    listRowEdit: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    listRowEditText: {
      color: c.textMuted,
      fontSize: 18,
      fontWeight: '900',
    },
    sidebarFooter: {
      gap: 6,
      marginTop: 12,
    },
    sidebarAction: {
      backgroundColor: c.accent,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sidebarActionText: {
      color: '#fff',
      fontWeight: '800',
      textAlign: 'center',
    },
    sidebarActionGhost: {
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sidebarActionTextGhost: {
      color: c.text,
      fontWeight: '800',
      textAlign: 'center',
    },
    mobileNav: {
      backgroundColor: c.surface,
      borderBottomColor: c.border,
      borderBottomWidth: 1,
    },
    mobileNavScroll: {
      gap: 8,
      padding: 10,
    },
    navPill: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    navPillActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    navPillText: {
      color: c.text,
      fontWeight: '700',
    },
    navPillTextActive: {
      color: '#fff',
    },
    main: {
      flex: 1,
      minWidth: 0,
    },
    topBar: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      padding: 22,
    },
    topBarStack: {
      alignItems: 'flex-start',
      flexDirection: 'column',
      gap: 12,
    },
    topActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    appName: {
      color: c.topBarSub,
      fontSize: 12,
      fontWeight: '700',
    },
    screenTitle: {
      color: c.topBarText,
      fontSize: 30,
      fontWeight: '800',
    },
    screenSub: {
      color: c.topBarSub,
      fontSize: 13,
      marginTop: 3,
    },
    penButton: {
      backgroundColor: c.surface,
      borderRadius: 6,
      minHeight: 38,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    penButtonText: {
      color: c.accent,
      fontWeight: '800',
    },
    backupBanner: {
      backgroundColor: c.accentSoft,
      borderBottomColor: c.accent,
      borderBottomWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    backupBannerText: {
      color: c.accent,
      fontSize: 13,
      fontWeight: '700',
    },
    toolbar: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderBottomColor: c.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 12,
    },
    searchBox: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
    },
    searchIcon: {
      color: c.textMuted,
      fontSize: 14,
    },
    searchInput: {
      color: c.text,
      flex: 1,
      fontSize: 14,
      minHeight: 38,
      outlineStyle: 'none',
    } as object,
    toolbarRight: {
      flexDirection: 'row',
      gap: 8,
    },
    sortButton: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    sortButtonText: {
      color: c.text,
      fontWeight: '700',
    },
    sortMenu: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      marginTop: 4,
      position: 'absolute',
      right: 0,
      top: '100%',
      width: 180,
      zIndex: 100,
    },
    sortMenuItem: {
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sortMenuItemText: {
      color: c.text,
      fontSize: 14,
    },
    workArea: {
      flex: 1,
    },
    workAreaWide: {
      flexDirection: 'row',
    },
    content: {
      gap: 12,
      marginHorizontal: 'auto',
      maxWidth: 880,
      padding: 16,
      width: '100%',
    },
    quickAdd: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 54,
      paddingHorizontal: 14,
    },
    plus: {
      fontSize: 26,
      fontWeight: '300',
    },
    quickInput: {
      color: c.text,
      flex: 1,
      fontSize: 16,
      minHeight: 48,
      outlineStyle: 'none',
    } as object,
    addButton: {
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    addButtonText: {
      fontWeight: '800',
    },
    taskList: {
      gap: 8,
    },
    taskRow: {
      alignItems: 'flex-start',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 14,
    },
    checkCircle: {
      alignItems: 'center',
      borderColor: c.accent,
      borderRadius: 11,
      borderWidth: 2,
      height: 22,
      justifyContent: 'center',
      marginTop: 2,
      width: 22,
    },
    checkMark: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '900',
    },
    taskBody: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    taskTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700',
    },
    taskTitleDone: {
      color: c.textMuted,
      textDecorationLine: 'line-through',
    },
    taskMetaRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    taskMeta: {
      color: c.textMuted,
      fontSize: 12,
    },
    listBadge: {
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    listBadgeText: {
      color: c.text,
      fontSize: 11,
      fontWeight: '700',
    },
    hashtagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    hashtag: {
      backgroundColor: c.accentSoft,
      borderRadius: 10,
      color: c.accent,
      fontSize: 11,
      fontWeight: '700',
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    taskNotes: {
      color: c.text,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    iconBtn: {
      alignItems: 'center',
      borderColor: c.borderStrong,
      borderRadius: 14,
      borderWidth: 1,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    iconText: {
      color: c.textMuted,
      fontSize: 16,
      fontWeight: '800',
    },
    completedHeader: {
      paddingHorizontal: 6,
      paddingVertical: 10,
    },
    completedHeaderText: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800',
    },
    emptyState: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      padding: 28,
    },
    emptyTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '800',
    },
    emptyText: {
      color: c.textMuted,
      marginTop: 6,
      textAlign: 'center',
    },
    suggestionsPanel: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      padding: 12,
    },
    suggestionsHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    suggestionsTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: '800',
    },
    suggestionRow: {
      alignItems: 'center',
      borderTopColor: c.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 10,
    },
    suggestionTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: '700',
    },
    penPanel: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      gap: 12,
      padding: 14,
    },
    panelHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
    },
    panelTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '800',
    },
    addButtonSolid: {
      backgroundColor: c.accent,
      borderRadius: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    addButtonSolidText: {
      color: '#fff',
      fontWeight: '800',
    },
    penInput: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      color: c.text,
      fontSize: 16,
      minHeight: 260,
      outlineStyle: 'none',
      padding: 14,
    } as object,
    agendaPanel: {
      gap: 12,
    },
    agendaHeader: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      padding: 14,
    },
    viewSwitch: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    viewButton: {
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    viewButtonActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    viewButtonText: {
      color: c.text,
      fontWeight: '800',
    },
    viewButtonTextActive: {
      color: '#fff',
    },
    calendarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    dayColumn: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      flexGrow: 1,
      gap: 8,
      minWidth: 230,
      padding: 12,
    },
    dayTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '800',
      textTransform: 'capitalize',
    },
    daySub: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    emptyDay: {
      color: c.textMuted,
      fontSize: 13,
      paddingVertical: 6,
    },
    detailPane: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      margin: 16,
      maxWidth: '100%',
      padding: 14,
      width: 380,
    },
    detailTop: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    detailHeading: {
      color: c.text,
      fontSize: 18,
      fontWeight: '800',
    },
    closeButton: {
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    closeText: {
      color: c.accent,
      fontWeight: '800',
    },
    detailTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    detailTitleInput: {
      borderBottomColor: c.accent,
      borderBottomWidth: 2,
      color: c.text,
      fontSize: 18,
      fontWeight: '800',
      minHeight: 42,
      outlineStyle: 'none',
    } as object,
    detailBlock: {
      gap: 8,
    },
    detailLineHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    detailGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    detailLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    field: {
      flex: 1,
      gap: 6,
    },
    fieldInput: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      color: c.text,
      minHeight: 40,
      outlineStyle: 'none',
      paddingHorizontal: 10,
    } as object,
    smallAction: {
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    smallActionText: {
      color: c.accent,
      fontSize: 12,
      fontWeight: '800',
    },
    mutedText: {
      color: c.textMuted,
      fontSize: 12,
    },
    stepRow: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    stepCheck: {
      alignItems: 'center',
      borderColor: c.accent,
      borderRadius: 8,
      borderWidth: 2,
      height: 16,
      justifyContent: 'center',
      width: 16,
    },
    stepInput: {
      color: c.text,
      flex: 1,
      minHeight: 32,
      outlineStyle: 'none',
    } as object,
    removeStep: {
      alignItems: 'center',
      height: 26,
      justifyContent: 'center',
      width: 26,
    },
    removeStepText: {
      color: c.textMuted,
      fontSize: 18,
      fontWeight: '900',
    },
    optionWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    optionChip: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    optionChipActive: {
      backgroundColor: c.accentSoft,
      borderColor: c.accent,
    },
    optionChipText: {
      color: c.text,
      fontSize: 13,
      fontWeight: '700',
    },
    optionChipTextActive: {
      color: c.accent,
    },
    fullOption: {
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      padding: 12,
    },
    fullOptionActive: {
      backgroundColor: c.accentSoft,
      borderColor: c.accent,
    },
    fullOptionText: {
      color: c.text,
      fontWeight: '800',
    },
    fullOptionTextActive: {
      color: c.accent,
    },
    notesInput: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      color: c.text,
      minHeight: 100,
      outlineStyle: 'none',
      padding: 10,
    } as object,
    attachmentRow: {
      flexDirection: 'row',
      gap: 8,
    },
    attachmentButton: {
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      flex: 1,
      padding: 10,
    },
    attachmentText: {
      color: c.accent,
      fontWeight: '800',
      textAlign: 'center',
    },
    attachmentItemRow: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: 'row',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    attachmentItem: {
      color: c.text,
      flex: 1,
      fontSize: 13,
    },
    deleteButton: {
      borderColor: c.danger,
      borderRadius: 6,
      borderWidth: 1,
      padding: 12,
    },
    deleteText: {
      color: c.danger,
      fontWeight: '800',
      textAlign: 'center',
    },
    dialogBackdrop: {
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.4)',
      bottom: 0,
      justifyContent: 'center',
      left: 0,
      padding: 20,
      position: 'absolute',
      right: 0,
      top: 0,
      zIndex: 200,
    },
    dialog: {
      backgroundColor: c.surface,
      borderRadius: 8,
      gap: 12,
      maxHeight: '90%',
      maxWidth: '100%',
      padding: 18,
      width: 460,
    },
    dialogInput: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.borderStrong,
      borderRadius: 6,
      borderWidth: 1,
      color: c.text,
      fontSize: 15,
      minHeight: 42,
      outlineStyle: 'none',
      paddingHorizontal: 12,
    } as object,
    dialogActions: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'flex-end',
    },
    colorSwatch: {
      borderRadius: 14,
      height: 28,
      width: 28,
    },
  });
}
