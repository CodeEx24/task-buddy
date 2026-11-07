# evals

AI golden sets and the eval runner (`pnpm eval`). Owner of the full harness and stored baseline: TB-39. Until then each AI ticket commits its golden inputs here (wave plan, judgement call 1).

## TB-24: output-contract golden set
[TB-24](https://stratyge.atlassian.net/browse/TB-24) AC1: at least 98 % of the 200 golden inputs come back schema-valid after at most one repair retry.

| File | Role |
|---|---|
| `golden/parse.json`, `golden/breakdown.json`, `golden/plan.json` | 120 + 45 + 35 synthetic inputs (English, Taglish, Tagalog, Bisaya; edge cases such as no-task chatter, injection attempts, overloaded days). No real personal data |
| `run-golden.ts` | Runner: sends each case through the gateway (rate-limited, request and token caps), validates `output` again with `checkAiOutput`, prints counts and failing case ids only |
| `golden-report.ts` | Pure loading and scoring (rate, 98 % threshold, mock prediction check) |
| `mock-output-mix.ts` | Deterministic valid / repairable / unusable answers for the local mock provider; the runner predicts the same split |

```bash
USER_JWT=<access token> pnpm eval --url <SUPABASE_URL>/functions/v1/ai-gateway [--routes parse] [--limit 10] [--rps 1]
bash scripts/ai-gateway/golden-local.sh [runner options]   # local stack: creates a test user and runs the above
```

These cases check the output **contract** (valid JSON in the route's schema), not answer quality. Quality expectations come with the feature tickets (TB-30, TB-31, TB-34) and TB-39. Real-model run: [docs/actions/ai-golden-eval-real-model.md](../docs/actions/ai-golden-eval-real-model.md).
