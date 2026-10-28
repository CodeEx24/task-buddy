import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ACCOUNT_DELETION_URL,
  IS_OPERATOR_CONFIRMED,
  LEGAL_LAST_UPDATED,
  LEGAL_OPERATOR,
  LEGAL_PAGE_PATHS,
  LEGAL_SITE_BASE_URL,
  LEGAL_URLS,
} from './legal-config';

// The published site (legal-site/, deployed to EAS Hosting) must say what the app's config says.
const SITE_DIR = join(__dirname, '..', '..', '..', 'legal-site');
const readPage = (path: string) => readFileSync(join(SITE_DIR, `${path.slice(1)}.html`), 'utf8');
const pages = Object.values(LEGAL_PAGE_PATHS);

describe('legal config (TB-54)', () => {
  it('uses fixed HTTPS URLs under one base', () => {
    expect(LEGAL_SITE_BASE_URL).toMatch(/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    for (const url of Object.values(LEGAL_URLS))
      expect(url.startsWith(LEGAL_SITE_BASE_URL)).toBe(true);
    expect(ACCOUNT_DELETION_URL).toBe(`${LEGAL_URLS.privacy}#delete-account`);
  });

  it.each(pages)('has a page in legal-site/ for %s', (path) => {
    expect(existsSync(join(SITE_DIR, `${path.slice(1)}.html`))).toBe(true);
  });

  it.each(pages)('%s shows the same "last updated" date as the app config', (path) => {
    expect(readPage(path)).toContain(`Last updated: ${LEGAL_LAST_UPDATED}`);
  });

  it('shows the operator facts from the config on the pages, as marked placeholders until confirmed', () => {
    const privacy = readPage(LEGAL_PAGE_PATHS.privacy);
    const terms = readPage(LEGAL_PAGE_PATHS.terms);
    expect(privacy).toContain(LEGAL_OPERATOR.name);
    expect(privacy).toContain(LEGAL_OPERATOR.country);
    expect(privacy).toContain(LEGAL_OPERATOR.contactEmail);
    expect(terms).toContain(LEGAL_OPERATOR.name);
    expect(terms).toContain(LEGAL_OPERATOR.country);

    if (!IS_OPERATOR_CONFIRMED) {
      for (const value of [
        LEGAL_OPERATOR.name,
        LEGAL_OPERATOR.country,
        LEGAL_OPERATOR.contactEmail,
      ]) {
        expect(value).toMatch(/to be confirmed by owner/);
      }
    }
  });

  it('never publishes an email address until the owner confirms one', () => {
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    for (const path of [...pages, '/index']) {
      const html = readPage(path);
      if (!IS_OPERATOR_CONFIRMED) expect(html).not.toMatch(emailPattern);
    }
  });

  it('has no scripts or third-party trackers on the legal pages', () => {
    for (const path of [...pages, '/index']) {
      const html = readPage(path);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<iframe|<img/i);
    }
  });
});

describe('privacy policy content (TB-54 AC2)', () => {
  const privacy = readPage(LEGAL_PAGE_PATHS.privacy);
  const ai = readPage(LEGAL_PAGE_PATHS.ai);

  it('names the AI provider and says data goes only through the server, only when AI is used', () => {
    expect(privacy).toContain('Anthropic');
    expect(privacy).toMatch(/never contacts Anthropic directly/);
    expect(privacy).toMatch(/only when you use an AI feature/i);
  });

  it('states what text, audio and images are sent', () => {
    expect(privacy).toMatch(/<strong>Text:<\/strong>/);
    expect(privacy).toMatch(/<strong>Voice:<\/strong> only the text transcript/);
    expect(privacy).toMatch(/<strong>Images:<\/strong> only the photo you chose/);
  });

  it('states retention and training, and links the provider terms', () => {
    expect(privacy).toMatch(/may not use it to train its models/);
    expect(privacy).toMatch(/within 30 days/);
    expect(privacy).toContain('https://www.anthropic.com/legal/commercial-terms');
    expect(ai).toMatch(/within 30 days/);
  });

  it('explains deletion, with an anchor for the store deletion link', () => {
    expect(privacy).toContain('id="delete-account"');
    expect(privacy).toMatch(/delete your account/i);
  });

  it('covers the launch jurisdictions and the optional analytics', () => {
    expect(privacy).toMatch(/Data Privacy Act of 2012/);
    expect(privacy).toMatch(/National Privacy Commission/);
    expect(privacy).toMatch(/GDPR/);
    expect(privacy).toMatch(/CCPA/);
    expect(privacy).toMatch(/Only if you opt in in Settings\. Off by default/);
  });
});
