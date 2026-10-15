/** Runtime-only bridge: Metro stays untouched and HMR upgrades are forwarded. */
export const EXPO_WEB_PROXY = String.raw`
const http = require("node:http"), net = require("node:net");
const metroPort = Number(process.env.CRYZO_EXPO_METRO_PORT || 8081);
const server = http.createServer((req, res) => {
  const upstream = http.request({ hostname: "127.0.0.1", port: metroPort, method: req.method, path: req.url, headers: req.headers }, reply => {
    res.writeHead(reply.statusCode || 502, { ...reply.headers, "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Resource-Policy": "cross-origin" });
    reply.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("Expo is starting. Retry shortly."); });
  req.pipe(upstream);
});
server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(metroPort, "127.0.0.1", () => {
    let headers = req.method + " " + req.url + " HTTP/1.1\r\n";
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers += req.rawHeaders[i] + ": " + req.rawHeaders[i + 1] + "\r\n";
    upstream.write(headers + "\r\n"); if (head.length) upstream.write(head); socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy()); socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy()); upstream.on("close", () => socket.destroy());
});
server.listen(Number(process.env.CRYZO_EXPO_PROXY_PORT || 5173), "0.0.0.0", () => console.log("Expo web proxy ready on " + server.address().port));
`;
