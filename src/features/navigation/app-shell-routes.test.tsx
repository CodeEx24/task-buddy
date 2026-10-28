import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { BackHandler } from 'react-native';

import { INVALID_TASK_LINK_MESSAGE } from './components/TaskDetailModal';
import { APP_TABS, tabButtonTestId } from './tabs';

jest.mock('@expo/vector-icons/Ionicons', () =>
  jest.requireActual('@/features/navigation/testing/ionicons-mock'),
);

// Renders the real `src/app/` routes (resolved from the Jest rootDir, the repo root).
const APP_DIR = './src/app';
const TASK_ID = '0190f3b2-7c1a-7d4e-9b2f-3a6c8e1d5f42';

const SCREEN_TEST_IDS: Record<(typeof APP_TABS)[number]['name'], string> = {
  index: 'home-screen',
  inbox: 'inbox-screen',
  buddy: 'buddy-screen',
  settings: 'settings-screen',
};

/** Captures the listener React Navigation registers for the Android hardware back key. */
function captureHardwareBack() {
  type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
  const listeners: BackListener[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((eventName, handler) => {
    if (eventName === 'hardwareBackPress') listeners.push(handler);
    return {
      remove: () => {
        listeners.splice(listeners.indexOf(handler), 1);
      },
    };
  });
  return async () => {
    await act(async () => {
      // Like the native BackHandler: the most recent listener gets the event first.
      for (const listener of [...listeners].reverse()) {
        if (listener({ type: 'hardwareBackPress', timeStamp: Date.now() })) return;
      }
    });
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AC1: tab navigation', () => {
  it('shows the four tabs with their labels in order', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });

    for (const tab of APP_TABS) {
      expect(screen.getByTestId(tabButtonTestId(tab.name))).toHaveTextContent(tab.title);
    }
  });

  it.each(APP_TABS.filter((tab) => tab.name !== 'index'))(
    'tapping $title shows its screen',
    async (tab) => {
      await renderRouter(APP_DIR, { initialUrl: '/' });
      const target = SCREEN_TEST_IDS[tab.name];
      expect(screen.getByTestId(target, { includeHiddenElements: true })).not.toBeVisible();

      await fireEvent.press(screen.getByTestId(tabButtonTestId(tab.name)));

      expect(screen).toHavePathname(tab.href);
      expect(screen.getByTestId(target)).toBeVisible();
      expect(screen.getByTestId('home-screen', { includeHiddenElements: true })).not.toBeVisible();
      expect(screen.getByTestId(tabButtonTestId(tab.name))).toBeSelected();
    },
  );

  it('tapping Today from another tab shows the Today screen', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/settings' });

    await fireEvent.press(screen.getByTestId(tabButtonTestId('index')));

    expect(screen).toHavePathname('/');
    expect(screen.getByTestId('home-screen')).toBeVisible();
  });

  it('logs the dev-only tab-switch time for the pressed tab (AC1 measurement hook)', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await renderRouter(APP_DIR, { initialUrl: '/' });

    await fireEvent.press(screen.getByTestId(tabButtonTestId('inbox')));

    await waitFor(() =>
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[tab-switch\] inbox \d+\.\dms$/)),
    );
  });

  it('mounts every tab up front, so a switch only shows an already-rendered screen', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });

    // `lazy: false`: the other tabs exist before they are ever pressed.
    for (const testID of Object.values(SCREEN_TEST_IDS)) {
      expect(screen.getByTestId(testID, { includeHiddenElements: true })).toBeTruthy();
    }
  });
});

describe('AC2: task deep link', () => {
  it('opens the task detail modal for /task/<id>', async () => {
    await renderRouter(APP_DIR, { initialUrl: `/task/${TASK_ID}` });

    expect(screen).toHavePathname(`/task/${TASK_ID}`);
    expect(screen.getByTestId('task-detail-modal')).toBeVisible();
    expect(screen.getByText(`ID: ${TASK_ID}`)).toBeVisible();
  });

  it('loads the tabs underneath, so back from a deep-linked modal lands on Today', async () => {
    const pressBack = captureHardwareBack();
    await renderRouter(APP_DIR, { initialUrl: `/task/${TASK_ID}` });

    // The back key (not Close, whose fallback replaces to `/`) proves Today is really underneath.
    await pressBack();

    expect(screen).toHavePathname('/');
    expect(screen.getByTestId('home-screen')).toBeVisible();
  });

  it('shows an error instead of a task for a malformed id', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/task/not%20a%20task' });

    expect(screen.getByTestId('task-detail-invalid')).toBeVisible();
    expect(screen.getByText(INVALID_TASK_LINK_MESSAGE)).toBeVisible();
    expect(screen.queryByTestId('task-detail-modal')).toBeNull();
  });
});

describe('AC3: closing the modal keeps the screen underneath', () => {
  async function typeOnTodayThenOpenSampleTask() {
    await fireEvent.changeText(screen.getByLabelText('Task name'), 'Buy milk');
    await fireEvent.press(screen.getByRole('button', { name: 'Open sample task' }));
    expect(screen).toHavePathname('/task/sample-task');
    expect(screen.getByTestId('task-detail-modal')).toBeVisible();
  }

  it('the Android back key closes the modal and keeps typed text on Today', async () => {
    const pressBack = captureHardwareBack();
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await typeOnTodayThenOpenSampleTask();

    await pressBack();

    expect(screen).toHavePathname('/');
    expect(screen.queryByTestId('task-detail-modal')).toBeNull();
    expect(screen.getByLabelText('Task name')).toHaveDisplayValue('Buy milk');
  });

  it('the Close button closes the modal and keeps typed text on Today', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await typeOnTodayThenOpenSampleTask();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(screen).toHavePathname('/');
    expect(screen.getByLabelText('Task name')).toHaveDisplayValue('Buy milk');
  });
});
