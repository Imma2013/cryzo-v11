# Generated-project validation (Vivari)

Cryzo keeps GitHub for application source, Vercel for production hosting,
Convex for persistent chats/artifacts, and Vivari for browser execution.

## Pipeline

1. Restore or create files and non-destructively scaffold missing React/Vite basics.
2. Inspect JS/TS/CSS imports, relative paths and PostCSS/Tailwind configuration.
3. Reconcile a small allowlist of known browser-compatible package versions in
   `package.json`; preserve existing versions and user-authored files.
4. Install updated dependencies, validate the project snapshot server-side, and
   compile Vite web builds before starting the preview. Errors stop the dependent
   actions of that AI message instead of continuing to a misleading preview.
5. Forward Vite overlay errors to Cryzo's existing error view. A generated-build
   failure initiates at most **two** corrective prompts to the currently selected
   chat model, using its normal auth/key and Convex chat history.

## Deliberate limitations

- Unknown npm packages are **not** assigned guessed versions automatically;
  they produce an actionable missing dependency diagnostic for model repair.
- This analyzer is not a complete TypeScript resolver, bundler, or npm registry.
  The Vite build is the last verification for generated Vite websites.
- Unsupported native dependencies and non-Vite stacks need separate handling.
- Browser-specific Service Worker problems can still prevent a preview from
  loading even when the generated website builds successfully. Diagnose and
  reset the preview runtime rather than replacing source code blindly.
- Isolated-origin preview hosting requires separate bridge-only deployment and
  remains a distinct security hardening step described in `docs/VIVARI.md`.
- User-provided model API keys may be charged for each automatic repair attempt.

## Regression checks

Run `npm test -- --run tests/workspace-project-integrity.test.ts`
plus the existing scaffold tests. Validate an actual iOS Safari Vivari preview
before concluding browser/service-worker compatibility.
