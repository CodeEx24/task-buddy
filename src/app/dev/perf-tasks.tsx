// Dev-only: seed 500 tasks for the TB-27 AC3 scroll check. Not available in release builds.
import { PerfTasksDevScreen } from '@/features/tasks/components/PerfTasksDevScreen';

import NotFoundScreen from '../+not-found';

export default function PerfTasksRoute() {
  return __DEV__ ? <PerfTasksDevScreen /> : <NotFoundScreen />;
}
