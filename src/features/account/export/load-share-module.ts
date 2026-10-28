// Loads the export module on first use (TB-53). It imports expo-sharing and expo-file-system,
// native modules added by TB-53: loading them lazily means a binary built before them (an older
// dev client, or an update running on an old build) still starts, and only Export reports a
// failure. Metro turns this `require` into a normal lazy module load.
export type ShareModule = typeof import('./share-data-export');

/** Throws if the native modules are missing from this binary. */
export function loadShareModule(): ShareModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./share-data-export') as ShareModule;
}
