# Vivari startup ownership

Cryzo mounts the authoritative conversation source from Convex after boot, just as its project switch does. It must not first restore the previous document's complete OPFS filesystem. The SDK's default filesystem mirror is disabled in the generated filesystem worker; its old OPFS files are retained without being read, rewritten, or deleted.

The separate `vv-depcache` store remains enabled. Opening browser storage is optional and has a 1.5-second startup budget. A late successful cache initialization remains available for later dependency operations. Worker startup cannot wait indefinitely for storage permission, a stalled storage backend, or another tab.

`scripts/vivari-boot-patch.mjs` checks the pinned Vivari 1.1.1 bootstrap contract and fails the build if it changes. The filesystem patch receives its own content hash, and the generated kernel references that hash. Never replace a worker's contents beneath an unchanged immutable asset name.

`RuntimeBoot` owns one in-flight startup and one active sandbox. It retries a transient worker/boot timeout once. Reset aborts a pending boot and calls the real public `Vivari.teardown()` method on an active instance. An obsolete boot cannot become the active sandbox after reset. Post-boot filesystem and Service Worker setup are bounded and cleaned up on failure.

Verification includes executing the published filesystem worker and its actual Wasm VFS with a deliberately stalled browser-storage implementation. Lifecycle tests cover simultaneous callers, bounded retries, shutdown, and reset during startup. Conversation restoration tests cover Retry after a failed initial boot.
