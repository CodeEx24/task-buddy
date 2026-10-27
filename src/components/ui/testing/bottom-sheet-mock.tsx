/**
 * Jest stand-in for `@gorhom/bottom-sheet` (TB-17). The library's own mock always renders its
 * children and ignores backdrops, so it cannot prove open/close behaviour. This one tracks the
 * presented state, renders the backdrop and background, and calls `onDismiss` like the library.
 */
import {
  createContext,
  useContext,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

type BackdropProps = { pressBehavior?: 'none' | 'close' | 'collapse' | number };

type ModalProps = {
  ref?: Ref<{ present: () => void; dismiss: () => void }>;
  children?: ReactNode;
  onDismiss?: () => void;
  backdropComponent?: (props: Record<string, unknown>) => ReactNode;
  backgroundStyle?: StyleProp<ViewStyle>;
  handleIndicatorStyle?: StyleProp<ViewStyle>;
  accessible?: boolean;
  accessibilityRole?: ViewProps['accessibilityRole'];
  accessibilityLabel?: string;
};

// Library defaults (bottomSheet/constants.ts): the content container is one accessible
// "adjustable" element labelled "Bottom Sheet" unless the caller overrides it.
const DEFAULT_ACCESSIBLE = true;
const DEFAULT_ACCESSIBILITY_ROLE = 'adjustable';
const DEFAULT_ACCESSIBILITY_LABEL = 'Bottom Sheet';

const DismissContext = createContext<() => void>(() => {});

export function BottomSheetModalProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function BottomSheetModal({
  ref,
  children,
  onDismiss,
  backdropComponent,
  backgroundStyle,
  handleIndicatorStyle,
  accessible = DEFAULT_ACCESSIBLE,
  accessibilityRole = DEFAULT_ACCESSIBILITY_ROLE,
  accessibilityLabel = DEFAULT_ACCESSIBILITY_LABEL,
}: ModalProps) {
  const [isPresented, setIsPresented] = useState(false);
  const isPresentedRef = useRef(false);

  const present = () => {
    isPresentedRef.current = true;
    setIsPresented(true);
  };

  // Side effects stay outside state updaters (StrictMode-safe).
  const dismiss = () => {
    if (!isPresentedRef.current) return;
    isPresentedRef.current = false;
    setIsPresented(false);
    onDismiss?.();
  };

  useImperativeHandle(ref, () => ({ present, dismiss }));

  if (!isPresented) return null;
  return (
    <DismissContext.Provider value={dismiss}>
      {backdropComponent?.({ animatedIndex: { value: 0 }, animatedPosition: { value: 0 } })}
      <View
        testID="bottom-sheet-background"
        style={backgroundStyle}
        accessible={accessible}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
      >
        <View testID="bottom-sheet-handle" style={handleIndicatorStyle} />
        {children}
      </View>
    </DismissContext.Provider>
  );
}

export function BottomSheetBackdrop({ pressBehavior = 'close' }: BackdropProps) {
  const dismiss = useContext(DismissContext);
  return (
    <Pressable
      testID="bottom-sheet-backdrop"
      onPress={() => {
        if (pressBehavior === 'close') dismiss();
      }}
    />
  );
}

export function BottomSheetView(props: ViewProps) {
  return <View {...props} />;
}
