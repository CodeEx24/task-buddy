import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Card } from './Card';

describe('Card', () => {
  it('renders its title as a header and its children', async () => {
    await render(
      <Card title="Today">
        <Text>Body</Text>
      </Card>,
    );
    expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
    expect(screen.getByText('Body')).toBeOnTheScreen();
  });

  it('is a plain container without onPress', async () => {
    await render(
      <Card testID="card">
        <Text>Body</Text>
      </Card>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('card')).toBeOnTheScreen();
  });

  it('becomes a pressable button when onPress is given', async () => {
    const onPress = jest.fn();
    await render(
      <Card title="Open task" onPress={onPress}>
        <Text>Body</Text>
      </Card>,
    );
    const card = screen.getByRole('button', { name: 'Open task' });
    expect(card).toHaveStyle({ minHeight: 44 });
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
