# Cryzo database recovery, generated-source contracts and Expo Device Preview

- Missing catalog database entities are planned and created in Cryzo Cloud even when the project already contains frontend code. For bookstores the planner is instructed to create a persistent Books catalog. The owner-authorized Convex transaction is still responsible for schema and seed verification.
- The Data dashboard shows real Convex entities and allows the user to prefill a database-recovery request when tables are absent; no invisible data mutation occurs from the dashboard.
- Bookstore intent outranks v5 design reference subject matter. Automotive example components are rejected during whole-project validation. Existing typed local imports now undergo AST named-export validation prior to launching Vite, including re-export barrels.
- For iOS/Android conversations, the workspace toolbar exposes an Expo Device Preview QR dialog. It uses the existing authenticated native-build API, with SourceFile[] serialization, incremental native source sync, Metro process reuse and explicit restart. Web projects never display that action. Device packages requiring custom native modules may need a development build.

## Manual production checks

1. Build a bookstore, verify only bookstore modules are generated, and inspect Books rows in Data.
2. On an older bookstore with no tables, choose Create database tables and submit its prefilled request. Existing files remain intact.
3. Trigger a `TS2305` local named import issue, verify the project validator reports the missing export before Vite, and an actual type fix is required.
4. Generate an Expo native app, scan Device Preview QR in Expo Go, close/reopen modal and verify tunnel reuse, then force Reconnect and verify restart.
5. Confirm signed-in ownership boundaries and Vercel production build/tests remain intact.
