/**
 * Legal pages and operator facts (TB-54). The single place the app reads them from; the web pages
 * in `legal-site/` carry the same values and `legal-config.test.ts` keeps the two in sync.
 *
 * The URLs are public and fixed, so they are plain constants (not `EXPO_PUBLIC_*` env vars).
 * The site is deployed to the EAS Hosting alias `legal` (docs/actions/legal-site-deploy.md).
 */

/** Stable base URL of the legal site: EAS Hosting alias `legal` of the `task-buddy` project. */
export const LEGAL_SITE_BASE_URL = 'https://task-buddy--legal.expo.app';

export type LegalPage = 'privacy' | 'terms' | 'ai';

/** Path of each page on the legal site; also the HTML file name in `legal-site/`. */
export const LEGAL_PAGE_PATHS: Readonly<Record<LegalPage, string>> = {
  privacy: '/privacy',
  terms: '/terms',
  ai: '/ai',
};

export const LEGAL_URLS: Readonly<Record<LegalPage, string>> = {
  privacy: `${LEGAL_SITE_BASE_URL}${LEGAL_PAGE_PATHS.privacy}`,
  terms: `${LEGAL_SITE_BASE_URL}${LEGAL_PAGE_PATHS.terms}`,
  ai: `${LEGAL_SITE_BASE_URL}${LEGAL_PAGE_PATHS.ai}`,
};

/** Account-deletion instructions (Google Play asks for a web link to these). */
export const ACCOUNT_DELETION_URL = `${LEGAL_URLS.privacy}#delete-account`;

/** "Last updated" date printed on every legal page. Bump it with every content change. */
export const LEGAL_LAST_UPDATED = '28 October 2026';

/**
 * Operator facts the owner still has to supply (docs/actions/legal-owner-facts.md). Until then the
 * visible placeholders below are shown, never an invented name or address.
 */
export const IS_OPERATOR_CONFIRMED = false;

export const LEGAL_OPERATOR = {
  /** Service name shown to users. */
  serviceName: 'Task Buddy',
  /** Legal operator: the individual developer. */
  name: '[Operator name: to be confirmed by owner]',
  /** Country the operator is based in (also the governing law in the terms). */
  country: '[Country of the operator: to be confirmed by owner]',
  /** Privacy and support contact. Must be a dedicated address, never a personal one. */
  contactEmail: '[Privacy contact: to be confirmed by owner]',
} as const;
