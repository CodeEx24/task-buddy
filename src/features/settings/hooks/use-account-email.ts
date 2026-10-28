import { useSession } from '@/features/auth/session/SessionProvider';

/** The signed-in account's email, or null when nobody is signed in (TB-32 AC1, session from TB-20). */
export function useAccountEmail(): string | null {
  return useSession().session?.user.email ?? null;
}
