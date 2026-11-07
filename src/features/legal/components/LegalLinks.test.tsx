import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { LEGAL_URLS } from '../legal-config';
import { LegalLinks, SIGN_IN_AGREEMENT } from './LegalLinks';

describe('LegalLinks (TB-54)', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(() => {
    openURL.mockRestore();
  });

  it.each([
    ['Privacy Policy', LEGAL_URLS.privacy],
    ['Terms of Use', LEGAL_URLS.terms],
    ['How AI uses your data', LEGAL_URLS.ai],
  ])('opens "%s" at its published URL', async (name, url) => {
    await render(<LegalLinks />);
    await fireEvent.press(screen.getByRole('button', { name }));
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(url);
  });

  it('tells screen-reader users the link leaves the app', async () => {
    await render(<LegalLinks />);
    expect(screen.getByRole('button', { name: 'Privacy Policy' })).toHaveProp(
      'accessibilityHint',
      'Opens in your browser',
    );
  });

  it('shows the agreement line only on sign-in', async () => {
    await render(<LegalLinks />);
    expect(screen.queryByText(SIGN_IN_AGREEMENT)).toBeNull();

    await render(<LegalLinks context="sign-in" />);
    expect(screen.getByText(SIGN_IN_AGREEMENT)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Terms of Use' })).toBeOnTheScreen();
  });

  it('shows the URL when the browser cannot be opened, and clears it on the next try', async () => {
    openURL.mockRejectedValueOnce(new Error('No browser'));
    await render(<LegalLinks />);

    await fireEvent.press(screen.getByRole('button', { name: 'Terms of Use' }));
    await waitFor(() =>
      expect(screen.getByTestId('legal-links-error')).toHaveTextContent(
        `Couldn't open the page. You can read it at ${LEGAL_URLS.terms}`,
      ),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Terms of Use' }));
    await waitFor(() => expect(screen.queryByTestId('legal-links-error')).toBeNull());
  });
});
