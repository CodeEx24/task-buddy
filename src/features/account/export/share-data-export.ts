// Export my data (TB-53 AC1): writes the export document to a JSON file in the app's cache and
// opens the OS share sheet for it (expo-sharing; RN's built-in Share can't share a file on
// Android). Works offline: everything comes from the local DB. The file lives in its own cache
// folder, so account deletion can remove every export left on the device (`deleteDataExports`).
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDb } from '@/db/client';
import type { TaskBuddyDb } from '@/db/types';

import { readExportSnapshot } from '../repo/export-repo';
import { buildDataExport, dataExportFileName } from './build-data-export';

export const DATA_EXPORT_DIRECTORY = 'data-export';
export const DATA_EXPORT_MIME_TYPE = 'application/json';

export type DataExportResult =
  { ok: true; counts: { tasks: number } } | { ok: false; reason: 'unavailable' | 'failed' };

function exportDirectory(): Directory {
  return new Directory(Paths.cache, DATA_EXPORT_DIRECTORY);
}

/**
 * Builds the export from `db` and shares it. Resolves once the share sheet is dismissed (iOS) or
 * handed to the chooser (Android); whether the user then sent it anywhere is not reported.
 */
export async function shareDataExport(
  options: { db?: TaskBuddyDb; now?: number; dialogTitle?: string } = {},
): Promise<DataExportResult> {
  if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'unavailable' };
  try {
    const now = options.now ?? Date.now();
    const document = buildDataExport(readExportSnapshot(options.db ?? getDb()), now);

    const directory = exportDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, dataExportFileName(now));
    file.create({ overwrite: true });
    file.write(JSON.stringify(document, null, 2));

    await Sharing.shareAsync(file.uri, {
      mimeType: DATA_EXPORT_MIME_TYPE,
      UTI: 'public.json',
      ...(options.dialogTitle ? { dialogTitle: options.dialogTitle } : {}),
    });
    return { ok: true, counts: { tasks: document.counts.tasks } };
  } catch (error) {
    // Class name only: messages could contain file paths; never task content.
    console.warn('[export] failed', { name: error instanceof Error ? error.name : typeof error });
    return { ok: false, reason: 'failed' };
  }
}

/** Removes every export file this app wrote to its cache (account deletion). Never throws. */
export function deleteDataExports(): void {
  try {
    const directory = exportDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // Cache files are also cleared by the OS; nothing useful to report.
  }
}
