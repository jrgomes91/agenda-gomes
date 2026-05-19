// Autenticação Google via Google Identity Services (GIS).
// Usa Token Client (popup) que funciona em PWA standalone no iPhone (iOS 16.4+).
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from './syncConfig';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_KEY = '@agenda-gomes/google-token';
const USER_KEY = '@agenda-gomes/google-user';

let scriptLoaded = false;
let scriptPromise: Promise<void> | null = null;
let tokenClient: any = null;

type StoredToken = { token: string; expiresAt: number };

async function loadGisScript(): Promise<void> {
  if (scriptLoaded) return;
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('sem document'));
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => {
        scriptLoaded = true;
        resolve();
      });
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error('Falha ao carregar GIS'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

function getStoredToken(): StoredToken | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const data: StoredToken = JSON.parse(raw);
    if (Date.now() > data.expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}

function storeToken(token: string, expiresIn: number) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({
      token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000, // 60s de margem
    } as StoredToken)
  );
}

async function fetchUserEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const email = data.email ?? null;
    if (email && typeof localStorage !== 'undefined') {
      localStorage.setItem(USER_KEY, email);
    }
    return email;
  } catch {
    return null;
  }
}

export function getGoogleUserEmail(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

async function ensureTokenClient() {
  if (typeof window === 'undefined') throw new Error('sem window');
  await loadGisScript();
  const g = (window as any).google;
  if (!g?.accounts?.oauth2) throw new Error('GIS não disponível');
  if (!tokenClient) {
    tokenClient = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES.join(' '),
      callback: () => undefined, // sobrescrito em cada request
    });
  }
  return tokenClient;
}

export async function googleSignIn(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google Client ID não configurado.');
  const client = await ensureTokenClient();
  return new Promise<string>((resolve, reject) => {
    client.callback = async (response: any) => {
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      const token = response?.access_token;
      if (!token) {
        reject(new Error('Sem access_token'));
        return;
      }
      storeToken(token, response.expires_in ?? 3600);
      await fetchUserEmail(token);
      resolve(token);
    };
    client.requestAccessToken({ prompt: 'consent' });
  });
}

export async function googleGetToken(): Promise<string | null> {
  const stored = getStoredToken();
  if (stored) return stored.token;
  if (!GOOGLE_CLIENT_ID) return null;
  // tenta renovar silenciosamente
  try {
    const client = await ensureTokenClient();
    return new Promise<string | null>((resolve) => {
      client.callback = async (response: any) => {
        if (response?.access_token) {
          storeToken(response.access_token, response.expires_in ?? 3600);
          resolve(response.access_token);
        } else {
          resolve(null);
        }
      };
      client.requestAccessToken({ prompt: '' });
    });
  } catch {
    return null;
  }
}

export function googleSignOut() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}
