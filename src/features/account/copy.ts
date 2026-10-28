// User-facing strings for export and account deletion (TB-53), kept together for review. The
// deletion text must match the privacy policy's "Deleting your account" section (TB-54 §9).
export const EXPORT_COPY = {
  button: 'Export my data',
  hint: 'Saves your tasks, lists and steps as a JSON file you can share or keep.',
  dialogTitle: 'Export Task Buddy data',
  unavailable: "Sharing isn't available on this device.",
  failed: "Couldn't create the export. Please try again.",
} as const;

export const DELETE_ACCOUNT_COPY = {
  button: 'Delete account',
  confirmTitle: 'Delete your account?',
  confirmMessage:
    'This permanently deletes your account, your synced tasks, lists and steps, and your AI ' +
    'usage records from our servers, and removes your data from this device. It cannot be ' +
    'undone. To keep a copy, cancel and use "Export my data" first.',
  cancel: 'Cancel',
  confirm: 'Delete',
  failedTitle: 'Account not deleted',
  offline: "You're offline. Connect to the internet and try again. Nothing was deleted.",
  session: 'Your session has expired. Sign out, sign in again, then delete your account.',
  failed: 'Something went wrong and nothing was deleted. Please try again.',
  ok: 'OK',
} as const;
