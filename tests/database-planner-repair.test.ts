import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("ai", () => ({ generateText: vi.fn() }));
import { generateText } from "ai";
import { DatabasePlanProviderError, DatabasePlanValidationError, planDatabaseBeforeFrontend } from "@/lib/server/database-first";
const generate = vi.mocked(generateText);
const invalid = JSON.stringify({ name: "Furniture", entities: [{ name: "Orders", fields: { total: "number" }, access: "private", seed: [{ total: 100 }] }] });
const valid = JSON.stringify({ name: "Furniture", entities: [
  { name: "Products", fields: { name: "string" }, access: "public-read", seed: [{ name: "Desk" }] },
  { name: "Orders", fields: { total: "number" }, access: "private", seed: [] },
] });
afterEach(() => vi.resetAllMocks());
describe("database planner repair", () => {
  it("repairs private Orders without changing their access", async () => {
    generate.mockResolvedValueOnce({ text: invalid } as any).mockResolvedValueOnce({ text: valid } as any);
    const plan = await planDatabaseBeforeFrontend({ model: {} as any, prompt: "Build a furniture store", requireEntities: true });
    expect(plan.entities.find(entity => entity.name === "Orders")).toMatchObject({ access: "private", seed: [] });
    expect(plan.entities[0].seed).toHaveLength(1);
    expect(generate.mock.calls[1][0].prompt).toContain("Private entity Orders");
  });
  it("stops after one repair and does not suppress provider errors", async () => {
    generate.mockResolvedValue({ text: invalid } as any);
    await expect(planDatabaseBeforeFrontend({ model: {} as any, prompt: "Store" })).rejects.toBeInstanceOf(DatabasePlanValidationError);
    expect(generate).toHaveBeenCalledTimes(2);
    generate.mockReset().mockRejectedValue(new Error("Provider 401"));
    await expect(planDatabaseBeforeFrontend({ model: {} as any, prompt: "Store" })).rejects.toBeInstanceOf(DatabasePlanProviderError);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("repairs empty required schemas", async () => {
    generate.mockResolvedValueOnce({ text: '{"entities":[]}' } as any).mockResolvedValueOnce({ text: valid } as any);
    expect((await planDatabaseBeforeFrontend({ model: {} as any, prompt: "Shop", requireEntities: true })).entities).toHaveLength(2);
  });
});
