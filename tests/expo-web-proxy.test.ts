import { describe, expect, it } from "vitest";
import * as http from "node:http";
import * as net from "node:net";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { once } from "node:events";
import { EXPO_WEB_PROXY } from "@/lib/server/expo-web-proxy";

describe("Expo iframe bridge", () => {
  it("serves Metro with embedding headers and preserves HMR upgrades", async () => {
    const metro = http.createServer((_req, res) => res.end("Expo fixture"));
    metro.on("upgrade", (_req, socket) => {
      socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
      socket.on("data", bytes => socket.write(bytes));
    });
    metro.listen(0, "127.0.0.1"); await once(metro, "listening");
    let proxy!: http.Server; let socket: net.Socket | undefined;
    const require = createRequire(import.meta.url);
    try {
      runInNewContext(EXPO_WEB_PROXY, {
        require: (name: string) => name === "node:http" ? { ...http, createServer: (...args: any[]) => (proxy = (http.createServer as any)(...args)) } : require(name),
        process: { env: { CRYZO_EXPO_METRO_PORT: String((metro.address() as net.AddressInfo).port), CRYZO_EXPO_PROXY_PORT: "0" } },
        console: { log() {} },
      });
      await once(proxy, "listening");
      const port = (proxy.address() as net.AddressInfo).port;
      const page = await fetch("http://127.0.0.1:" + port);
      expect(await page.text()).toBe("Expo fixture");
      expect(page.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
      expect(page.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
      socket = net.connect(port, "127.0.0.1"); await once(socket, "connect");
      socket.write("GET /hot HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
      const [handshake] = await once(socket, "data");
      expect(handshake.toString()).toContain("101 Switching Protocols");
      socket.write("reload");
      const [echo] = await once(socket, "data");
      expect(echo.toString()).toBe("reload");
    } finally {
      socket?.destroy(); proxy?.closeAllConnections(); proxy?.close(); metro.closeAllConnections(); metro.close();
    }
  }, 10_000);
});
