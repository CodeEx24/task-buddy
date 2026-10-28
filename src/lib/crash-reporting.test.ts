import {
  captureException,
  initCrashReporting,
  isCrashReportingEnabled,
  isTestCrashAvailable,
  resetCrashReportingForTests,
  triggerTestCrash,
  wrapRoot,
  type CrashReporter,
} from './crash-reporting';
import { sentryReporter } from './sentry-reporter';

jest.mock('./sentry-reporter', () => ({
  sentryReporter: {
    init: jest.fn(),
    captureException: jest.fn(),
    wrapRoot: jest.fn(),
    nativeCrash: jest.fn(),
  },
}));

const DSN = `https://${'ab12'.repeat(8)}@o1.ingest.sentry.io/42`;

const Root = () => null;
const Wrapped = () => null;

function fakeReporter() {
  return {
    init: jest.fn(),
    captureException: jest.fn(),
    wrapRoot: jest.fn(() => Wrapped),
    nativeCrash: jest.fn(),
  } satisfies CrashReporter;
}

afterEach(() => {
  resetCrashReportingForTests();
  jest.clearAllMocks();
});

describe('crash reporting disabled (no DSN)', () => {
  it('does not initialise the vendor and every call is a safe no-op', () => {
    const reporter = fakeReporter();
    expect(initCrashReporting({ appEnv: 'production', sentryDsn: undefined }, reporter)).toBe(
      false,
    );
    expect(isCrashReportingEnabled()).toBe(false);
    expect(reporter.init).not.toHaveBeenCalled();

    expect(() => captureException(new Error('x'))).not.toThrow();
    expect(reporter.captureException).not.toHaveBeenCalled();
    expect(wrapRoot(Root)).toBe(Root);
    expect(() => triggerTestCrash('native')).toThrow('TB-37 test crash (native)');
    expect(reporter.nativeCrash).not.toHaveBeenCalled();
  });

  it('stays off with the real env reader when EXPO_PUBLIC_SENTRY_DSN is unset or invalid', () => {
    const saved = process.env.EXPO_PUBLIC_SENTRY_DSN;
    try {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
      expect(initCrashReporting()).toBe(false);
      process.env.EXPO_PUBLIC_SENTRY_DSN = 'not-a-dsn';
      expect(initCrashReporting()).toBe(false);
      expect(sentryReporter.init).not.toHaveBeenCalled();
    } finally {
      if (saved === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
      else process.env.EXPO_PUBLIC_SENTRY_DSN = saved;
    }
  });
});

describe('crash reporting enabled', () => {
  it('initialises once with the DSN and environment', () => {
    const reporter = fakeReporter();
    expect(initCrashReporting({ appEnv: 'staging', sentryDsn: DSN }, reporter)).toBe(true);
    expect(initCrashReporting({ appEnv: 'staging', sentryDsn: DSN }, reporter)).toBe(true);
    expect(reporter.init).toHaveBeenCalledTimes(1);
    expect(reporter.init).toHaveBeenCalledWith({ dsn: DSN, environment: 'staging' });
    expect(isCrashReportingEnabled()).toBe(true);
  });

  it('reports "unknown" when the app env is missing', () => {
    const reporter = fakeReporter();
    initCrashReporting({ appEnv: undefined, sentryDsn: DSN }, reporter);
    expect(reporter.init).toHaveBeenCalledWith({ dsn: DSN, environment: 'unknown' });
  });

  it('forwards captureException and wrapRoot to the vendor', () => {
    const reporter = fakeReporter();
    initCrashReporting({ appEnv: 'development', sentryDsn: DSN }, reporter);
    const error = new Error('handled');
    captureException(error, { area: 'sync' });
    expect(reporter.captureException).toHaveBeenCalledWith(error, { area: 'sync' });
    expect(wrapRoot(Root)).toBe(Wrapped);
    expect(reporter.wrapRoot).toHaveBeenCalledWith(Root);
  });

  it('triggers a native crash through the vendor, and a plain JS error', () => {
    const reporter = fakeReporter();
    initCrashReporting({ appEnv: 'staging', sentryDsn: DSN }, reporter);
    // The real native crash never returns; the fake does, so the fallback throw is reached.
    expect(() => triggerTestCrash('native')).toThrow('TB-37 test crash (native)');
    expect(reporter.nativeCrash).toHaveBeenCalledTimes(1);
    expect(() => triggerTestCrash('js')).toThrow('TB-37 test crash (js)');
    expect(reporter.nativeCrash).toHaveBeenCalledTimes(1);
  });
});

describe('isTestCrashAvailable', () => {
  it.each([
    [true, 'production', true],
    [false, 'development', true],
    [false, 'staging', true],
    [false, 'production', false],
    [false, undefined, false],
  ] as const)('isDev=%s appEnv=%s → %s', (isDev, appEnv, expected) => {
    expect(isTestCrashAvailable(isDev, appEnv)).toBe(expected);
  });
});
