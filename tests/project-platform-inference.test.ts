import { describe, it, expect } from "vitest";
import { inferProjectPlatforms, requestedNativeLanguage, DEFAULT_PROJECT_PLATFORMS } from "@/lib/project-platform";

describe("automatic framework selection", () => {
  it("routes calorie tracking app to a shared iOS + Android project", () => {
    expect(inferProjectPlatforms("Make an app for calorie tracking")).toEqual(["ios", "android"]);
    expect(inferProjectPlatforms("Build a mobile app for calorie tracking with Expo")).toEqual(["ios", "android"]);
  });
  it("routes websites to Vite even when the subject mentions phones", () => {
    expect(inferProjectPlatforms("Make a bookstore website")).toEqual(["web"]);
    expect(inferProjectPlatforms("Create an iPhone case ecommerce website")).toEqual(["web"]);
  });
  it("allows platform-specific targets without selector clicks", () => {
    expect(inferProjectPlatforms("Build an iOS app")).toEqual(["ios"]);
    expect(inferProjectPlatforms("Build an Android mobile app")).toEqual(["android"]);
  });
  it("preserves default for general writing, and legacy explicit choices", () => {
    expect(inferProjectPlatforms("Write a poem")).toEqual(DEFAULT_PROJECT_PLATFORMS);
    expect(inferProjectPlatforms("Make a mobile app", ["web"], true)).toEqual(["web"]);
  });
  it("detects native language requests without silently claiming Expo can compile them", () => {
    expect(requestedNativeLanguage("Create SwiftUI iPhone app")).toBe("swift");
    expect(requestedNativeLanguage("Build Kotlin Jetpack Compose Android app")).toBe("kotlin");
  });
});
