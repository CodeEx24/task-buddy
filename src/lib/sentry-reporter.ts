// Sentry implementation of CrashReporter (TB-37, https://stratyge.atlassian.net/browse/TB-37).
// Only src/lib/crash-reporting.ts imports this; the rest of the app uses that module's API.
import * as Sentry from '@sentry/react-native';

import type { CrashReporter } from './crash-reporting';
import { scrubBreadcrumb, scrubEvent } from './crash-scrubber';

export const sentryReporter: CrashReporter = {
  init({ dsn, environment }) {
    Sentry.init({
      dsn,
      environment,
      // Release and dist stay the SDK defaults (native app id @ version + build number), which
      // is what the EAS build's source-map upload tags its artifacts with.
      sendDefaultPii: false,
      // Release health: crash-free sessions per release.
      enableAutoSessionTracking: true,
      // Tracing, profiling, replay, logs, screenshots and view hierarchy stay off (spec decisions).
      attachScreenshot: false,
      attachViewHierarchy: false,
      reportAccessibilityIdentifier: false,
      enableLogs: false,
      maxBreadcrumbs: 50,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    });
  },
  captureException(error, tags) {
    Sentry.captureException(error, tags ? { tags } : undefined);
  },
  wrapRoot(component) {
    // Touch breadcrumbs must not copy on-screen text (task titles) into the label.
    return Sentry.wrap(component, { touchEventBoundaryProps: { extractTextFromChildren: false } });
  },
  nativeCrash() {
    Sentry.nativeCrash();
  },
};
