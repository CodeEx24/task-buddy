import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { themeVars, useTheme } from '@/theme';

import { useSheetHost } from './SheetHost';

export type SheetProps = {
  /** Controlled visibility. */
  open: boolean;
  /**
   * Called with `false` when the user closes the sheet (backdrop, swipe down, back button,
   * iOS escape gesture). The parent must accept it (set `open` to false); the sheet is already
   * closing, and ignoring it leaves `open` stuck at true.
   */
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: ReactNode;
  testID?: string;
};

/** Index of the single open snap point; -1 is the library's "closed". */
const OPEN_INDEX = 0;
const CLOSED_INDEX = -1;

function renderBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={OPEN_INDEX}
      disappearsOnIndex={CLOSED_INDEX}
      pressBehavior="close"
    />
  );
}

/**
 * Controlled bottom sheet built on `@gorhom/bottom-sheet`'s plain `BottomSheet`, rendered above
 * the app by `SheetHost` (part of `UiProvider`, which must be above it). Mounted only while open
 * or closing. Closes on backdrop press, swipe down, the Android hardware back button and the iOS
 * accessibility escape gesture.
 *
 * Known limit: screen readers can still reach app content behind the sheet (no focus trap yet).
 */
export function Sheet({ open, onOpenChange, title, children, testID }: SheetProps) {
  const { colors, scheme } = useTheme();
  const { setSheet } = useSheetHost();
  const key = useId();
  const sheetRef = useRef<BottomSheet>(null);
  // Stays true through the close animation, so the sheet can slide out before it unmounts.
  const [isMounted, setIsMounted] = useState(open);
  if (open && !isMounted) setIsMounted(true);
  // Lets the close callback tell a user-initiated close apart from one the parent already made.
  const isOpenRef = useRef(open);

  // Sync the controlled prop with the library's imperative API. The first open animates on
  // mount (index 0); re-opening during a close animation snaps back up.
  useEffect(() => {
    isOpenRef.current = open;
    if (open) {
      sheetRef.current?.snapToIndex(OPEN_INDEX);
    } else {
      sheetRef.current?.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onOpenChange(false);
      return true;
    });
    return () => subscription.remove();
  }, [open, onOpenChange]);

  const handleChange = (index: number) => {
    if (index !== CLOSED_INDEX) return;
    setIsMounted(false);
    if (isOpenRef.current) {
      isOpenRef.current = false;
      onOpenChange(false);
    }
  };

  const node = isMounted ? (
    <BottomSheet
      ref={sheetRef}
      index={OPEN_INDEX}
      enablePanDownToClose
      onChange={handleChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.outline }}
      // The library groups the sheet into one "adjustable" element by default, which hides the
      // header and buttons inside it from VoiceOver. Keep the children individually reachable.
      accessible={false}
    >
      <BottomSheetView>
        {/*
          Core View: BottomSheetView is not NativeWind-interop, so classes go here. The sheet renders
          in SheetHost, so the theme variables are re-applied instead of relying on an ancestor.
        */}
        <View
          testID={testID}
          style={themeVars[scheme]}
          onAccessibilityEscape={() => onOpenChange(false)}
          className="gap-lg px-xl pb-2xl pt-sm"
        >
          <Text accessibilityRole="header" className="text-xl font-semibold text-text">
            {title}
          </Text>
          {children}
        </View>
      </BottomSheetView>
    </BottomSheet>
  ) : null;

  // Hand the latest sheet (props, theme, children) to the host after every render.
  useEffect(() => {
    setSheet(key, node);
  });

  // Remove it when the Sheet itself unmounts.
  useEffect(() => () => setSheet(key, null), [setSheet, key]);

  return null;
}
