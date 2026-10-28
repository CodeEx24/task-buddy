import { View } from 'react-native';

/**
 * Jest stand-in for `@expo/vector-icons/Ionicons` (TB-18). The real icon loads its font through
 * expo-font/expo-asset on mount, which fails under Jest ("missing from the asset registry").
 * Renders an empty view tagged with the glyph name so tests can assert which icon is shown.
 *
 * Use in any test that renders the tab bar:
 *   jest.mock('@expo/vector-icons/Ionicons', () =>
 *     jest.requireActual('@/features/navigation/testing/ionicons-mock'),
 *   );
 */
function IoniconsMock({ name }: { name: string }) {
  return <View testID={`icon-${name}`} />;
}

export default IoniconsMock;
