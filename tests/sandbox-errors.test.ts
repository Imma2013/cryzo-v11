import { describe, expect, it } from "vitest";
import { isSandboxInfrastructureError } from "@/lib/workspace/sandbox";

describe("Vivari infrastructure error classification", () => {
  it("recognizes boot and worker failures as runtime infrastructure", () => {
    expect(isSandboxInfrastructureError(Object.assign(new Error("timeout"), { code: "ERR_BOOT_TIMEOUT" }))).toBe(true);
    expect(isSandboxInfrastructureError(Object.assign(new Error("worker failed"), { code: "ERR_WORKER" }))).toBe(true);
    expect(isSandboxInfrastructureError(Object.assign(new Error("preview failed"), { code: "ERR_PREVIEW_SERVICE_WORKER" }))).toBe(true);
  });

  it("does not classify generated-project failures as runtime infrastructure", () => {
    expect(isSandboxInfrastructureError(new Error("TypeScript project check failed (2)"))).toBe(false);
    expect(isSandboxInfrastructureError(new Error("npm run build exited with code 1"))).toBe(false);
  });
});
