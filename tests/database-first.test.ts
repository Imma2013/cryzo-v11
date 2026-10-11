import { describe, it, expect } from "vitest";
import { parseDatabasePlan, verifiedBackendContext } from "@/lib/server/database-plan";

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
  it("does not allow unbounded seed payloads", () => {
    expect(() => parseDatabasePlan(JSON.stringify({ entities:[{name:"Dogs",fields:{name:"string"},access:"public-read",seed:Array.from({length:7},()=>({name:"Poppy"}))}]}))).toThrow(/Too many/);
  });
});
