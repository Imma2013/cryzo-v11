# Cryzo v5 design-engine parity in v11

## Canonical references

All 68 `DESIGN.md` / 68 `REFERENCE.json` pairs are already present under
`vendor/design-recipes/` and exactly match v5's canonical library (verified by
Git blob hashes). No duplicate source-of-truth files were added.

`src/lib/server/design-reference-library.ts` ports v5's **complete** reference
metadata, category/product/style signals, house-family selection and weighted
ranking. V5 originally used `import.meta.glob`; the Next.js implementation
loads the identical on-disk references and uses `next.config.ts` output-file
tracing to bundle the files with the chat route on Vercel.

## Build sequence

1. Route each web build to one locked primary reference using v5's scoring.
2. Compile v5's execution packet and canonical preamble. This includes recipe
   composition, identity, hero architecture, type/imagery interactions, section
   order, anti-patterns, signature markers and special Cryzo house rules.
3. Generate v5's detailed layout lock using the same model selected for build.
4. Generate functional Cryzo file actions with the existing streaming runtime.
5. Run the v5 reference-fidelity audit against the draft and the locked plan.
   If the audit requests a retry, stream **one** focused correction of files;
   do not enter an unbounded design/model loop.

The existing Vivari executor, Convex checkpointed generation, Vercel hosting,
Stripe payments, API-key selection and browser dependency validation remain
untouched. The V11 streaming contract is retained: the first working draft can
appear before the late audit correction; this intentionally differs from V5's
buffered-first-draft acceptance pipeline.

## Parity tests

The four `tests/v5-design-*.test.ts` files are adapted from v5's original tests
and check the 68 canonical references, representative user-intent routing,
execution packets, layout-lock parsing and audit verdict parsing. Run `npm test`.
An actual visual A/B assessment using the same model and prompts is still
needed to measure perceived visual quality. The text-based audit is not a
screenshot-quality evaluation.
