import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
// Internal module (exported via `expo-router/build/*`): the URL-to-path step of native linking.
import { extractExpoPathFromURL } from 'expo-router/build/fork/extractPathFromURL';
import { BackHandler } from 'react-native';

import {
  INVALID_TASK_LINK_MESSAGE,
  TASK_NOT_FOUND_MESSAGE,
} from '@/features/tasks/components/TaskDetailModal';
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

    // Tree order of the tab buttons is their on-screen order.
    const order = screen.getAllByTestId(/^tab-/).map((button) => button.props.testID);
    expect(order).toEqual(['tab-index', 'tab-inbox', 'tab-buddy', 'tab-settings']);
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

  it('re-tapping the active tab starts no measurement', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const pressBack = captureHardwareBack();
    await renderRouter(APP_DIR, { initialUrl: '/' });

    await fireEvent.press(screen.getByTestId(tabButtonTestId('index')));
    // Today regains focus when the modal closes; a stale press would be reported then.
    await fireEvent.press(screen.getByRole('button', { name: 'Add a task' }));
    await pressBack();
    expect(screen).toHavePathname('/');
    // Let Today's refocus frame run (renderRouter uses fake timers); a stale press would log here.
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    // Control: a real switch is reported. Today's refocus frame was queued before it.
    await fireEvent.press(screen.getByTestId(tabButtonTestId('inbox')));
    await waitFor(() =>
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[tab-switch\] inbox /)),
    );

    expect(log).not.toHaveBeenCalledWith(expect.stringMatching(/^\[tab-switch\] index /));
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
  it('opens the task detail modal for the taskbuddy:// scheme URL', async () => {
    // On device, expo-router's linking turns the incoming URL into a path with this function.
    // (`renderRouter` parses `initialUrl` as a web URL, which reads `task` as the host.)
    const path = extractExpoPathFromURL([], `taskbuddy://task/${TASK_ID}`);
    expect(path).toBe(`task/${TASK_ID}`);

    await renderRouter(APP_DIR, { initialUrl: `/${path}` });

    expect(screen).toHavePathname(`/task/${TASK_ID}`);
    expect(screen.getByTestId('task-detail-modal')).toBeVisible();
  });

  it('opens the task detail modal for /task/<id>', async () => {
    await renderRouter(APP_DIR, { initialUrl: `/task/${TASK_ID}` });

    expect(screen).toHavePathname(`/task/${TASK_ID}`);
    expect(screen.getByTestId('task-detail-modal')).toBeVisible();
    // TB-26: the modal now loads the task; this id has no task in the (empty) local DB.
    expect(await screen.findByText(TASK_NOT_FOUND_MESSAGE)).toBeVisible();
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
  // TB-26: the Today demo opens the real add-task modal.
  async function typeOnTodayThenOpenAddTask() {
    await fireEvent.changeText(screen.getByLabelText('Task name'), 'Buy milk');
    await fireEvent.press(screen.getByTestId('home-add-task-button'));
    expect(screen).toHavePathname('/task/new');
    expect(await screen.findByTestId('new-task-modal')).toBeVisible();
  }

  it('the Android back key closes the modal and keeps typed text on Today', async () => {
    const pressBack = captureHardwareBack();
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await typeOnTodayThenOpenAddTask();

    await pressBack();

    expect(screen).toHavePathname('/');
    expect(screen.queryByTestId('new-task-modal')).toBeNull();
    expect(screen.getByLabelText('Task name')).toHaveDisplayValue('Buy milk');
  });

  it('the Cancel button closes the modal and keeps typed text on Today', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await typeOnTodayThenOpenAddTask();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen).toHavePathname('/');
    expect(screen.getByLabelText('Task name')).toHaveDisplayValue('Buy milk');
  });
});
