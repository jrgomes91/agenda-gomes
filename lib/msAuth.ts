// Autenticação Microsoft via MSAL Browser (redirect flow para suportar PWA standalone no iPhone).
import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { MS_AUTHORITY, MS_CLIENT_ID, MS_SCOPES, getRedirectUri } from './syncConfig';

let cachedClient: PublicClientApplication | null = null;
let initialized = false;

export function getMsClient(): PublicClientApplication | null {
  if (typeof window === 'undefined') return null;
  if (!MS_CLIENT_ID) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new PublicClientApplication({
    auth: {
      clientId: MS_CLIENT_ID,
      authority: MS_AUTHORITY,
      redirectUri: getRedirectUri(),
    },
    cache: {
      cacheLocation: 'localStorage',
    },
  });
  return cachedClient;
}

export async function ensureMsInitialized() {
  const client = getMsClient();
  if (!client || initialized) return client;
  await client.initialize();
  // processa redirect de volta do login se houver
  try {
    const result = await client.handleRedirectPromise();
    if (result?.account) {
      client.setActiveAccount(result.account);
    }
  } catch {
    // ignore
  }
  initialized = true;
  return client;
}

export function getMsAccount(): AccountInfo | null {
  const client = cachedClient;
  if (!client) return null;
  const active = client.getActiveAccount();
  if (active) return active;
  const all = client.getAllAccounts();
  if (all.length > 0) {
    client.setActiveAccount(all[0]);
    return all[0];
  }
  return null;
}

export async function msSignIn() {
  const client = await ensureMsInitialized();
  if (!client) throw new Error('Microsoft Client ID não configurado.');
  await client.loginRedirect({ scopes: MS_SCOPES });
}

export async function msSignOut() {
  const client = await ensureMsInitialized();
  if (!client) return;
  const account = getMsAccount();
  if (!account) return;
  await client.logoutRedirect({ account });
}

export async function msGetToken(): Promise<string | null> {
  const client = await ensureMsInitialized();
  if (!client) return null;
  const account = getMsAccount();
  if (!account) return null;
  try {
    const res = await client.acquireTokenSilent({ scopes: MS_SCOPES, account });
    return res.accessToken;
  } catch {
    // se falhar silencioso, força login (redirect) — usuário verá popup tela do MS
    try {
      await client.acquireTokenRedirect({ scopes: MS_SCOPES, account });
    } catch {
      // ignore
    }
    return null;
  }
}
