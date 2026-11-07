import { SETTINGS_PAGES, findSettingsPage, settingsPageHref } from './pages';
import { SETTINGS_SECTIONS } from './sections';

describe('settings page registry (TB-32)', () => {
  it('has unique kebab-case slugs', () => {
    const slugs = SETTINGS_PAGES.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it('lists every page in the Preferences section, in registry order', () => {
    const preferences = SETTINGS_SECTIONS.find((section) => section.id === 'preferences');
    const pages = preferences?.rows.flatMap((row) => (row.kind === 'page' ? [row.page] : []));
    expect(pages).toEqual(SETTINGS_PAGES);
  });

  it('resolves slugs and builds hrefs', () => {
    expect(findSettingsPage('appearance')?.title).toBe('Appearance');
    expect(findSettingsPage('work-hours')?.title).toBe('Work hours');
    expect(findSettingsPage('nope')).toBeUndefined();
    expect(findSettingsPage(undefined)).toBeUndefined();
    expect(settingsPageHref('appearance')).toBe('/settings/appearance');
  });
});
