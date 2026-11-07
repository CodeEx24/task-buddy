import { AuthApiError } from '@supabase/supabase-js';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { UiProvider } from '@/components/ui';

import { SIGN_IN_COPY, SIGN_IN_ERRORS } from '../copy';
import { getFakeAuth } from '../testing/fake-auth';
import { MAX_WRONG_CODES_PER_SEND, SignInScreen } from './SignInScreen';

async function renderAtCodeStep() {
  await render(
    <UiProvider>
      <SignInScreen />
    </UiProvider>,
  );
  await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'jane@example.com');
  await fireEvent.press(screen.getByTestId('sign-in-send'));
  expect(screen.getByTestId('sign-in-code-step')).toBeOnTheScreen();
}

beforeEach(() => {
  jest.useFakeTimers();
  getFakeAuth().control.reset({ signedIn: false });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SignInScreen resend (TB-20 AC2)', () => {
  it('unlocks "Resend code" only after 30 seconds, then sends again and restarts the wait', async () => {
    const fake = getFakeAuth();
    await renderAtCodeStep();

    const resend = () => screen.getByTestId('sign-in-resend');
    expect(resend()).toBeDisabled();
    expect(resend()).toHaveTextContent(SIGN_IN_COPY.resendIn(30));

    await act(() => jest.advanceTimersByTime(29_000));
    expect(resend()).toBeDisabled();
    expect(resend()).toHaveTextContent(SIGN_IN_COPY.resendIn(1));

    await act(() => jest.advanceTimersByTime(1_000));
    expect(resend()).toBeEnabled();
    expect(resend()).toHaveTextContent(SIGN_IN_COPY.resend);

    await fireEvent.press(resend());
    expect(fake.mocks.signInWithOtp).toHaveBeenCalledTimes(2);
    expect(screen.getByText(SIGN_IN_COPY.codeResent)).toBeOnTheScreen();
    expect(resend()).toBeDisabled();
  });

  it('shows a rate-limit error inline when the server refuses the resend', async () => {
    await renderAtCodeStep();
    await act(() => jest.advanceTimersByTime(30_000));
    getFakeAuth().control.failNextSend(new AuthApiError('wait', 429, 'over_email_send_rate_limit'));

    await fireEvent.press(screen.getByTestId('sign-in-resend'));

    expect(screen.getByText(SIGN_IN_ERRORS.rateLimitedVerify)).toBeOnTheScreen();
  });

  it('"Use a different email" goes back with the email kept', async () => {
    await renderAtCodeStep();
    await fireEvent.press(screen.getByTestId('sign-in-change-email'));
    expect(screen.getByTestId('sign-in-email')).toHaveDisplayValue('jane@example.com');
  });

  it('shows an inline error and stays on the email step when offline', async () => {
    await render(
      <UiProvider>
        <SignInScreen />
      </UiProvider>,
    );
    getFakeAuth().mocks.signInWithOtp.mockRejectedValueOnce(
      new TypeError('Network request failed'),
    );
    await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'jane@example.com');
    await fireEvent.press(screen.getByTestId('sign-in-send'));
    expect(screen.getByText(SIGN_IN_ERRORS.network)).toBeOnTheScreen();
    expect(screen.getByTestId('sign-in-email-step')).toBeOnTheScreen();
  });
});

describe('SignInScreen wrong-code lockout (TB-20 security review)', () => {
  it('after 5 wrong codes, verifying is disabled until a new code is sent', async () => {
    const fake = getFakeAuth();
    await renderAtCodeStep();
    expect(MAX_WRONG_CODES_PER_SEND).toBe(5);

    for (let i = 1; i <= MAX_WRONG_CODES_PER_SEND; i += 1) {
      await fireEvent.changeText(screen.getByTestId('sign-in-code'), `00000${i}`);
    }
    expect(fake.mocks.verifyOtp).toHaveBeenCalledTimes(MAX_WRONG_CODES_PER_SEND);
    expect(screen.getByText(SIGN_IN_ERRORS.invalidCode)).toBeOnTheScreen();
    expect(screen.getByTestId('sign-in-verify')).toBeDisabled();

    // A sixth code (even the right one) is not sent while locked out.
    await fireEvent.changeText(screen.getByTestId('sign-in-code'), '123456');
    await fireEvent.press(screen.getByTestId('sign-in-verify'));
    expect(fake.mocks.verifyOtp).toHaveBeenCalledTimes(MAX_WRONG_CODES_PER_SEND);
    expect(fake.control.session).toBeNull();

    // Resend (after the 30 s wait) resets the counter.
    await act(() => jest.advanceTimersByTime(30_000));
    await fireEvent.press(screen.getByTestId('sign-in-resend'));
    await fireEvent.changeText(screen.getByTestId('sign-in-code'), '123456');
    expect(fake.mocks.verifyOtp).toHaveBeenCalledTimes(MAX_WRONG_CODES_PER_SEND + 1);
    expect(fake.control.session).not.toBeNull();
  });

  it('a failed resend does not reset the lockout', async () => {
    const fake = getFakeAuth();
    await renderAtCodeStep();
    for (let i = 1; i <= MAX_WRONG_CODES_PER_SEND; i += 1) {
      await fireEvent.changeText(screen.getByTestId('sign-in-code'), `00000${i}`);
    }
    await act(() => jest.advanceTimersByTime(30_000));
    fake.control.failNextSend(new AuthApiError('wait', 429, 'over_email_send_rate_limit'));
    await fireEvent.press(screen.getByTestId('sign-in-resend'));
    expect(screen.getByTestId('sign-in-verify')).toBeDisabled();
  });
});
