# patches/

pnpm patches (`pnpm.patchedDependencies` in `package.json`). Each one must be re-checked whenever its package is upgraded.

## `@supabase/supabase-js@2.118.0` (TB-20, https://stratyge.atlassian.net/browse/TB-20)

- **Why:** the CI `bundle` job (`scripts/check-bundle-secrets.ts`, TB-19) fails on any `sb_secret_` followed by 16+ key characters in the app bundle. supabase-js ships the literal `"sb_secret_"` (an `isNewApiKey` prefix check). Hermes packs string literals back to back, so it ends up next to an unrelated string and looks like a leaked secret key. That's a false positive, but the scanner stays strict on purpose.
- **What:** in `dist/index.cjs`, `dist/index.mjs` and `dist/umd/supabase.js` only, the literal is built at runtime (`["sb","secret",""].join("_")`), plus one comment mention. There is no behaviour change.
- **On upgrade:** pnpm refuses to install if the patch no longer applies. Recreate it with `pnpm patch @supabase/supabase-js@<new>`, check `grep -rn "sb_secret_" node_modules/@supabase/*/dist --include=*.js --include=*.cjs --include=*.mjs`, export a bundle and run `node scripts/check-bundle-secrets.ts <dir>`. If a new version no longer contains the literal, delete the patch.
