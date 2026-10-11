# Cryzo database-first build and stable preview lifecycle

## Database-first generation (Convex)

The user-selected build model designs a **typed** resource manifest before
frontend code is generated. For the first build it can infer records from
user intent (e.g. `Dogs` and `AdoptionApplications` for a dog adoption app),
even if the prompt does not explicitly mention a database. A genuinely
static page may have zero entities; every signed-in build still receives a
Cryzo Cloud namespace.

`src/lib/server/database-plan.ts` validates the proposed schema, public
access modes, and fictional seed records. `cloudAdmin.configureFromPublish`
applies all entity definitions and seeds initially empty public tables in
one owner-authorized Convex transaction. Retrying a build does not duplicate
records. A returned schema and sample record counts are independently
verified with `cloudAdmin.getOverview`, then sent to the model as binding
frontend context. The backend is not overwritten by a conflicting late model
artifact. Later explicit backend feature requests can extend the schema.

The existing Cryzo Cloud implementation uses app-scoped logical Convex
entities (`cloudApps`, `cloudEntitySchemas`, `cloudRecords`), not a physical
Convex deployment per generated app. User-owned data and authentication
remain protected. The dashboard's existing Data section automatically shows
these entity definitions and record counts.

## Switching tabs (Vivari)

When focus returns, Cryzo probes the Vivari filesystem and preserves the
existing dev server and iframe URL when the runtime is healthy. A tab switch
by itself **never** invokes `restartStreamingRuntime`. Only missing runtime
files, a dead/missing server, or explicit Service Worker transport failure
trigger restoration from persisted artifacts. The browser may still suspend
JavaScript while backgrounded; this architecture preserves state when Safari
retains the tab, rather than preventing iOS from suspending a browser.

## Smoke test checklist

- Create dog adoption application; ensure Data shows live `Dogs` entities and
  fictional seed records before generated components make database requests.
- Reload the chat and edit the page; previously inserted records are preserved
  without duplicates and schema names remain stable.
- Switch Safari/Chrome tabs multiple times: healthy preview stays on the same
  URL and retains scroll position and client state.
- Kill Vivari and return: restore only then, using saved Convex artifacts.
- Confirm Build mode, Plan mode and the v5 design reference routing still work.
