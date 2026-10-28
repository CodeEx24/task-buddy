import { Stack } from 'expo-router';

// Signed-out screens (TB-20). The root layout only shows this group when there is no session.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
