/* Google Calendar bidireccional (OAuth al navegador, sense servidor). Cal un "ID de client" propi de Google Cloud. */
(function () {
  const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";
  const API = "https://www.googleapis.com/calendar/v3";
  let token = null, exp = 0, msg = "";
  const on = () => S.google && S.google.clientId && S.google.connected;
  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  const loadGIS = () => new Promise((ok, ko) => {
    if (window.google && google.accounts && google.accounts.oauth2) return ok();
    const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.onload = ok; s.onerror = () => ko(new Error("No es pot carregar Google"));
    document.head.appendChild(s);
  });
  async function auth(interactive) {
    if (token && Date.now() < exp - 60000) return token;
    await loadGIS();
    return new Promise((ok, ko) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: S.google.clientId, scope: SCOPE,
        callback: (r) => { if (r.error) return ko(new Error(r.error)); token = r.access_token; exp = Date.now() + r.expires_in * 1000; ok(token); },
        error_callback: (e) => ko(new Error(e.type || "error")),
      });
      tc.requestAccessToken({ prompt: interactive ? "consent" : "" });
    });
  }
  async function api(path, opt = {}) {
    const r = await fetch(API + path, { ...opt, headers: { Authorization: "Bearer " + token, "content-type": "application/json" } });
    if (r.status === 401) { token = null; throw new Error("sessió caducada"); }
    if (r.status === 204) return {};
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && j.error.message) || "error " + r.status);
    return j;
  }
  const dayMs = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };

  async function pull() {
    const gids = new Set(S.events.map((e) => e.gid).filter(Boolean));
    const list = (await api("/users/me/calendarList?minAccessRole=reader")).items || [];
    const min = new Date(Cal.startOfDay(Date.now()) - DAY).toISOString(), max = new Date(Date.now() + 60 * DAY).toISOString();
    const cals = [], events = [];
    S.google.all = list.map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor || COLORS[0] }));
    if (!S.google.hidden) S.google.hidden = list.filter((c) => c.selected === false).map((c) => c.id); // primera vegada: els marcats a Google
    for (const c of list.filter((x) => !S.google.hidden.includes(x.id))) {
      const cid = "g:" + c.id;
      cals.push({ id: cid, name: c.summaryOverride || c.summary, color: c.backgroundColor || COLORS[0], google: true });
      let pageToken = "";
      do {
        const j = await api("/calendars/" + encodeURIComponent(c.id) + "/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=" + encodeURIComponent(min) + "&timeMax=" + encodeURIComponent(max) + (pageToken ? "&pageToken=" + pageToken : ""));
        (j.items || []).forEach((it) => {
          if (it.status === "cancelled" || gids.has(it.id) || !it.start) return;
          const allDay = !!it.start.date;
          events.push({ id: cid + ":" + it.id, cal: cid, title: it.summary || "(sense títol)", location: it.location || "", allDay,
            start: allDay ? dayMs(it.start.date) : Date.parse(it.start.dateTime), end: allDay ? dayMs(it.end.date) : Date.parse(it.end.dateTime) });
        });
        pageToken = j.nextPageToken || "";
      } while (pageToken);
    }
    S.events = S.events.filter((e) => !(e.cal && String(e.cal).startsWith("g:"))).concat(events);
    S.calendars = S.calendars.filter((c) => !c.google).concat(cals);
    S.google.lastSync = Date.now(); msg = "";
  }
  async function sync(interactive) {
    if (!on()) return;
    try { await auth(interactive); await pull(); }
    catch (e) { msg = e.message === "popup_failed_to_open" || /interaction|popup|immediate|access_denied/.test(e.message) ? "Cal tornar a connectar (botó de sota)." : "Error: " + e.message; }
    save();
  }

  const body = (e) => {
    const b = { summary: e.title, location: e.location || undefined,
      reminders: { useDefault: false, overrides: (e.remind || []).filter((m) => m <= 40320).map((m) => ({ method: "popup", minutes: m })) } };
    if (e.allDay) { b.start = { date: ymd(e.start) }; b.end = { date: ymd(e.end || e.start + DAY) }; }
    else { b.start = { dateTime: new Date(e.start).toISOString(), timeZone: tz() }; b.end = { dateTime: new Date(e.end).toISOString(), timeZone: tz() }; }
    if (e.rrule) b.recurrence = ["RRULE:FREQ=" + e.rrule.freq];
    return JSON.stringify(b);
  };
  hooks.evForm = (e) => (on() ? `<label class="chk"><input type="checkbox" id="e-google" ${e.gid || !e.id ? "checked" : ""}>Desar també a Google Calendar</label>` : "");
  hooks.evSaved = (ev) => {
    const box = document.getElementById("e-google"); if (!box || !box.checked) return;
    (async () => {
      try {
        await auth(false);
        if (ev.gid) await api("/calendars/primary/events/" + ev.gid, { method: "PATCH", body: body(ev) });
        else ev.gid = (await api("/calendars/primary/events", { method: "POST", body: body(ev) })).id;
        save(); toast("Desat a Google Calendar ✔");
      } catch (e) { toast("No s'ha pogut desar a Google: " + e.message); }
    })();
  };
  hooks.evDeleted = (ev) => { if (ev && ev.gid && on()) auth(false).then(() => api("/calendars/primary/events/" + ev.gid, { method: "DELETE" })).catch(() => toast("No s'ha esborrat de Google (torna a connectar)")); };
  hooks.sync = () => (token && Date.now() < exp ? sync(false) : null);
  const prevStart = hooks.start; hooks.start = () => { prevStart && prevStart(); if (on()) sync(false).then(render); };

  hooks.cals.push(() => {
    const n = S.events.filter((e) => String(e.cal || "").startsWith("g:")).length, ok = on();
    return `<h2>Google Calendar</h2><div class="card">
      ${ok ? `<div class="hint">✅ Connectat${S.google.lastSync ? " · sincronitzat " + hm(S.google.lastSync) + " · " + n + " esdeveniments (60 dies)" : ""}${token && Date.now() < exp ? "" : " · sessió en pausa"}</div>${msg ? `<div class="err">${esc(msg)}</div>` : ""}
        <div class="hint" style="margin-top:8px">Calendaris a mostrar:</div>${(S.google.all || []).map((c) => `<label class="chk"><input type="checkbox" data-act="g-cal" data-id="${esc(c.id)}" ${(S.google.hidden || []).includes(c.id) ? "" : "checked"}><span class="dot" style="background:${esc(c.color)};margin:0"></span>${esc(c.name)}</label>`).join("")}
        <div class="row"><button class="primary" data-act="g-sync">↻ Sincronitzar</button><button class="danger" data-act="g-off">Desconnectar</button></div>`
      : `<label>ID de client de Google (OAuth, tipus “Aplicació web”)</label><input id="g-id" value="${esc(S.google.clientId)}" placeholder="xxxx.apps.googleusercontent.com">
        <div class="row" style="margin-top:12px"><button class="primary" data-act="g-on">Connectar amb Google</button></div>
        <details><summary>Com aconseguir l'ID de client?</summary><ol><li>A <b>console.cloud.google.com</b> crea un projecte i activa l'<i>API de Google Calendar</i>.</li><li><i>Credencials → Crear credencials → ID de client OAuth → Aplicació web</i>.</li><li>A “Orígens JavaScript autoritzats” posa l'adreça on obres aquesta app (p. ex. <code>${esc(location.origin)}</code>).</li><li>Si l'app d'OAuth està en “prova”, afegeix el teu compte com a usuari de prova.</li></ol>
        <p class="hint">Llegeix tots els teus calendaris i hi pot crear/editar/esborrar només els esdeveniments creats aquí. L'ID no és un secret.</p></details>`}</div>`;
  });
  document.addEventListener("click", async (ev) => {
    const a = ev.target.closest("[data-act]")?.dataset.act;
    if (a === "g-on") {
      const id = $("#g-id").value.trim(); if (!/\.apps\.googleusercontent\.com$/.test(id)) return toast("L'ID ha d'acabar en .apps.googleusercontent.com");
      S.google = { clientId: id, connected: true }; save(); toast("Obrint Google…"); await sync(true); render();
    }
    if (a === "g-sync") { toast("Sincronitzant…"); await sync(true); render(); }
    if (a === "g-off") { token = null; S.google.connected = false; S.events = S.events.filter((e) => !String(e.cal || "").startsWith("g:")); S.calendars = S.calendars.filter((c) => !c.google); save(); render(); }
  });
  document.addEventListener("change", async (ev) => {
    const el = ev.target; if (el.dataset.act !== "g-cal") return;
    const h = new Set(S.google.hidden || []); el.checked ? h.delete(el.dataset.id) : h.add(el.dataset.id);
    S.google.hidden = [...h]; save();
    S.events = S.events.filter((e) => e.cal !== "g:" + el.dataset.id || el.checked); render();
    if (el.checked) { await sync(false); render(); }
  });
})();
