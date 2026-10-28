// Jest stand-in for @sentry/react-native (TB-37). The real SDK ships ESM (@sentry/core) that the
// jest-expo transform skips, and the app never starts it without a DSN anyway. Tests that assert
// on the SDK calls (src/lib/sentry-reporter.test.ts) read these mocks.
import type { ComponentType } from 'react';

export const init = jest.fn();
export const captureException = jest.fn();
export const nativeCrash = jest.fn();
export const wrap = jest.fn(<P>(component: ComponentType<P>) => component);
