import { getActiveUserId, supabase } from './client';

/**
 * Who is signed in, without treating an Auth-server failure as signed out.
 *
 * `auth.getUser()` asks the server. When that call fails, the old stores saved
 * only in this browser and told the student the save worked. The id AuthProvider
 * already has, then the local session, still name the user so the write can go
 * to the database (or fail in the open).
 */
function rememberedUserId(): string | null {
  // Some unit tests replace the client module and omit this export. Reading a
  // missing mock export throws; that is the same as "nothing remembered".
  try {
    if (typeof getActiveUserId !== 'function') return null;
    return getActiveUserId();
  } catch {
    return null;
  }
}

export async function currentUserId(): Promise<string | null> {
  const active = rememberedUserId();
  if (active) return active;

  const auth = supabase.auth;
  if (typeof auth?.getUser === 'function') {
    try {
      const { data, error } = await auth.getUser();
      if (!error && data.user?.id) return data.user.id;
    } catch {
      // The Auth server did not answer. Fall through to the local session.
    }
  }

  if (typeof auth?.getSession !== 'function') return null;
  const { data, error } = await auth.getSession();
  if (error) return null;
  return data.session?.user?.id ?? null;
}
