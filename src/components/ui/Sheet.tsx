import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useEffect, useRef, type ReactNode } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { themeVars, useTheme } from '@/theme';

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

function renderBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
    />
  );
}

/**
 * Controlled bottom sheet (`@gorhom/bottom-sheet` modal). Needs `UiProvider` above it.
 * Closes on backdrop press, swipe down, the Android hardware back button and the iOS
 * accessibility escape gesture.
 *
 * Known limit: screen readers can still reach app content behind the sheet (no focus trap yet).
 */
export function Sheet({ open, onOpenChange, title, children, testID }: SheetProps) {
  const { colors, scheme } = useTheme();
  const modalRef = useRef<BottomSheetModal>(null);
  // Lets onDismiss tell a user-initiated close apart from one the parent already made.
  const isOpenRef = useRef(open);

  // Sync the controlled prop with the library's imperative API.
  useEffect(() => {
    isOpenRef.current = open;
    if (open) {
      modalRef.current?.present();
    } else {
      modalRef.current?.dismiss();
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

  const handleDismiss = () => {
    if (isOpenRef.current) {
      isOpenRef.current = false;
      onOpenChange(false);
    }
  };

  return (
    <BottomSheetModal
      ref={modalRef}
      onDismiss={handleDismiss}
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
          through a portal, so the theme variables are re-applied instead of relying on context.
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
    </BottomSheetModal>
  );
}
