import { PlaceholderScreen } from './PlaceholderScreen';

/** Inbox tab. Placeholder until TB-27 (Today and Inbox screens) replaces it. */
export function InboxScreen() {
  return (
    <PlaceholderScreen
      testID="inbox-screen"
      title="Inbox"
      note="Tasks without a day will collect here."
    />
  );
}
