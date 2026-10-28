// Pending "undo delete" offer (TB-26 AC3). UI state only: the delete itself is already written
// to SQLite (soft delete); this store just remembers which task the snackbar can bring back.
import { create } from 'zustand';

/** How long the Undo action stays available after a delete. */
export const UNDO_WINDOW_MS = 5000;

export type UndoOffer = {
  /** Distinguishes repeated deletes, so an old timer never hides a newer offer. */
  token: number;
  taskId: string;
};

type UndoState = {
  offer: UndoOffer | null;
  /** Shows the undo snackbar for `taskId`, replacing any earlier offer. */
  offerUndo: (taskId: string) => void;
  /** Hides the snackbar (after Undo, or when it expires). */
  dismissUndo: () => void;
};

let nextToken = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

export const useUndoStore = create<UndoState>()((set, get) => ({
  offer: null,
  offerUndo: (taskId) => {
    const token = nextToken++;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (get().offer?.token === token) set({ offer: null });
    }, UNDO_WINDOW_MS);
    set({ offer: { token, taskId } });
  },
  dismissUndo: () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    set({ offer: null });
  },
}));
