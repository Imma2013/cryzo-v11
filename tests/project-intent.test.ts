import { describe, expect, it } from "vitest";
import { isBookOrPublishingRequest, isAutomotiveRequest, mustProvisionCatalog, offDomainGeneratedPaths } from "@/lib/server/project-intent";
describe("bookstore domain contract", () => {
  it("recognizes book website catalog requirements", () => {
    expect(mustProvisionCatalog("Make a book website")).toBe(true);
    expect(isBookOrPublishingRequest("bookstore")).toBe(true);
  });
  it("flags car and chauffeur source in a bookstore", () => {
    expect(offDomainGeneratedPaths("a bookstore", ["src/App.tsx", "src/components/ChassisSpotlight.tsx", "src/data/vehicles.ts"])).toEqual(["src/components/ChassisSpotlight.tsx", "src/data/vehicles.ts"]);
  });
  it("does not block requested automotive themes", () => {
    expect(isAutomotiveRequest("car website")).toBe(true);
    expect(offDomainGeneratedPaths("a car-themed bookstore", ["src/components/VehicleModal.tsx"])).toEqual([]);
  });
});
