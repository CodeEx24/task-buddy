/**
 * Jest stand-in for `@gorhom/bottom-sheet` (TB-17). The library's own mock always renders its
 * children and ignores backdrops, so it cannot prove open/close behaviour. This one tracks the
 * current index, renders the backdrop and background, and calls `onChange(-1)` when it closes,
 * like the library does at the end of its close animation.
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

type SheetMethods = { close: () => void; snapToIndex: (index: number) => void };

type SheetProps = {
  ref?: Ref<SheetMethods>;
  index?: number;
  children?: ReactNode;
  onChange?: (index: number) => void;
  enablePanDownToClose?: boolean;
  backdropComponent?: (props: Record<string, unknown>) => ReactNode;
  backgroundStyle?: StyleProp<ViewStyle>;
  handleIndicatorStyle?: StyleProp<ViewStyle>;
  accessible?: boolean;
  accessibilityRole?: ViewProps['accessibilityRole'];
  accessibilityLabel?: string;
};

const CLOSED_INDEX = -1;

// Library defaults (bottomSheet/constants.ts): the content container is one accessible
// "adjustable" element labelled "Bottom Sheet" unless the caller overrides it.
const DEFAULT_ACCESSIBLE = true;
const DEFAULT_ACCESSIBILITY_ROLE = 'adjustable';
const DEFAULT_ACCESSIBILITY_LABEL = 'Bottom Sheet';

const CloseContext = createContext<() => void>(() => {});

export default function BottomSheet({
  ref,
  index = 0,
  children,
  onChange,
  backdropComponent,
  backgroundStyle,
  handleIndicatorStyle,
  accessible = DEFAULT_ACCESSIBLE,
  accessibilityRole = DEFAULT_ACCESSIBILITY_ROLE,
  accessibilityLabel = DEFAULT_ACCESSIBILITY_LABEL,
}: SheetProps) {
  const [currentIndex, setCurrentIndex] = useState(index);
  const currentIndexRef = useRef(index);

  // Side effects stay outside state updaters (StrictMode-safe).
  const snapToIndex = (next: number) => {
    if (currentIndexRef.current === next) return;
    currentIndexRef.current = next;
    setCurrentIndex(next);
    onChange?.(next);
  };
  const close = () => snapToIndex(CLOSED_INDEX);

  useImperativeHandle(ref, () => ({ close, snapToIndex }));

  if (currentIndex === CLOSED_INDEX) return null;
  return (
    <CloseContext.Provider value={close}>
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
    </CloseContext.Provider>
  );
}

export function BottomSheetBackdrop({ pressBehavior = 'close' }: BackdropProps) {
  const close = useContext(CloseContext);
  return (
    <Pressable
      testID="bottom-sheet-backdrop"
      onPress={() => {
        if (pressBehavior === 'close') close();
      }}
    />
  );
}

export function BottomSheetView(props: ViewProps) {
  return <View {...props} />;
}
