import { renderRouter, screen } from 'expo-router/testing-library';

// Renders the real `src/app/` routes, so a broken or moved route fails here (TB-15 AC1).
// Resolved from the Jest rootDir (the repo root).
const APP_DIR = './src/app';

describe('app routes', () => {
  it('serves the placeholder home screen at /', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });

    expect(screen).toHavePathname('/');
    expect(screen.getByTestId('home-screen')).toBeOnTheScreen();
  });

  it('shows the not-found screen for an unknown route', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/does-not-exist' });

    expect(screen.getByTestId('not-found-screen')).toBeOnTheScreen();
  });
});
