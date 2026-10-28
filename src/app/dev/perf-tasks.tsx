// Seeds 500 tasks for the TB-27 AC3 scroll check. Shown in dev builds and in EAS `preview`
// (staging) release builds, so AC3 can be measured on a phone; hidden in production.
import { PerfTasksDevScreen } from '@/features/tasks/components/PerfTasksDevScreen';
import { canShowPerfTools } from '@/features/tasks/perf-tools';
import { getEnv } from '@/lib/env';

import NotFoundScreen from '../+not-found';

export default function PerfTasksRoute() {
  return canShowPerfTools(__DEV__, getEnv) ? <PerfTasksDevScreen /> : <NotFoundScreen />;
}
