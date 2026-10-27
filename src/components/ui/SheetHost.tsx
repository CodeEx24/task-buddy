import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';

type SheetHostApi = {
  /** Shows `node` above the app under `key`, replaces it if the key exists, or removes it (`null`). */
  setSheet: (key: string, node: ReactNode | null) => void;
};

type Entry = { key: string; node: ReactNode };

const SheetHostContext = createContext<SheetHostApi | null>(null);

/**
 * Renders open sheets above the app (TB-17). `UiProvider` mounts it once.
 *
 * Replaces `@gorhom/bottom-sheet`'s modal portal, which never drew the sheet on our stack
 * (RN 0.88, React 19.3). The plain `BottomSheet` works, so `Sheet` renders it here instead.
 * State updates are immutable so React always sees a change.
 */
export function SheetHost({ children }: { children?: ReactNode }) {
  const [entries, setEntries] = useState<readonly Entry[]>([]);

  const setSheet = useCallback((key: string, node: ReactNode | null) => {
    setEntries((previous) => {
      const exists = previous.some((entry) => entry.key === key);
      if (node === null) {
        return exists ? previous.filter((entry) => entry.key !== key) : previous;
      }
      return exists
        ? previous.map((entry) => (entry.key === key ? { key, node } : entry))
        : [...previous, { key, node }];
    });
  }, []);

  const api = useMemo(() => ({ setSheet }), [setSheet]);

  return (
    <SheetHostContext.Provider value={api}>
      {children}
      <View testID="sheet-host" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {entries.map((entry) => (
          <Fragment key={entry.key}>{entry.node}</Fragment>
        ))}
      </View>
    </SheetHostContext.Provider>
  );
}

export function useSheetHost(): SheetHostApi {
  const api = useContext(SheetHostContext);
  if (!api) {
    throw new Error('Sheet must be rendered inside UiProvider (it provides the SheetHost).');
  }
  return api;
}
