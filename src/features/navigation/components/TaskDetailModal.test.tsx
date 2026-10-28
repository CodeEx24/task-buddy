import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { INVALID_TASK_LINK_MESSAGE, TaskDetailModal } from './TaskDetailModal';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  router: { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

const mockParams = jest.mocked(useLocalSearchParams);
const mockRouter = jest.mocked(router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TaskDetailModal', () => {
  it('shows the validated id for a valid task link', async () => {
    mockParams.mockReturnValue({ id: 'sample-task' });
    await render(<TaskDetailModal />);

    expect(screen.getByTestId('task-detail-modal')).toBeOnTheScreen();
    expect(screen.getByText('ID: sample-task')).toBeOnTheScreen();
    expect(screen.queryByText(INVALID_TASK_LINK_MESSAGE)).toBeNull();
  });

  it('shows the invalid-link message and no id for a malformed id', async () => {
    mockParams.mockReturnValue({ id: '<script>' });
    await render(<TaskDetailModal />);

    expect(screen.getByTestId('task-detail-invalid')).toBeOnTheScreen();
    expect(screen.getByText(INVALID_TASK_LINK_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByText(/<script>/)).toBeNull();
  });

  it('Close goes back when there is a screen underneath', async () => {
    mockParams.mockReturnValue({ id: 'sample-task' });
    mockRouter.canGoBack.mockReturnValue(true);
    await render(<TaskDetailModal />);

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('Close falls back to Today when there is nothing to go back to', async () => {
    mockParams.mockReturnValue({ id: 'sample-task' });
    mockRouter.canGoBack.mockReturnValue(false);
    await render(<TaskDetailModal />);

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
