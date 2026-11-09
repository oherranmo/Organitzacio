// Servidor local opcional, sense dependències: serveix l'app i fa de pont per llegir
// calendaris .ics que el navegador no deixa descarregar directament (CORS).
// Ús:  node server.js   →  http://localhost:8080
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = process.env.PORT || 8080, HOST = process.env.HOST || "127.0.0.1";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/proxy") {
    const target = u.searchParams.get("url") || "";
    if (!/^https:\/\//i.test(target)) { res.writeHead(400); return res.end("Només https"); }
    try {
      const r = await fetch(target, { redirect: "follow", signal: AbortSignal.timeout(15000) });
      const text = await r.text();
      if (!r.ok || !text.includes("BEGIN:VCALENDAR")) { res.writeHead(502); return res.end("No és un calendari iCal"); }
      res.writeHead(200, { "content-type": "text/calendar; charset=utf-8" }); return res.end(text);
    } catch (e) { res.writeHead(502); return res.end("Error: " + e.message); }
  }
  const file = path.join(__dirname, u.pathname === "/" ? "index.html" : path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(__dirname) || /server\.js$|\.git/.test(file)) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("No trobat"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }); res.end(data);
  });
}).listen(PORT, HOST, () => console.log(`Organitza'm a http://${HOST}:${PORT}`));
