"use strict";
/* Organitza'm — agenda i recordatoris pensats per a TDAH. Tot es desa al dispositiu (localStorage). */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const MIN = 60000, HOUR = 3600000, DAY = Cal.DAY;
const DAYS = ["diumenge", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte"];
const MONTHS = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"];
const COLORS = ["#2f6f6a", "#c4571a", "#6a4fb3", "#b3366b", "#2b6cb0", "#8a7a1f"];
const REMIND_OPTS = [[1440, "1 dia abans"], [180, "3 hores abans"], [60, "1 hora abans"], [30, "30 min abans"], [10, "10 min abans"], [0, "A l'hora"]];

/* ---------- Estat ---------- */
const KEY = "organitzam.v1";
const defaults = () => ({ events: [], tasks: [], calendars: [], fired: {}, active: [], doneLog: [], settings: { remind: [60, 10, 0], sound: true } });
let S;
try { S = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { S = defaults(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

/* ---------- Formats ---------- */
const pad = (n) => String(n).padStart(2, "0");
const hm = (ms) => { const d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const ymd = (ms) => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
function dayLabel(ms) {
  const diff = Math.round((Cal.startOfDay(ms) - Cal.startOfDay(Date.now())) / DAY);
  const d = new Date(ms);
  const base = DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
  return diff === 0 ? "Avui · " + base : diff === 1 ? "Demà · " + base : base;
}
function human(ms) {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 1) return "ara mateix";
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return h + " h" + (r ? " " + r + " min" : "");
  const d = Math.floor(h / 24);
  return d + (d === 1 ? " dia" : " dies") + (h % 24 ? " " + (h % 24) + " h" : "");
}
const calOf = (id) => S.calendars.find((c) => c.id === id);
const colorOf = (ev) => (ev.cal && calOf(ev.cal) ? calOf(ev.cal).color : COLORS[0]);

/* ---------- Esdeveniments ---------- */
function occ(from, to) {
  const out = [];
  S.events.forEach((e) => Cal.occurrences(e, from, to).forEach((o) => out.push(o)));
  return out.sort((a, b) => a.start - b.start);
}
const remindersFor = (e) => (e.remind && e.remind.length ? e.remind : e.cal ? S.settings.remind : e.remind || []);

/* ---------- Recordatoris ---------- */
function notify(title, body, tag) {
  S.active.push({ id: uid(), title, body, tag });
  save(); renderAlerts();
  if (S.settings.sound) beep();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  if ("Notification" in window && Notification.permission === "granted") {
    const opts = { body, tag, requireInteraction: true, icon: "icon.svg" };
    navigator.serviceWorker?.getRegistration().then((r) => (r ? r.showNotification(title, opts) : new Notification(title, opts))).catch(() => { try { new Notification(title, opts); } catch {} });
  }
}
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = 660; o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(0.2, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + t + 0.2);
      o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.22);
    });
  } catch {}
}
function checkReminders() {
  const now = Date.now();
  for (const o of occ(now - 2 * HOUR, now + 2 * DAY)) {
    const e = o.ev; if (e.allDay) {
      const at = o.start + 8 * HOUR, key = e.id + "|" + o.start + "|day";
      if (now >= at && now < o.start + DAY && !S.fired[key] && (remindersFor(e).length)) { S.fired[key] = now; notify("📌 Avui: " + e.title, "Tot el dia", key); }
      continue;
    }
    const list = remindersFor(e).map((m) => ({ m, at: o.start - m * MIN, label: m === 0 ? "Comença ara" : "Comença d'aquí " + human(m * MIN) }));
    if (e.travel > 0) list.push({ m: -1, at: o.start - (e.travel + 5) * MIN, label: "🚶 Toca sortir! Trigaràs " + e.travel + " min" });
    const due = list.filter((r) => now >= r.at && now < o.start + 10 * MIN && !S.fired[e.id + "|" + o.start + "|" + r.m]).sort((a, b) => b.at - a.at);
    if (!due.length) continue;
    due.forEach((r) => (S.fired[e.id + "|" + o.start + "|" + r.m] = now)); // si n'hi ha de passats, només avisem l'últim
    const r = due[0];
    notify((r.m === -1 ? "" : "⏰ ") + e.title, r.label + " (" + hm(o.start) + ")" + (e.location ? " · 📍 " + e.location : ""), e.id + o.start);
  }
  // Recordatoris ajornats
  const snoozed = S.active.filter((a) => a.snoozeUntil && a.snoozeUntil <= now);
  if (snoozed.length) { snoozed.forEach((a) => { delete a.snoozeUntil; if (S.settings.sound) beep(); }); save(); renderAlerts(); }
  Object.keys(S.fired).forEach((k) => { if (now - S.fired[k] > 3 * DAY) delete S.fired[k]; });
  save();
}
function renderAlerts() {
  const now = Date.now();
  $("#alerts").innerHTML = S.active.filter((a) => !a.snoozeUntil || a.snoozeUntil <= now).map((a) =>
    `<div class="alert"><b>${esc(a.title)}</b>${esc(a.body)}<div class="row"><button data-act="ok" data-id="${a.id}">✔ Ja ho sé</button><button data-act="snooze" data-id="${a.id}">⏳ 5 min més</button></div></div>`).join("");
}

