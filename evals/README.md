# evals

AI golden sets and the eval runner (pnpm eval). Owner: TB-39.

## Prompt-injection corpus (TB-25)
`injection/corpus.json`: 20 attack prompts (ignore-previous, role-play, system-prompt extraction, delimiter breaking, encoded, invisible-character obfuscation, Taglish/Bisaya, tool/JSON-action injection). `injection/gullible-answer.ts` is a fully compromised model used by the Jest corpus test (`supabase/functions/ai-gateway/middleware/input-hardening.test.ts`) and the local mock. Run against a gateway with `scripts/ai-gateway/injection-check.mjs`; against the real model see `docs/actions/ai-injection-corpus-real-model.md`. Add a case whenever an injection is found in the wild.
