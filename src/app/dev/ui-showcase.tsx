// Dev-only design-system showcase (TB-17; the Today tab placeholder until TB-27).
// Not available in release builds.
import { UiShowcaseScreen } from '@/features/showcase/components/UiShowcaseScreen';

import NotFoundScreen from '../+not-found';

export default function UiShowcaseRoute() {
  return __DEV__ ? <UiShowcaseScreen /> : <NotFoundScreen />;
}
