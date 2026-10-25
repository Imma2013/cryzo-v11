type Disposable = { dispose(): void };
function abortedBoot() {
  return Object.assign(new Error("Runtime startup was superseded by a fresh session"), {code: "ERR_ABORTED"});
}
/** One boot per document. Retired boot promises cannot replace a newer session. */
export class RuntimeBoot<T extends Disposable> {
  private value: T | null = null;
  private flight: {promise: Promise<T>; controller: AbortController} | null = null;
  constructor(private readonly create: (signal: AbortSignal) => Promise<T>) {}
  get current() { return this.value; }
  get pending() { return this.flight?.promise ?? null; }
  get(): Promise<T> {
    if (this.value) return Promise.resolve(this.value);
    if (this.flight) return this.flight.promise;
    const controller = new AbortController();
    const flight = {controller, promise: null as unknown as Promise<T>};
    this.flight = flight;
    flight.promise = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const value = await this.create(controller.signal);
          if (controller.signal.aborted || this.flight !== flight) { value.dispose(); throw abortedBoot(); }
          this.value = value;
          return value;
        } catch (error) {
          if (controller.signal.aborted) throw abortedBoot();
          const code = (error as {code?: string})?.code;
          if (attempt > 0 || !["ERR_BOOT_TIMEOUT", "ERR_WORKER"].includes(code || "")) throw error;
        }
      }
    })().finally(() => { if (this.flight === flight) this.flight = null; });
    return flight.promise;
  }
  reset() {
    const previous = this.value, flight = this.flight;
    this.value = null; this.flight = null;
    flight?.controller.abort();
    previous?.dispose();
  }
}
