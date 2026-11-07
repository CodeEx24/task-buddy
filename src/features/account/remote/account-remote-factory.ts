// Builds the app's AccountRemote (TB-53). Screen tests replace this module (jest.mock) so they
// never reach the network.
import { getSupabaseClient } from '@/lib/supabase';

import { createAccountRemote, type AccountRemote } from './account-remote';

export function getAccountRemote(): AccountRemote {
  return createAccountRemote(getSupabaseClient().functions);
}
