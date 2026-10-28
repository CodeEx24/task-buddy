/**
 * The signed-in account's email, or null when nobody is signed in (TB-32).
 * Sign-in ships with TB-20; until then nobody can sign in, so this is always null. When TB-20
 * merges, return `useSession().session?.user.email ?? null` (`@/features/auth/session/SessionProvider`).
 */
export function useAccountEmail(): string | null {
  return null;
}
