import { describe, expect, it } from "vitest";
import { deviceUrlFromLogs, selectExpoLaunchTarget } from "@/lib/workspace/expo-preview";
import { GET } from "@/app/api/publish/mobile/qr/route";
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
    expect(deviceUrlFromLogs(JSON.stringify({ runtime: "expo", url: "exp://live-tunnel.example" }), "cryzo-app", "expo-go")).toBe("exp://live-tunnel.example");
  });
  it("renders real Expo Go and custom development-client QR codes, rejecting unrelated links", async () => {
    for (const url of ["exp://live-tunnel.example", "myapp://expo-development-client/?url=https%3A%2F%2Flive-tunnel.example"]) {
      const response = await GET(new Request("https://cryzo.example/api/publish/mobile/qr?data=" + encodeURIComponent(url)));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<svg");
    }
    expect((await GET(new Request("https://cryzo.example/api/publish/mobile/qr?data=" + encodeURIComponent("javascript:alert(1)")))).status).toBe(400);
  });
});
