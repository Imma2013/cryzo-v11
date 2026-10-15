import { describe, expect, it } from "vitest";
import { deviceUrlFromLogs, selectExpoLaunchTarget } from "@/lib/workspace/expo-preview";
describe("Expo preview targets and links", () => {
  it("prefers Expo Go with the bundled SDK modules despite expo-dev-client being installed", () => {
    expect(selectExpoLaunchTarget(["expo-dev-client", "expo-camera", "react-native"], ["expo-camera"])).toBe("expo-go");
    expect(selectExpoLaunchTarget(["react-native-special-sdk"], [])).toBe("development-build");
  });
  it("takes the device URL from Metro output, rather than the web URL", () => {
    const logs = "\u001b[32mWeb is waiting on https://web.example\u001b[0m\nMetro waiting on exp://tunnel.example\n";
    expect(deviceUrlFromLogs(logs, "cryzo-app", "expo-go")).toBe("exp://tunnel.example");
    expect(deviceUrlFromLogs("Metro waiting on cryzo-app://expo-development-client/?url=https%3A%2F%2Ftunnel.example", "cryzo-app", "development-build")).toContain("cryzo-app://");
    expect(deviceUrlFromLogs("Starting Expo…", "cryzo-app", "expo-go")).toBeNull();
  });
});
