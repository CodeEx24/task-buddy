import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Text } from 'react-native';

import { colors } from '@/theme';

import { Sheet } from './Sheet';

// `@gorhom/bottom-sheet` is replaced by the stateful mock in ./testing/bottom-sheet-mock.tsx.

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
    await render(
      <Sheet open={false} onOpenChange={jest.fn()} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(screen.queryByText('Content')).toBeNull();
  });

  it('presents its title and content when opened', async () => {
    const { rerender } = await render(
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

  it('requests close on backdrop press', async () => {
    const onOpenChange = jest.fn();
    await render(
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
    const { rerender } = await render(
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
    await render(
      <Sheet open={false} onOpenChange={jest.fn()} title="Details">
        <Text>Content</Text>
      </Sheet>,
    );
    expect(listeners).toHaveLength(0);
  });

  it('does not report a close the parent already made', async () => {
    const onOpenChange = jest.fn();
    const { rerender } = await render(
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
});
