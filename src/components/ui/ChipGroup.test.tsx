import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChipGroup } from './ChipGroup';

const OPTIONS = [
  { value: 0, label: 'None' },
  { value: 3, label: 'High' },
] as const;

describe('ChipGroup', () => {
  it('exposes a radio group with the checked option', async () => {
    await render(
      <ChipGroup label="Priority" options={OPTIONS} value={3} onChange={jest.fn()} testID="p" />,
    );
    // The group View is a container (not itself focusable), so query it by testID.
    expect(screen.getByTestId('p')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(screen.getByTestId('p')).toHaveProp('accessibilityLabel', 'Priority');
    expect(screen.getByRole('radio', { name: 'High' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'None' })).not.toBeChecked();
    expect(screen.getByTestId('p-3')).toHaveStyle({ minHeight: 44 });
  });

  it('selects nothing for a null value and reports presses', async () => {
    const onChange = jest.fn();
    await render(<ChipGroup label="Due" options={OPTIONS} value={null} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'None' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'High' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
