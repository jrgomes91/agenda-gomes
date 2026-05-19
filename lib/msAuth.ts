// Stub Microsoft Auth. Mantido para integracao futura.
// Para reativar: instalar @azure/msal-browser e restaurar implementacao real.
// (versao 5.x atual tem incompatibilidade com Metro bundler do Expo SDK 54
// devido a subpath /browser nos exports do msal-common).

export function getMsClient(): null {
  return null;
}

export async function ensureMsInitialized(): Promise<null> {
  return null;
}

export function getMsAccount(): { username: string } | null {
  return null;
}

export async function msSignIn(): Promise<void> {
  throw new Error('Microsoft desabilitado nesta build.');
}

export async function msSignOut(): Promise<void> {
  // noop
}

export async function msGetToken(): Promise<string | null> {
  return null;
}
