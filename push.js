/* Notificacions push: el servidor rep la teva llista de recordatoris i te'ls envia encara que l'app estigui tancada. */
(function () {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && location.protocol !== "file:";
  let timer = null, status = "";
  const b64 = (s) => Uint8Array.from(atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const getSub = async () => { const r = await navigator.serviceWorker.ready; return r.pushManager.getSubscription(); };

  function buildItems() {
    const now = Date.now(), items = [];
    occ(now - HOUR, now + 7 * DAY).forEach((o) => {
      const e = o.ev;
      if (e.allDay) { if (remindersFor(e).length && o.start + 8 * HOUR > now) items.push({ key: e.id + o.start + "d", at: o.start + 8 * HOUR, title: "📌 Avui: " + e.title, body: "Tot el dia" }); return; }
      remindersFor(e).forEach((m) => items.push({ key: e.id + o.start + m, at: o.start - m * MIN, title: "⏰ " + e.title, body: (m === 0 ? "Comença ara" : "Comença d'aquí " + human(m * MIN)) + " (" + hm(o.start) + ")" + (e.location ? " · 📍 " + e.location : "") }));
      if (e.travel > 0) items.push({ key: e.id + o.start + "t", at: o.start - (e.travel + 5) * MIN, title: "🚶 Toca sortir! " + e.title, body: "Trigaràs " + e.travel + " min (" + hm(o.start) + ")" });
    });
    return items.filter((i) => i.at > now - 5 * MIN);
  }
  async function push() {
    if (!S.push) return;
    try {
      const sub = await getSub(); if (!sub) return;
      const r = await fetch("api/push/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sub: sub.toJSON(), items: buildItems() }) });
      status = r.ok ? "ok" : "error";
    } catch { status = "error"; }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(push, 1500); };
  async function enable() {
    try {
      if (!supported) return toast("Aquest navegador no suporta push (a iPhone, instal·la primer l'app a la pantalla d'inici)");
      if ((await Notification.requestPermission()) !== "granted") return toast("Cal permetre les notificacions");
      const k = await fetch("api/vapid"); if (!k.ok) return toast("El servidor no té push (executa npm install)");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64((await k.json()).key) }));
      S.push = true; save(); await push(); toast(status === "ok" ? "Avisos amb l'app tancada: activats ✔" : "No s'ha pogut connectar amb el servidor"); render();
    } catch (e) { toast("Error en activar push"); }
  }
  async function disable() {
    const sub = await getSub().catch(() => null);
    if (sub) { fetch("api/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    S.push = false; save(); render();
  }

  hooks.saved = later;
  const prevTick = hooks.tick; hooks.tick = () => { prevTick && prevTick(); later(); };
  const prevStart = hooks.start; hooks.start = () => { prevStart && prevStart(); if (S.push) later(); };
  hooks.cals.push(() => `<h2>Avisos amb l'app tancada</h2><div class="card">${!supported ? `<div class="hint">Aquest navegador/mode no suporta notificacions push. Necessita https (o localhost) i, a iPhone, l'app instal·lada a la pantalla d'inici.</div>`
    : S.push ? `<div class="hint">🔔 Activat${status === "error" ? " — <span class=\"err\">no s'ha pogut contactar amb el servidor</span>" : ""}. El servidor t'enviarà els recordatoris dels propers 7 dies.</div><button data-act="push-off">Desactivar</button>`
    : `<div class="hint">Requereix executar <code>node server.js</code> en un servidor amb https. Vegeu el README.</div><button class="primary" data-act="push-on">🔔 Activar push</button>`}</div>`);
  document.addEventListener("click", (ev) => { const a = ev.target.closest("[data-act]")?.dataset.act; if (a === "push-on") enable(); if (a === "push-off") disable(); });
})();
