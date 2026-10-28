import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { renderWithQuery } from '@/features/tasks/testing/task-test-utils';

import { SETTINGS_PAGES } from '../registry/pages';
import { SETTINGS_SECTIONS } from '../registry/sections';
import type { SettingsSectionDefinition } from '../registry/types';
import { SIGNED_OUT_EMAIL_LABEL } from './AccountEmailRow';
import { SettingsScreen } from './SettingsScreen';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockRouter = jest.mocked(router);

beforeEach(() => jest.clearAllMocks());

describe('SettingsScreen (TB-32)', () => {
  it('shows the Account section with the account email (AC1)', async () => {
    await renderWithQuery(<SettingsScreen />);

    const account = screen.getByTestId('settings-section-account');
    expect(within(account).getByRole('header', { name: 'Account' })).toBeVisible();
    expect(within(account).getByText('Email')).toBeVisible();
    // Nobody can sign in until TB-20 ships; then this shows the session's email.
    expect(within(account).getByTestId('settings-account-email-value')).toHaveTextContent(
      SIGNED_OUT_EMAIL_LABEL,
    );
  });

  it('lists every registered preference page and opens it on tap (AC1)', async () => {
    await renderWithQuery(<SettingsScreen />);

    const preferences = screen.getByTestId('settings-section-preferences');
    expect(SETTINGS_PAGES.length).toBeGreaterThan(0);
    for (const page of SETTINGS_PAGES) {
      expect(within(preferences).getByRole('button', { name: page.title })).toBeVisible();
      expect(within(preferences).getByText(page.description)).toBeVisible();
    }

    await fireEvent.press(screen.getByTestId('settings-row-appearance'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/appearance');
  });

  it('renders sections and rows straight from the registry, in order (AC3)', async () => {
    function LaterStoryRow() {
      return <Text>Row added by a later story</Text>;
    }
    const sections: SettingsSectionDefinition[] = [
      ...SETTINGS_SECTIONS,
      {
        id: 'notifications',
        title: 'Notifications',
        rows: [
          { kind: 'custom', id: 'later-row', Component: LaterStoryRow },
          {
            kind: 'page',
            page: {
              slug: 'quiet-hours',
              title: 'Quiet hours',
              description: 'No check-ins at night',
              Component: LaterStoryRow,
            },
          },
        ],
      },
    ];

    await renderWithQuery(<SettingsScreen sections={sections} />);

    const titles = screen.getAllByRole('header').map((h) => h.props.children);
    expect(titles).toEqual(['Settings', 'Account', 'Preferences', 'Notifications']);
    const added = screen.getByTestId('settings-section-notifications');
    expect(within(added).getByText('Row added by a later story')).toBeVisible();
    await fireEvent.press(within(added).getByRole('button', { name: 'Quiet hours' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/quiet-hours');
  });
});
