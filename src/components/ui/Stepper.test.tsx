import { fireEvent, render, screen } from '@testing-library/react-native';

import { Stepper, type StepperStep } from './Stepper';

const STEPS: readonly StepperStep[] = [
  { amount: -60, label: '−1h', accessibilityLabel: '1 hour less' },
  { amount: 15, label: '+15m', accessibilityLabel: '15 minutes more' },
];

function renderStepper(value: number, onChange = jest.fn()) {
  return render(
    <Stepper
      testID="stepper"
      label="Capacity"
      value={value}
      onChange={onChange}
      formatValue={(v) => `${v} min`}
      min={15}
      max={120}
      steps={STEPS}
    />,
  );
}

describe('Stepper (TB-33)', () => {
  it('shows the formatted value and labelled step buttons', async () => {
    await renderStepper(60);
    expect(screen.getByTestId('stepper-value')).toHaveTextContent('60 min');
    expect(screen.getByLabelText('Capacity: 60 min')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Capacity 1 hour less' })).toHaveTextContent('−1h');
    expect(screen.getByRole('button', { name: 'Capacity 15 minutes more' })).toHaveTextContent(
      '+15m',
    );
  });

  it('steps the value and clamps it to the range', async () => {
    const onChange = jest.fn();
    await renderStepper(60, onChange);
    await fireEvent.press(screen.getByRole('button', { name: 'Capacity 1 hour less' }));
    expect(onChange).toHaveBeenLastCalledWith(15);
    await fireEvent.press(screen.getByRole('button', { name: 'Capacity 15 minutes more' }));
    expect(onChange).toHaveBeenLastCalledWith(75);
  });

  it('disables a step that cannot move the value, keeping the 44 pt target', async () => {
    await renderStepper(120);
    const more = screen.getByRole('button', { name: 'Capacity 15 minutes more' });
    expect(more).toBeDisabled();
    expect(more).toHaveStyle({ minHeight: 44 });
    expect(screen.getByRole('button', { name: 'Capacity 1 hour less' })).toBeEnabled();
  });
});
