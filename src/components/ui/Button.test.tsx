import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors } from '@/theme';

import { Button } from './Button';

describe('Button', () => {
  it('renders an accessible button with its label', async () => {
    await render(<Button label="Save" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeOnTheScreen();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the 44pt minimum touch target', async () => {
    await render(<Button label="Save" size="sm" onPress={jest.fn()} />);
    expect(screen.getByRole('button')).toHaveStyle({ minHeight: 44 });
  });

  it('is disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner, reports busy and ignores presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByTestId('button-spinner').props.color).toBe(colors.light.onPrimary);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each([
    ['secondary', colors.light.primary],
    ['ghost', colors.light.primary],
    ['destructive', colors.light.onDanger],
  ] as const)('uses the %s variant spinner colour', async (variant, expected) => {
    await render(<Button label="Go" variant={variant} loading onPress={jest.fn()} />);
    expect(screen.getByTestId('button-spinner').props.color).toBe(expected);
  });
});