/* ---------- Entrada ràpida (llenguatge natural) ---------- */
function parseQuick(text) {
  let t = " " + text.trim() + " ", date = null, time = null;
  const now = new Date(), day0 = Cal.startOfDay(now.getTime());
  const cut = (re) => { const m = re.exec(t); if (m) t = t.replace(re, " "); return m; };
  let m;
  if ((m = cut(/\s(demà passat|passat demà)\s/i))) date = day0 + 2 * DAY;
  else if ((m = cut(/\s(demà)\s/i))) date = day0 + DAY;
  else if ((m = cut(/\s(avui)\s/i))) date = day0;
  else if ((m = cut(/\s(?:el\s+)?(diumenge|dilluns|dimarts|dimecres|dijous|divendres|dissabte)\s/i))) {
    const wd = DAYS.indexOf(m[1].toLowerCase()); let diff = (wd - now.getDay() + 7) % 7; if (diff === 0) diff = 7; date = day0 + diff * DAY;
  } else if ((m = cut(/\s(?:el\s+)?(\d{1,2})\/(\d{1,2})\s/))) { const d = new Date(now.getFullYear(), +m[2] - 1, +m[1]); if (d < day0) d.setFullYear(d.getFullYear() + 1); date = d.getTime(); }
  if ((m = cut(/\s(?:a\s+les|a\s+la|a\s+l')\s*(\d{1,2})(?:[:.h](\d{2}))?\s*h?\s/i)) || (m = cut(/\s(\d{1,2})[:.](\d{2})\s/)) || (m = cut(/\s(\d{1,2})\s?h\s/i))) time = [+m[1], +(m[2] || 0)];
  const title = t.replace(/\s+/g, " ").trim() || text.trim();
  if (!date && !time) return { task: title };
  if (!date) { const d = new Date(day0); d.setHours(time[0], time[1]); date = d.getTime() < Date.now() ? day0 + DAY : day0; }
  const d = new Date(date);
  if (!time) return { event: { title, allDay: true, start: d.getTime(), end: d.getTime() + DAY } };
  d.setHours(time[0], time[1], 0, 0);
  return { event: { title, allDay: false, start: d.getTime(), end: d.getTime() + HOUR } };
}
function quickAdd(text) {
  if (!text.trim()) return;
  const qi = $("#quick"); if (qi) qi.value = "";
  const r = parseQuick(text);
  if (r.event) {
    S.events.push({ id: uid(), remind: [...S.settings.remind], travel: 0, ...r.event }); save();
    toast("📅 Afegit a l'agenda: " + dayLabel(r.event.start) + (r.event.allDay ? "" : " a les " + hm(r.event.start)));
  } else { S.tasks.push({ id: uid(), title: r.task, done: false, steps: [], today: false, created: Date.now() }); save(); toast("📝 Afegit a tasques"); }
  render();
}

/* ---------- Vistes ---------- */
let tab = "now";
const TITLES = { now: "Ara", agenda: "Agenda", tasks: "Tasques", cals: "Calendaris" };

function evRow(o, showDay) {
  const e = o.ev;
  return `<div class="item" ${e.cal ? "" : `data-act="edit" data-id="${e.id}"`}>
    <span class="dot" style="background:${colorOf(e)}"></span>
    <span class="time">${e.allDay ? "tot el dia" : hm(o.start)}</span>
    <div class="t"><b>${esc(e.title)}</b><small>${showDay ? dayLabel(o.start) + " · " : ""}${e.location ? "📍 " + esc(e.location) + " · " : ""}${e.cal && calOf(e.cal) ? esc(calOf(e.cal).name) : ""}</small></div></div>`;
}
function taskRow(t) {
  const open = t.steps.filter((s) => !s.done).length;
  return `<div class="item ${t.done ? "done" : ""}">
    <input type="checkbox" ${t.done ? "checked" : ""} data-act="tdone" data-id="${t.id}" aria-label="Fet">
    <div class="t"><b data-act="tedit" data-id="${t.id}">${esc(t.title)}</b>
      ${t.steps.length ? `<ul class="steps">${t.steps.map((s, i) => `<li class="${s.done ? "done" : ""}"><input type="checkbox" ${s.done ? "checked" : ""} data-act="sdone" data-id="${t.id}" data-i="${i}"><span>${esc(s.title)}</span></li>`).join("")}</ul>` : ""}
      ${!t.done ? `<div class="row" style="margin-top:6px;justify-content:flex-start"><button class="ghost" style="padding:4px 8px;min-height:0;flex:0" data-act="split" data-id="${t.id}">＋ pas</button>${open || !t.steps.length ? `<button class="ghost" style="padding:4px 8px;min-height:0;flex:0" data-act="focus" data-id="${t.id}">⏱ Focus</button>` : ""}</div>` : ""}
    </div>
    <button class="star ${t.today ? "on" : ""}" data-act="today" data-id="${t.id}" title="Prioritat d'avui (màx. 3)">★</button></div>`;
}

function viewNow() {
  const now = Date.now(), list = occ(now - 12 * HOUR, now + 14 * DAY);
  const current = list.find((o) => !o.ev.allDay && o.start <= now && o.end > now);
  const next = list.find((o) => !o.ev.allDay && o.start > now);
  const hero = current || next;
  let h = `<div class="capture"><input id="quick" placeholder="Escriu-ho abans d'oblidar-ho… (ex: dentista demà a les 10:30)" enterkeyhint="send"><button class="primary" data-act="quick">＋</button></div>
  <div class="hint">Amb dia i hora → agenda amb recordatori. Sense → tasca.</div>`;
  if (hero) {
    const isNow = hero === current, left = isNow ? hero.end - now : hero.start - now;
    const gap = Math.min(1, Math.max(0, 1 - (hero.start - now) / (3 * HOUR)));
    h += `<div class="card hero"><div class="sub">${isNow ? "ARA ESTÀS EN" : "PROPER"}</div><div class="big">${esc(hero.ev.title)}</div>
      <div class="sub">${isNow ? "acaba d'aquí " + human(left) : "d'aquí " + human(left) + " · " + hm(hero.start)}${hero.ev.location ? " · 📍 " + esc(hero.ev.location) : ""}</div>
      ${!isNow ? `<div class="bar" title="Com més ple, més a prop"><i style="width:${Math.round(gap * 100)}%"></i></div>` : ""}</div>`;
  } else h += `<div class="card hero"><div class="sub">PROPER</div><div class="big">Res programat 🎉</div><div class="sub">Aprofita per avançar una tasca petita.</div></div>`;
  const today = list.filter((o) => ymd(o.start) === ymd(now) && o !== hero);
  if (today.length) h += `<h2>Resta d'avui</h2><div class="card">${today.map((o) => evRow(o)).join("")}</div>`;
  const pri = S.tasks.filter((t) => t.today && !t.done);
  h += `<h2>Només això (prioritats d'avui)</h2><div class="card">${pri.length ? pri.map(taskRow).join("") : `<div class="empty">Marca fins a 3 tasques amb ★ a la pestanya Tasques. Menys és més.</div>`}</div>`;
  const doneToday = S.doneLog.filter((t) => ymd(t) === ymd(now)).length;
  if (doneToday) h += `<div class="hint center">✅ Avui has acabat ${doneToday} ${doneToday === 1 ? "cosa" : "coses"}. Bona feina!</div>`;
  return h;
}
function viewAgenda() {
  const from = Cal.startOfDay(Date.now()), list = occ(from, from + 14 * DAY);
  let h = `<div class="row" style="margin:10px 0"><button class="primary" data-act="new">＋ Nou esdeveniment</button></div>`;
  if (!list.length) return h + `<div class="empty">Cap esdeveniment els propers 14 dies.</div>`;
  let last = "", body = "";
  list.forEach((o) => { const d = ymd(o.start); if (d !== last) { body += `<div class="day">${dayLabel(o.start)}</div>`; last = d; } body += evRow(o); });
  return h + `<div class="card" style="padding:4px 16px">${body}</div>`;
}
function viewTasks() {
  const open = S.tasks.filter((t) => !t.done), done = S.tasks.filter((t) => t.done).slice(-5);
  return `<div class="capture"><input id="newtask" placeholder="Nova tasca…" enterkeyhint="send"><button class="primary" data-act="addtask">＋</button></div>
  <div class="hint">Truc: si una tasca fa mandra, parteix-la en passos de 5 minuts amb “＋ pas”.</div>
  <div class="card">${open.length ? open.map(taskRow).join("") : `<div class="empty">Res pendent 🎉</div>`}</div>
  ${done.length ? `<h2>Fetes recentment</h2><div class="card">${done.map(taskRow).join("")}</div>` : ""}`;
}
function viewCals() {
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  return `<h2>Els teus calendaris</h2>
  <div class="card">${S.calendars.length ? S.calendars.map((c) => `<div class="cal item"><span class="dot" style="background:${c.color}"></span><div class="t"><b>${esc(c.name)}</b><small>${c.error ? `<span class="err">${esc(c.error)}</span>` : c.lastSync ? "Sincronitzat " + hm(c.lastSync) + " · " + S.events.filter((e) => e.cal === c.id).length + " esdeveniments" : "Sense sincronitzar"}</small></div>${c.url ? `<button data-act="sync" data-id="${c.id}">↻</button>` : ""}<button class="danger" data-act="delcal" data-id="${c.id}">✕</button></div>`).join("") : `<div class="empty">Encara no n'hi has connectat cap.</div>`}</div>
  <h2>Connectar per enllaç (Google, Outlook, Apple…)</h2>
  <div class="card"><label>Nom</label><input id="cal-name" placeholder="Feina, Personal…"><label>Enllaç iCal (.ics)</label><input id="cal-url" inputmode="url" placeholder="https://calendar.google.com/…/basic.ics">
    <div class="row" style="margin-top:12px"><button class="primary" data-act="addcal">Connectar</button><button data-act="importfile">Importar fitxer .ics</button></div>
    <input type="file" id="file" accept=".ics,text/calendar" hidden>
    <details><summary>On trobo l'enllaç?</summary>
      <p><b>Google Calendar</b> (a l'ordinador): Configuració → el teu calendari → <i>Integra el calendari</i> → <b>Adreça secreta en format iCal</b>.</p>
      <p><b>Outlook</b>: Configuració → Calendari → Calendaris compartits → Publicar un calendari → enllaç ICS.</p>
      <p><b>Apple/iCloud</b>: comparteix el calendari com a públic i copia l'enllaç (canvia <code>webcal://</code> per <code>https://</code> si cal).</p>
      <p class="hint">Aquest enllaç és secret: no el comparteixis. Es desa només al teu dispositiu.</p></details></div>
  <h2>Recordatoris</h2>
  <div class="card"><div class="hint">Per defecte per als esdeveniments dels teus calendaris:</div>
    ${REMIND_OPTS.map(([m, l]) => `<label class="chk"><input type="checkbox" data-act="defrem" data-m="${m}" ${S.settings.remind.includes(m) ? "checked" : ""}>${l}</label>`).join("")}
    <label class="chk"><input type="checkbox" data-act="sound" ${S.settings.sound ? "checked" : ""}>So i vibració</label>
    ${perm === "granted" ? `<div class="hint">🔔 Notificacions activades.</div>` : perm === "unsupported" ? `<div class="hint">Aquest navegador no suporta notificacions.</div>` : `<button class="primary" data-act="perm">🔔 Activar notificacions</button>`}
    <div class="hint" style="margin-top:10px">Els avisos salten mentre l'app és oberta (pot estar en segon pla). Per assegurar-te'n amb l'app tancada, usa “📲 Alarmes al mòbil” en un esdeveniment.</div></div>
  <h2>Dades</h2><div class="card row"><button data-act="export">Exportar tot (.ics)</button><button data-act="backup">Còpia de seguretat</button></div>`;
}

function render() {
  $("#title").textContent = TITLES[tab];
  const n = occ(Cal.startOfDay(Date.now()), Cal.startOfDay(Date.now()) + DAY).length;
  $("#today-count").textContent = n ? n + (n === 1 ? " avui" : " avui") : "";
  $("#today-count").hidden = !n;
  const keep = document.activeElement && document.activeElement.id, val = keep ? document.activeElement.value : "";
  $("#view").innerHTML = { now: viewNow, agenda: viewAgenda, tasks: viewTasks, cals: viewCals }[tab]();
  if (keep && $("#" + keep)) { $("#" + keep).value = val; $("#" + keep).focus(); }
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  renderAlerts();
}
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2600); }

/* ---------- Editor d'esdeveniments ---------- */
function openEvent(id) {
  const e = S.events.find((x) => x.id === id) || { title: "", start: Math.ceil((Date.now() + HOUR) / (15 * MIN)) * 15 * MIN, end: 0, allDay: false, remind: [...S.settings.remind], travel: 0, location: "" };
  if (!e.end || e.end <= e.start) e.end = e.start + HOUR;
  const rep = e.rrule ? e.rrule.freq : "";
  $("#f-event").innerHTML = `<h1 style="font-size:1.3rem">${id ? "Edita" : "Nou"} esdeveniment</h1>
  <label>Què és?</label><input id="e-title" value="${esc(e.title)}" required autofocus>
  <div class="grid2"><div><label>Dia</label><input type="date" id="e-date" value="${ymd(e.start)}" required></div><div><label>Tot el dia</label><label class="chk"><input type="checkbox" id="e-all" ${e.allDay ? "checked" : ""}> Sí</label></div></div>
  <div class="grid2" id="e-times"><div><label>Comença</label><input type="time" id="e-from" value="${hm(e.start)}"></div><div><label>Acaba</label><input type="time" id="e-to" value="${hm(e.end)}"></div></div>
  <label>On? (opcional)</label><input id="e-loc" value="${esc(e.location || "")}">
  <div class="grid2"><div><label>Es repeteix</label><select id="e-rep"><option value="">No</option><option value="DAILY" ${rep === "DAILY" ? "selected" : ""}>Cada dia</option><option value="WEEKLY" ${rep === "WEEKLY" ? "selected" : ""}>Cada setmana</option><option value="MONTHLY" ${rep === "MONTHLY" ? "selected" : ""}>Cada mes</option><option value="YEARLY" ${rep === "YEARLY" ? "selected" : ""}>Cada any</option></select></div>
  <div><label>Temps de desplaçament (min)</label><input type="number" id="e-travel" min="0" step="5" value="${e.travel || 0}"></div></div>
  <label>Avisa'm</label>${REMIND_OPTS.map(([m, l]) => `<label class="chk"><input type="checkbox" class="e-rem" value="${m}" ${(e.remind || []).includes(m) ? "checked" : ""}>${l}</label>`).join("")}
  <div class="hint">Amb desplaçament, t'avisarem també “Toca sortir!”.</div>
  <div class="row" style="margin-top:16px"><button type="button" class="primary" id="e-save">Desar</button><button type="button" id="e-cancel" class="ghost">Cancel·la</button></div>
  ${id ? `<div class="row" style="margin-top:8px"><button type="button" id="e-ics">📲 Alarmes al mòbil</button><button type="button" class="danger" id="e-del">Esborrar</button></div>` : ""}`;
  const dlg = $("#dlg-event"), sync = () => ($("#e-times").hidden = $("#e-all").checked);
  $("#e-all").onchange = sync; sync();
  $("#e-cancel").onclick = () => dlg.close();
  $("#e-save").onclick = () => {
    const title = $("#e-title").value.trim(); if (!title || !$("#e-date").value) return toast("Posa-li un nom i un dia");
    const [y, mo, d] = $("#e-date").value.split("-").map(Number), all = $("#e-all").checked;
    let start = new Date(y, mo - 1, d).getTime(), end;
    if (all) end = start + DAY;
    else { const [fh, fm] = $("#e-from").value.split(":").map(Number), [th, tm] = $("#e-to").value.split(":").map(Number); start = new Date(y, mo - 1, d, fh, fm).getTime(); end = new Date(y, mo - 1, d, th, tm).getTime(); if (end <= start) end = start + HOUR; }
    const data = { title, allDay: all, start, end, location: $("#e-loc").value.trim(), travel: +$("#e-travel").value || 0, remind: [...document.querySelectorAll(".e-rem:checked")].map((c) => +c.value), rrule: $("#e-rep").value ? { freq: $("#e-rep").value, interval: 1 } : null };
    if (id) Object.assign(S.events.find((x) => x.id === id), data); else S.events.push({ id: uid(), ...data });
    save(); dlg.close(); toast("Desat ✔"); render(); checkReminders();
  };
  if (id) {
    $("#e-del").onclick = () => { if (confirm("Esborrar aquest esdeveniment?")) { S.events = S.events.filter((x) => x.id !== id); save(); dlg.close(); render(); } };
    $("#e-ics").onclick = () => { const ev = S.events.find((x) => x.id === id); download(Cal.toICS([{ ...ev, remind: [...new Set([...(ev.remind || []), ...(ev.travel ? [ev.travel + 5] : [])])] }]), ev.title.replace(/\W+/g, "_") + ".ics"); toast("Obre el fitxer per afegir-lo al calendari del mòbil"); };
  }
  dlg.showModal();
}
function download(text, name, type = "text/calendar") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Focus (temporitzador visual) ---------- */
let ft = null;
function openFocus(taskId) {
  const t = S.tasks.find((x) => x.id === taskId), step = t && t.steps.find((s) => !s.done);
  const dlg = $("#dlg-focus"), f = $("#focus");
  f.innerHTML = `<div class="center"><h1 style="font-size:1.2rem">${esc(step ? step.title : t ? t.title : "Focus")}</h1>${step ? `<div class="hint">Dins de: ${esc(t.title)}</div>` : ""}
  <div class="ring" id="ring"><div id="fclock">--:--</div></div>
  <div class="row" id="fpick" style="justify-content:center"><button data-m="5">5 min</button><button data-m="15">15 min</button><button class="primary" data-m="25">25 min</button></div>
  <div class="hint">Només cinc minuts: començar és el més difícil.</div>
  <div class="row" style="margin-top:12px"><button id="fdone" class="primary">✔ Fet</button><button id="fclose" class="ghost">Tancar</button></div></div>`;
  const stop = () => { clearInterval(ft); ft = null; };
  f.querySelectorAll("#fpick button").forEach((b) => (b.onclick = () => {
    stop(); const total = +b.dataset.m * MIN, end = Date.now() + total;
    ft = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      $("#fclock").textContent = pad(Math.floor(left / 60000)) + ":" + pad(Math.floor((left % 60000) / 1000));
      $("#ring").style.setProperty("--p", (100 * (total - left) / total) + "%");
      if (!left) { stop(); notify("⏱ Temps!", "Has fet " + b.dataset.m + " min de focus. Descansa o continua."); }
    }, 250);
  }));
  $("#fclose").onclick = () => { stop(); dlg.close(); };
  $("#fdone").onclick = () => { stop(); dlg.close(); if (t) { step ? (step.done = true) : completeTask(t); if (step && t.steps.every((s) => s.done)) completeTask(t); save(); toast("Fantàstic! 🎉"); render(); } };
  dlg.onclose = stop; dlg.showModal();
}
function completeTask(t) { t.done = true; t.today = false; S.doneLog.push(Date.now()); S.doneLog = S.doneLog.slice(-300); }

/* ---------- Sincronització de calendaris ---------- */
async function fetchICS(url) {
  url = url.trim().replace(/^webcal:/i, "https:");
  try { const r = await fetch(url); if (r.ok) return await r.text(); } catch {}
  const r = await fetch("proxy?url=" + encodeURIComponent(url)); // via servidor propi (server.js)
  if (!r.ok) throw new Error("no s'ha pogut descarregar");
  return await r.text();
}
function applyICS(cal, text) {
  const evs = Cal.parseICS(text);
  S.events = S.events.filter((e) => e.cal !== cal.id).concat(evs.map((e) => ({ ...e, id: cal.id + ":" + (e.uid || uid()) + ":" + e.start, cal: cal.id })));
  cal.lastSync = Date.now(); cal.error = null;
}
async function syncCal(cal, quiet) {
  if (!cal.url) return;
  try { applyICS(cal, await fetchICS(cal.url)); }
  catch (err) { cal.error = "No s'ha pogut sincronitzar. Si és la primera vegada, obre l'app amb “node server.js” (vegeu README) — els navegadors bloquegen la lectura directa d'alguns calendaris."; }
  save(); if (!quiet) render();
}
const syncAll = () => Promise.all(S.calendars.filter((c) => c.url).map((c) => syncCal(c, true))).then(render);

/* ---------- Esdeveniments d'interfície ---------- */
document.addEventListener("click", (ev) => {
  const tabBtn = ev.target.closest("[data-tab]"); if (tabBtn) { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id, task = S.tasks.find((t) => t.id === id);
  switch (act) {
    case "ok": S.active = S.active.filter((a) => a.id !== id); save(); renderAlerts(); break;
    case "snooze": { const a = S.active.find((x) => x.id === id); if (a) { a.snoozeUntil = Date.now() + 5 * MIN; save(); renderAlerts(); toast("T'ho recordo d'aquí 5 min"); } break; }
    case "quick": { const i = $("#quick"); quickAdd(i.value); break; }
    case "new": openEvent(); break;
    case "edit": openEvent(id); break;
    case "addtask": { const i = $("#newtask"); if (i.value.trim()) { S.tasks.push({ id: uid(), title: i.value.trim(), done: false, steps: [], today: false, created: Date.now() }); save(); render(); $("#newtask").focus(); } break; }
    case "tdone": if (el.checked) { completeTask(task); toast("Fet! 🎉"); } else task.done = false; save(); render(); break;
    case "sdone": task.steps[+el.dataset.i].done = el.checked; if (task.steps.every((s) => s.done)) { completeTask(task); toast("Tasca completa! 🎉"); } save(); render(); break;
    case "today": if (!task.today && S.tasks.filter((t) => t.today && !t.done).length >= 3) return toast("Només 3 prioritats: treu-ne una primer"); task.today = !task.today; save(); render(); break;
    case "split": { const s = prompt("Següent pas petit (uns 5 min):"); if (s && s.trim()) { task.steps.push({ title: s.trim(), done: false }); save(); render(); } break; }
    case "tedit": { const n = prompt("Edita la tasca (buit = esborrar):", task.title); if (n === null) break; if (!n.trim()) S.tasks = S.tasks.filter((t) => t !== task); else task.title = n.trim(); save(); render(); break; }
    case "focus": openFocus(id); break;
    case "addcal": {
      const url = $("#cal-url").value.trim(), name = $("#cal-name").value.trim() || "Calendari";
      if (!/^(https?|webcal):\/\//i.test(url)) return toast("Enganxa un enllaç que comenci per https://");
      const cal = { id: uid(), name, url, color: COLORS[S.calendars.length % COLORS.length] }; S.calendars.push(cal); save(); toast("Sincronitzant…"); syncCal(cal); break;
    }
    case "sync": syncCal(calOf(id)).then(() => toast("Sincronitzat")); break;
    case "delcal": if (confirm("Desconnectar aquest calendari? S'esborren els seus esdeveniments d'aquí (no del calendari original).")) { S.calendars = S.calendars.filter((c) => c.id !== id); S.events = S.events.filter((e) => e.cal !== id); save(); render(); } break;
    case "importfile": $("#file").click(); break;
    case "perm": Notification.requestPermission().then((p) => { render(); if (p === "granted") notify("🔔 Funciona!", "Així et recordaré les coses."); }); break;
    case "export": download(Cal.toICS(S.events.filter((e) => !e.cal), "Organitza'm"), "organitzam.ics"); break;
    case "backup": download(JSON.stringify(S, null, 1), "organitzam-copia.json", "application/json"); break;
  }
});
document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.id === "file" && el.files[0]) {
    el.files[0].text().then((txt) => {
      const cal = { id: uid(), name: el.files[0].name.replace(/\.ics$/i, ""), url: "", color: COLORS[S.calendars.length % COLORS.length] };
      applyICS(cal, txt); S.calendars.push(cal); save(); render(); toast("Importats " + S.events.filter((e) => e.cal === cal.id).length + " esdeveniments");
    });
  }
  if (el.dataset.act === "defrem") { const m = +el.dataset.m; S.settings.remind = el.checked ? [...new Set([...S.settings.remind, m])] : S.settings.remind.filter((x) => x !== m); save(); }
  if (el.dataset.act === "sound") { S.settings.sound = el.checked; save(); }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return;
  if (ev.target.id === "quick") quickAdd(ev.target.value);
  if (ev.target.id === "newtask") $('[data-act="addtask"]').click();
});

/* ---------- Arrencada ---------- */
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
render(); checkReminders(); syncAll();
setInterval(() => { checkReminders(); if (tab === "now" && !document.activeElement.matches("input")) render(); }, 20000);
setInterval(syncAll, 30 * MIN);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkReminders(); render(); } });
if (window.__test) window.__test = { S, parseQuick, occ, checkReminders };
