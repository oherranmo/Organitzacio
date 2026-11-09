// Servidor d'Organitza'm: serveix l'app, fa de pont per llegir calendaris .ics (CORS)
// i envia notificacions push perquè els avisos arribin amb l'app tancada.
// Ús:  npm install && node server.js   →  http://localhost:8080
const http = require("http"), fs = require("fs"), path = require("path");
let webpush = null;
try { webpush = require("web-push"); } catch { console.log("(sense web-push: executa `npm install` per activar les notificacions push)"); }
const PORT = process.env.PORT || 8080, HOST = process.env.HOST || "127.0.0.1";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const PUBLIC = new Set(["index.html", "style.css", "app.js", "ics.js", "routines.js", "push.js", "google.js", "inbox.js", "sw.js", "icon.svg", "manifest.webmanifest"]);
const VAPID_FILE = path.join(__dirname, "vapid.json"), DATA_FILE = path.join(__dirname, "data.json");

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
let vapid = readJSON(VAPID_FILE, null);
if (webpush && !vapid) { vapid = webpush.generateVAPIDKeys(); fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid)); }
if (webpush) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", vapid.publicKey, vapid.privateKey);
// subs: { [endpoint]: { sub, items: [{key, at, title, body}] } }
let data = readJSON(DATA_FILE, { subs: {} });
const persist = () => fs.writeFile(DATA_FILE, JSON.stringify(data), () => {});

async function dispatch() {
  const now = Date.now();
  for (const [ep, rec] of Object.entries(data.subs)) {
    const due = rec.items.filter((i) => i.at <= now && i.at > now - 30 * 60000);
    rec.items = rec.items.filter((i) => i.at > now); // les passades (enviades o massa antigues) es descarten
    for (const i of due) {
      try { await webpush.sendNotification(rec.sub, JSON.stringify({ title: i.title, body: i.body, tag: i.key }), { TTL: 600, urgency: "high" }); }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { delete data.subs[ep]; break; } console.log("push error", e.statusCode || e.message); }
    }
  }
  persist();
}
if (webpush) setInterval(dispatch, 15000);

const body = (req) => new Promise((ok, ko) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 2e6) { req.destroy(); ko(new Error("massa gran")); } }); req.on("end", () => ok(b)); });
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/proxy") {
      const target = u.searchParams.get("url") || "";
      if (!/^https:\/\//i.test(target)) { res.writeHead(400); return res.end("Només https"); }
      const r = await fetch(target, { redirect: "follow", signal: AbortSignal.timeout(15000) });
      const text = await r.text();
      if (!r.ok || !text.includes("BEGIN:VCALENDAR")) { res.writeHead(502); return res.end("No és un calendari iCal"); }
      res.writeHead(200, { "content-type": "text/calendar; charset=utf-8" }); return res.end(text);
    }
    if (u.pathname === "/api/vapid") return webpush ? json(res, 200, { key: vapid.publicKey }) : json(res, 501, { error: "web-push no instal·lat" });
    if (u.pathname === "/api/push/schedule" && req.method === "POST") {
      if (!webpush) return json(res, 501, { error: "web-push no instal·lat" });
      const { sub, items } = JSON.parse(await body(req));
      if (!sub || !sub.endpoint || !Array.isArray(items)) return json(res, 400, { error: "dades incorrectes" });
      data.subs[sub.endpoint] = { sub, items: items.slice(0, 500).map((i) => ({ key: String(i.key), at: +i.at, title: String(i.title).slice(0, 200), body: String(i.body || "").slice(0, 300) })) };
      persist(); return json(res, 200, { ok: true, n: data.subs[sub.endpoint].items.length });
    }
    if (u.pathname === "/api/push/unsubscribe" && req.method === "POST") {
      const { endpoint } = JSON.parse(await body(req)); delete data.subs[endpoint]; persist(); return json(res, 200, { ok: true });
    }
    const name = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
    if (!PUBLIC.has(name)) { res.writeHead(404); return res.end("No trobat"); }
    fs.readFile(path.join(__dirname, name), (err, buf) => {
      if (err) { res.writeHead(404); return res.end("No trobat"); }
      res.writeHead(200, { "content-type": TYPES[path.extname(name)] || "application/octet-stream" }); res.end(buf);
    });
  } catch (e) { res.writeHead(500); res.end("Error: " + e.message); }
});
if (require.main === module) server.listen(PORT, HOST, () => console.log(`Organitza'm a http://${HOST}:${PORT}${webpush ? " (push activat)" : ""}`));
module.exports = { server, dispatch, data };
