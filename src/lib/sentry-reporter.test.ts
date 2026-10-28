import * as Sentry from '@sentry/react-native';

import { sentryReporter } from './sentry-reporter';

const mocked = jest.mocked(Sentry);
const DSN = `https://${'ab12'.repeat(8)}@o1.ingest.sentry.io/42`;

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
const initOptions = (): InitOptions => mocked.init.mock.calls[0]?.[0] as InitOptions;

beforeEach(() => jest.clearAllMocks());

describe('sentryReporter', () => {
  it('initialises Sentry with PII off, release health on and tracing off', () => {
    sentryReporter.init({ dsn: DSN, environment: 'staging' });
    const options = initOptions();
    expect(options).toMatchObject({
      dsn: DSN,
      environment: 'staging',
      sendDefaultPii: false,
      enableAutoSessionTracking: true,
      attachScreenshot: false,
      attachViewHierarchy: false,
    });
    expect(options.tracesSampleRate).toBeUndefined();
    // Release/dist come from the native build, matching the source-map upload.
    expect(options.release).toBeUndefined();
    expect(options.dist).toBeUndefined();
  });

  it('hooks the scrubber into beforeSend and beforeBreadcrumb', () => {
    sentryReporter.init({ dsn: DSN, environment: 'production' });
    const { beforeSend, beforeBreadcrumb } = initOptions();
    const event = beforeSend?.(
      { type: undefined, message: 'failed for ana@example.com', extra: { title: 'Buy a ring' } },
      {},
    );
    expect(JSON.stringify(event)).not.toMatch(/ana@example\.com|Buy a ring/);

    const crumb = beforeBreadcrumb?.({ category: 'console', message: 'Buy a ring' }, {});
    expect(JSON.stringify(crumb)).not.toContain('Buy a ring');
  });

  it('wraps the root without copying on-screen text into touch breadcrumbs', () => {
    const Root = () => null;
    sentryReporter.wrapRoot(Root);
    expect(mocked.wrap).toHaveBeenCalledWith(Root, {
      touchEventBoundaryProps: { extractTextFromChildren: false },
    });
  });

  it('forwards handled errors with tags, and the native crash trigger', () => {
    const error = new Error('x');
    sentryReporter.captureException(error, { area: 'db' });
    sentryReporter.captureException(error);
    expect(mocked.captureException).toHaveBeenNthCalledWith(1, error, { tags: { area: 'db' } });
    expect(mocked.captureException).toHaveBeenNthCalledWith(2, error, undefined);
    sentryReporter.nativeCrash();
    expect(mocked.nativeCrash).toHaveBeenCalledTimes(1);
  });
});
