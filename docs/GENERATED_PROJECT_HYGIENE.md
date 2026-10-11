# Generated React/Vite hygiene

Generated code is checked before preview, but cosmetic unused declarations
(TS6133/TS6192) should not consume an AI repair attempt.

- `project-integrity.ts` standardizes the common generated `tsc && vite build`
  command to a real semantic TypeScript check followed by Vite bundling,
  disabling only `noUnusedLocals` and `noUnusedParameters` on that command.
- `project-scaffold.ts` sets a separate typecheck script for new Vite builds.
- `/api/sandbox/validate` uses a conservative TypeScript syntax-tree rewrite
  to remove unused imports from known side-effect-free UI library entrypoints.
  It never removes unknown/local imports, hooks, state or callbacks.
- The streaming runtime writes these cleaned files to Vivari before building.
  Vite-only builds with a TypeScript compiler also run `tsc --noEmit`
  with unused declaration warnings disabled.
- Genuine unresolved imports, broken TypeScript types and Vite compilation
  errors continue to trigger the existing bounded AI repair workflow.

Regression tests cover mixed Lucide imports, unused React default imports,
side-effect preservation and idempotent project-script reconciliation.
