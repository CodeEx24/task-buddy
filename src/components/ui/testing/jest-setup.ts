// Jest setup for the design system (TB-17): gesture-handler and bottom-sheet need mocks in Node.
import 'react-native-gesture-handler/jestSetup';

jest.mock('@gorhom/bottom-sheet', () => jest.requireActual('./bottom-sheet-mock'));
// TB-27: swipeable list rows (see swipe-row-mock.tsx).
jest.mock('../SwipeRow', () => jest.requireActual('./swipe-row-mock'));
