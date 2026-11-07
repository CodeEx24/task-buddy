// TB-23 (https://stratyge.atlassian.net/browse/TB-23): the friendly notice for a 429 from the gateway.
import { render, screen } from '@testing-library/react-native';

import { mapGatewayError } from '../gateway-errors';

import { AiErrorNotice } from './AiErrorNotice';

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name] ?? null,
});

describe('AiErrorNotice', () => {
  it('AC1: shows a friendly message for the 31st call (429 RATE_LIMITED + Retry-After)', async () => {
    const error = mapGatewayError(429, headers({ 'Retry-After': '2700' }), {
      requestId: 'req-31',
      error: { code: 'RATE_LIMITED', message: 'Too many AI requests.' },
    });
    await render(<AiErrorNotice error={error} />);
    expect(
      screen.getByRole('header', { name: 'Your buddy needs a short break' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(/Try again in about 45 minutes/);
    // The gateway's code and raw message are not shown.
    expect(screen.queryByText(/RATE_LIMITED/)).toBeNull();
  });

  it('shows the daily allowance message for QUOTA_EXCEEDED', async () => {
    const error = mapGatewayError(429, headers({ 'Retry-After': '7200' }), {
      requestId: 'r',
      error: { code: 'QUOTA_EXCEEDED', message: 'x' },
    });
    await render(<AiErrorNotice error={error} />);
    expect(
      screen.getByRole('header', { name: "You've used today's AI allowance" }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('alert')).toHaveTextContent(/resets at midnight UTC, in about 2 hours/);
  });
});
