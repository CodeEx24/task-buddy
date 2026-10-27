import { fireEvent, render, screen } from '@testing-library/react-native';

import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('exposes the checkbox role, label and unchecked state', async () => {
    await render(<Checkbox label="Done" checked={false} onCheckedChange={jest.fn()} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Done' });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveStyle({ minHeight: 44 });
  });

  it('reports the checked state', async () => {
    await render(<Checkbox label="Done" checked onCheckedChange={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeChecked();
  });

  it('asks to toggle when pressed (controlled)', async () => {
    const onCheckedChange = jest.fn();
    const { rerender } = await render(
      <Checkbox label="Done" checked={false} onCheckedChange={onCheckedChange} />,
    );
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Done' }));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);

    await rerender(<Checkbox label="Done" checked onCheckedChange={onCheckedChange} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Done' }));
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it('ignores presses when disabled', async () => {
    const onCheckedChange = jest.fn();
    await render(
      <Checkbox label="Done" checked={false} disabled onCheckedChange={onCheckedChange} />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Done' });
    expect(checkbox).toBeDisabled();
    await fireEvent.press(checkbox);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
