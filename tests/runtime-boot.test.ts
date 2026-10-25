import {describe, expect, it, vi} from "vitest";
import {RuntimeBoot} from "../src/lib/workspace/runtime-boot";
import {Sandbox} from "../src/lib/workspace/sandbox";
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a,b) => {resolve=a; reject=b;}); return {promise, resolve, reject}; }
const resource = () => ({dispose: vi.fn()});
describe("one owned runtime boot", () => {
  it("shares one in-flight boot between terminal, preview and restoration", async () => {
    const pending=deferred<ReturnType<typeof resource>>(), create=vi.fn(() => pending.promise), boot=new RuntimeBoot(create);
    const a=boot.get(), b=boot.get(), c=boot.get();expect(a).toBe(b);expect(b).toBe(c);expect(create).toHaveBeenCalledOnce();
    const value=resource();pending.resolve(value);expect(await a).toBe(value);expect(await boot.get()).toBe(value);expect(create).toHaveBeenCalledOnce();
  });
  it("retries a transient boot once and clears failure so manual retry can work", async () => {
    const create=vi.fn().mockRejectedValueOnce(Object.assign(new Error("worker timeout"),{code:"ERR_BOOT_TIMEOUT"})).mockResolvedValue(resource());
    const boot=new RuntimeBoot(create);await boot.get();expect(create).toHaveBeenCalledTimes(2);
    const fail=vi.fn().mockRejectedValue(Object.assign(new Error("worker timeout"),{code:"ERR_BOOT_TIMEOUT"}));const other=new RuntimeBoot(fail);
    await expect(other.get()).rejects.toThrow("worker timeout");expect(fail).toHaveBeenCalledTimes(2);
    fail.mockResolvedValue(resource());await other.get();expect(fail).toHaveBeenCalledTimes(3);
  });
  it("does not retry isolation or generated-project errors", async () => {
    for(const code of ["ERR_NOT_ISOLATED","BUILD_FAILED"]){const create=vi.fn().mockRejectedValue(Object.assign(new Error(code),{code}));await expect(new RuntimeBoot(create).get()).rejects.toThrow(code);expect(create).toHaveBeenCalledOnce();}
  });
  it("aborts and disposes an old boot without letting it replace a fresh runtime", async () => {
    const old=deferred<ReturnType<typeof resource>>(), fresh=deferred<ReturnType<typeof resource>>();
    const create=vi.fn().mockImplementationOnce(()=>old.promise).mockImplementationOnce(()=>fresh.promise);const boot=new RuntimeBoot(create);
    const retired=boot.get();const rejected=expect(retired).rejects.toMatchObject({code:"ERR_ABORTED"});const signal=create.mock.calls[0][0] as AbortSignal;
    boot.reset();expect(signal.aborted).toBe(true);const current=boot.get();
    const stale=resource(), value=resource();fresh.resolve(value);await current;old.resolve(stale);await rejected;
    expect(stale.dispose).toHaveBeenCalledOnce();expect(boot.current).toBe(value);boot.reset();expect(value.dispose).toHaveBeenCalledOnce();
  });
  it("uses Vivari's real public teardown method", () => {
    const teardown=vi.fn();const sandbox=new Sandbox({teardown} as any);sandbox.dispose();expect(teardown).toHaveBeenCalledOnce();
  });
});
