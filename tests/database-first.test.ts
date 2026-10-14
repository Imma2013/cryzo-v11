import { describe, it, expect } from "vitest";
import { parseDatabasePlan, verifiedBackendContext } from "@/lib/server/database-plan";
import { shouldMutateProject, shouldProvisionDatabase } from "@/lib/server/build-routing";

const DOGS = JSON.stringify({
  name: "Paw Haven", authProviders: ["password"],
  entities: [{ name: "Dogs", fields: { name: "string", age: "number", adopted: "boolean" },
    access: "public-read", seed: [{ name: "Poppy", age: 2, adopted: false }] }],
});

describe("database-first planning", () => {
  it("creates a typed seedable catalog before frontend code", () => {
    const result = parseDatabasePlan(`\`\`\`json\n${DOGS}\n\`\`\``);
    expect(result.entities[0].name).toBe("Dogs");
    expect(result.entities[0].seed).toHaveLength(1);
    expect(verifiedBackendContext(result, "abc")).toContain("Convex has ALREADY created");
  });
  it("allows a static site without inventing tables", () => {
    expect(parseDatabasePlan('{"name":"Brochure","entities":[]}').entities).toEqual([]);
  });
  it("rejects invalid or duplicate entity schemas", () => {
    expect(() => parseDatabasePlan('{"name":"x","entities":[{"name":"Dogs","fields":{"id":"secret"}}]}')).toThrow(/Invalid field/);
    expect(() => parseDatabasePlan('{"entities":[{"name":"Dogs","fields":{"name":"string"}},{"name":"Dogs","fields":{"name":"string"}}]}')).toThrow(/duplicate/);
  });
  it("rejects undeclared data and fake personal records", () => {
    expect(() => parseDatabasePlan('{"entities":[{"name":"Dogs","fields":{"name":"string"},"access":"public-read","seed":[{"missing":"not allowed"}]}]}')).toThrow(/undeclared/);
    expect(() => parseDatabasePlan('{"entities":[{"name":"Profiles","fields":{"name":"string"},"access":"private","seed":[{"name":"John"}]}]}')).toThrow(/Private/);
  });
  it("keeps conversation out of the builder and makes web database-first", () => {
    expect(shouldMutateProject("Hello")).toBe(false);
    expect(shouldMutateProject("Can you explain this layout?")).toBe(false);
    expect(shouldMutateProject("Build a bookstore website")).toBe(true);
    expect(shouldProvisionDatabase({ mode: "build", platforms: ["web"], prompt: "Build a static festival site" })).toBe(true);
    expect(shouldProvisionDatabase({ mode: "build", platforms: ["ios", "android"], prompt: "Build a mobile calorie tracker" })).toBe(false);
    expect(shouldProvisionDatabase({ mode: "build", platforms: ["ios", "android"], prompt: "Build a mobile calorie tracker with login and cloud sync" })).toBe(true);
  });
  it("does not allow unbounded seed payloads", () => {
    expect(() => parseDatabasePlan(JSON.stringify({ entities:[{name:"Dogs",fields:{name:"string"},access:"public-read",seed:Array.from({length:7},()=>({name:"Poppy"}))}]}))).toThrow(/Too many/);
  });
});
