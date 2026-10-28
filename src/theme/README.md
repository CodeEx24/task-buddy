# src/theme

Theme tokens (colours, spacing, typography) for light/dark. Owner: TB-17.

In-app light/dark choice (TB-32): call `setColorSchemePreference('system' | 'light' | 'dark')`; `useTheme` (and so `UiProvider`'s colour variables) re-renders every mounted screen at once. Don't use `Appearance.setColorScheme` for the app theme: on React Native 0.88 Android it emits no change event for mounted screens and forces a native night-mode configuration change that clipped text.
