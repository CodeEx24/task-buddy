// Jest stand-ins for expo-file-system (File / Directory / Paths) and expo-sharing (TB-53).
// An in-memory "disk" keyed by URI, so tests can read back exactly what the export wrote and
// check that account deletion removes it. Use with:
//   jest.mock('expo-file-system', () => jest.requireActual('@/features/account/testing/expo-file-sharing-mock').fileSystem);
//   jest.mock('expo-sharing', () => jest.requireActual('@/features/account/testing/expo-file-sharing-mock').sharing);
export const disk = new Map<string, string>();
const directories = new Set<string>();

function join(parts: (string | { uri: string })[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : part.uri))
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

class FakeDirectory {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists(): boolean {
    return directories.has(this.uri);
  }
  create(): void {
    directories.add(this.uri);
  }
  delete(): void {
    directories.delete(this.uri);
    for (const key of [...disk.keys()]) if (key.startsWith(`${this.uri}/`)) disk.delete(key);
  }
}

class FakeFile {
  readonly uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts);
  }
  get exists(): boolean {
    return disk.has(this.uri);
  }
  create(): void {
    disk.set(this.uri, '');
  }
  write(content: string): void {
    disk.set(this.uri, content);
  }
}

export const fileSystem = {
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: { cache: new FakeDirectory('file:///cache') },
};

export const sharing = {
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async (_url: string, _options?: object) => undefined),
};

/** Clears the fake disk and the sharing mocks' calls and implementations. */
export function resetFileSharingMock(): void {
  disk.clear();
  directories.clear();
  sharing.isAvailableAsync.mockReset().mockImplementation(async () => true);
  sharing.shareAsync.mockReset().mockImplementation(async () => undefined);
}
