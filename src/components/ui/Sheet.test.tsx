import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { colors } from '@/theme';

import { Sheet } from './Sheet';
import { SheetHost } from './SheetHost';

// `@gorhom/bottom-sheet` is replaced by the stateful mock in ./testing/bottom-sheet-mock.tsx.

/** Renders inside the SheetHost that UiProvider normally supplies (rerender keeps it). */
function renderInHost(ui: ReactElement) {
  return render(ui, { wrapper: SheetHost });
}

type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
const BACK_EVENT = {} as Parameters<BackListener>[0];

function captureBackHandler() {
  const listeners: BackListener[] = [];
  const remove = jest.fn();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.push(listener);
    return { remove };
  });
  return { listeners, remove };
}

describe('Sheet', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders nothing while closed', async () => {
    await renderInHost(
      <Sheet open={false} onOpenChange={jest.fn()} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(screen.queryByText('Content')).toBeNull();
  });

  it('presents its title and content when opened', async () => {
    const { rerender } = await renderInHost(
      <Sheet open={false} onOpenChange={jest.fn()} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    await rerender(
      <Sheet open onOpenChange={jest.fn()} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(screen.getByRole('header', { name: 'Details' })).toBeOnTheScreen();
    expect(screen.getByText('Content')).toBeOnTheScreen();
    expect(screen.getByTestId('bottom-sheet-background')).toHaveStyle({
      backgroundColor: colors.light.surface,
    });
  });

  it('does not group its content into one accessible element (screen readers reach the controls)', async () => {
    await renderInHost(
      <Sheet open onOpenChange={jest.fn()} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    // The library defaults to accessible=true + role "adjustable", which on iOS hides the
    // header and buttons inside the sheet from VoiceOver.
    expect(screen.getByTestId('bottom-sheet-background').props.accessible).toBe(false);
  });

  it('closes on the iOS accessibility escape gesture', async () => {
    const onOpenChange = jest.fn();
    await renderInHost(
      <Sheet open onOpenChange={onOpenChange} title="Details" testID="sheet">
        <Text>Content</Text>
      </Sheet>,
    );
    await act(() => screen.getByTestId('sheet').props.onAccessibilityEscape());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('requests close on backdrop press', async () => {
    const onOpenChange = jest.fn();
    await renderInHost(
      <Sheet open onOpenChange={onOpenChange} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    await fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('requests close on the hardware back button while open', async () => {
    const { listeners, remove } = captureBackHandler();
    const onOpenChange = jest.fn();
    const { rerender } = await renderInHost(
      <Sheet open onOpenChange={onOpenChange} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(listeners).toHaveLength(1);

    let isHandled: boolean | null | undefined;
    await act(() => {
      isHandled = listeners[0]?.(BACK_EVENT);
    });
    expect(isHandled).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await rerender(
      <Sheet open={false} onOpenChange={onOpenChange} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(remove).toHaveBeenCalled();
    expect(screen.queryByText('Content')).toBeNull();
  });

  it('does not listen for the back button while closed', async () => {
    const { listeners } = captureBackHandler();
    await renderInHost(
      <Sheet open={false} onOpenChange={jest.fn()} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(listeners).toHaveLength(0);
  });

  it('does not report a close the parent already made', async () => {
    const onOpenChange = jest.fn();
    const { rerender } = await renderInHost(
      <Sheet open onOpenChange={onOpenChange} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    await rerender(
      <Sheet open={false} onOpenChange={onOpenChange} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(screen.queryByText('Content')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('draws in the SheetHost above the app, not inside the caller', async () => {
    await renderInHost(
      <View testID="caller">
        <Sheet open onOpenChange={jest.fn()} title="Details">
          <Text>Content</Text>
        </Sheet>
      </View>,
    );
    expect(within(screen.getByTestId('sheet-host')).getByText('Content')).toBeOnTheScreen();
    expect(within(screen.getByTestId('caller')).queryByText('Content')).toBeNull();
  });

  it('unmounts from the host after a user close and can open again', async () => {
    const onOpenChange = jest.fn();
    const { rerender } = await renderInHost(
      <Sheet open onOpenChange={onOpenChange} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    await fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'));
    await rerender(
      <Sheet open={false} onOpenChange={onOpenChange} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(screen.queryByTestId('bottom-sheet-background')).toBeNull();

    await rerender(
      <Sheet open onOpenChange={onOpenChange} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(screen.getByText('Content')).toBeOnTheScreen();
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it('explains the missing provider when rendered without UiProvider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      render(
        <Sheet open onOpenChange={jest.fn()} title="Details">
          <Text>Content</Text>
        </Sheet>,
      ),
    ).rejects.toThrow('Sheet must be rendered inside UiProvider');
  });
});
