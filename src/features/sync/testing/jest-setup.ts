// Jest: no real sync backend in unit and screen tests (TB-43). SyncProvider sees a null remote
// and stays idle. Sync tests use the in-memory server in ./fake-sync-server.ts instead.
jest.mock('@/features/sync/remote/remote-factory', () => ({
  createSyncRemote: () => null,
}));
