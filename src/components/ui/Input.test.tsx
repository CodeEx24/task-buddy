import { fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { AccessibilityInfo, type TextInputInstance } from 'react-native';

import { colors } from '@/theme';

import { Input } from './Input';

describe('Input', () => {
  it('shows its label and uses it as the accessibility label', async () => {
    await render(<Input label="Task name" />);
    expect(screen.getByText('Task name')).toBeOnTheScreen();
    expect(screen.getByLabelText('Task name')).toBeOnTheScreen();
  });

  it('forwards TextInput props', async () => {
    const onChangeText = jest.fn();
    await render(
      <Input label="Task name" placeholder="e.g. Buy milk" onChangeText={onChangeText} />,
    );
    const input = screen.getByPlaceholderText('e.g. Buy milk');
    await fireEvent.changeText(input, 'Buy milk');
    expect(onChangeText).toHaveBeenCalledWith('Buy milk');
    expect(input.props.placeholderTextColor).toBe(colors.light.textMuted);
  });

  it('forwards its ref to the TextInput', async () => {
    const ref = createRef<TextInputInstance>();
    await render(<Input ref={ref} label="Task name" />);
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.focus).toBe('function');
  });

  it('shows helper text and exposes it as the accessibility hint', async () => {
    await render(<Input label="Task name" helperText="Keep it short" />);
    expect(screen.getByText('Keep it short')).toBeOnTheScreen();
    expect(screen.getByLabelText('Task name').props.accessibilityHint).toBe('Keep it short');
  });

  it('announces the error and shows it instead of the helper text', async () => {
    await render(<Input label="Task name" helperText="Keep it short" error="Name is required" />);
    const error = screen.getByText('Name is required');
    expect(error.props.accessibilityLiveRegion).toBe('polite');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(screen.queryByText('Keep it short')).toBeNull();
    expect(screen.getByLabelText('Task name').props.accessibilityHint).toBe('Name is required');
  });

  it('announces a new error to screen readers on every platform', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear(); // the preset's mock keeps calls from earlier tests
    const { rerender } = await render(<Input label="Task name" />);
    expect(announce).not.toHaveBeenCalled();

    await rerender(<Input label="Task name" error="Name is required" />);
    expect(announce).toHaveBeenCalledWith('Name is required');
    announce.mockRestore();
  });

  it('keeps the 44pt minimum height', async () => {
    await render(<Input label="Task name" />);
    expect(screen.getByLabelText('Task name')).toHaveStyle({ minHeight: 44 });
  });
});
