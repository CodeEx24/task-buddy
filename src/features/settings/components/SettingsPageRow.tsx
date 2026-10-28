import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

import { settingsPageHref } from '../registry/pages';
import type { SettingsPageDefinition } from '../registry/types';

/** A row that opens a preference page (`/settings/<slug>`). */
export function SettingsPageRow({ page }: { page: SettingsPageDefinition }) {
  const { colors } = useTheme();
  const { slug, title, description } = page;
  return (
    <Pressable
      testID={`settings-row-${slug}`}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={() => router.push(settingsPageHref(slug))}
      style={{ minHeight: MIN_TOUCH_TARGET }}
      className="flex-row items-center gap-md py-xs active:opacity-80"
    >
      <View className="flex-1 gap-xs">
        <Text className="text-base font-medium text-text">{title}</Text>
        <Text className="text-sm text-text-muted">{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}
