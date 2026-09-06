import { describe, expect, it } from "vitest";
import {
  backendRequirementPrompt,
  backendRequirementsFromPrompt,
  missingBackendRequirements,
  parseCryzoCloudResources,
} from "../src/lib/ai/cryzo-cloud-resources";

describe("Cryzo Cloud build resources", () => {
  it("parses legacy cloud config regardless of action attribute order", () => {
    const text = `<cryzoArtifact id="a" title="Backend">
<cryzoAction filePath="cryzo/cloud.json" type="file">{"name":"Dogs","auth":{"providers":["password"]},"entities":[{"name":"Favorites","access":"private","fields":{"dogId":"string"}}]}</cryzoAction>
</cryzoArtifact>`;
    const resources = parseCryzoCloudResources(text);
    expect(resources.name).toBe("Dogs");
    expect(resources.authProviders).toEqual(["password"]);
    expect(resources.entities).toEqual([
      { name: "Favorites", access: "private", fields: { dogId: "string" } },
    ]);
  });

  it("parses first-class entity and auth resources", () => {
    const text = `<cryzoAction type="file" filePath="cryzo/entities/DogProfile.json">{"fields":{"name":"string"},"access":"public-read"}</cryzoAction>
<cryzoAction filePath="cryzo/auth/config.json" type="file">{"providers":["password","google"]}</cryzoAction>`;
    const resources = parseCryzoCloudResources(text);
    expect(resources.entities[0]?.name).toBe("DogProfile");
    expect(resources.authProviders).toEqual(["password", "google"]);
  });

  it("gates explicit database and auth requests", () => {
    const requirements = backendRequirementsFromPrompt("add a db and Google login");
    expect(requirements.database).toBe(true);
    expect(requirements.auth).toBe(true);
    expect(requirements.googleAuth).toBe(true);
    expect(missingBackendRequirements(requirements, {
      authProviders: [],
      entities: [],
      functions: [],
    })).toEqual(["database entities", "authentication config", "Google authentication"]);
  });

  it("forbids the nonexistent generated-app @cryzo/cloud package", () => {
    const requirements = backendRequirementsFromPrompt("add a database for saved meals");
    const prompt = backendRequirementPrompt(requirements);
    expect(prompt).toContain("NEVER add @cryzo/cloud");
    expect(prompt).toContain("src/lib/cryzo-cloud.ts");
    expect(prompt).toContain("managed HTTPS API");
  });
});
