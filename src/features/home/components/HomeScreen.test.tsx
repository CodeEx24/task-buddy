import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from './HomeScreen';

describe('HomeScreen', () => {
  it('renders the placeholder home route with the app name', async () => {
    await render(<HomeScreen />);

    expect(screen.getByTestId('home-screen')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Task Buddy' })).toBeOnTheScreen();
  });
});
