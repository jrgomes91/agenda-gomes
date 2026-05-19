// Configuração de integrações. Os Client IDs são públicos (não-secretos).
// Defina em tempo de build via variável Expo: EXPO_PUBLIC_MS_CLIENT_ID e EXPO_PUBLIC_GOOGLE_CLIENT_ID.
// Cloudflare Pages: Settings → Environment variables → adicione essas duas.

export const MS_CLIENT_ID = process.env.EXPO_PUBLIC_MS_CLIENT_ID ?? '';
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export const MS_SCOPES = ['User.Read', 'Calendars.ReadWrite', 'Tasks.ReadWrite'];

export const MS_AUTHORITY = 'https://login.microsoftonline.com/common';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
  'profile',
];

export function getRedirectUri() {
  if (typeof window === 'undefined') return '';
  return window.location.origin + window.location.pathname.replace(/index\.html$/, '');
}

export const integrationsEnabled = {
  microsoft: () => !!MS_CLIENT_ID,
  google: () => !!GOOGLE_CLIENT_ID,
};
