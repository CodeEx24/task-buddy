const mockCreateClient = jest.fn((..._args: unknown[]) => ({ from: jest.fn() }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

jest.mock('./env', () => ({
  getEnv: () => ({
    appEnv: 'development',
    supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
    supabasePublishableKey: 'sb_publishable_test_value_123',
  }),
}));

describe('getSupabaseClient', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreateClient.mockClear();
  });

  it('creates nothing at import time', () => {
    jest.requireActual<typeof import('./supabase')>('./supabase');
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('creates one client with the publishable key and a SecureStore-backed, refreshing session (TB-20)', () => {
    const { getSupabaseClient } = jest.requireActual<typeof import('./supabase')>('./supabase');
    const first = getSupabaseClient();
    expect(getSupabaseClient()).toBe(first);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://abcdefghijklmnop.supabase.co',
      'sb_publishable_test_value_123',
      {
        auth: {
          storage: expect.objectContaining({
            getItem: expect.any(Function),
            setItem: expect.any(Function),
            removeItem: expect.any(Function),
          }),
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    );
  });
});
