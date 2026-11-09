/* Lògica de calendari: lectura/escriptura iCalendar (.ics) i expansió de recurrències.
   Funciona al navegador (window.Cal) i a Node (per a proves). */
(function (root) {
  const DAY = 86400000;

  function unfold(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  }
  function unescapeText(s) {
    return (s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
  }
  function escapeText(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }
  function parseLine(line) {
    const i = line.indexOf(":");
    if (i < 0) return null;
    const left = line.slice(0, i), value = line.slice(i + 1);
    const parts = left.split(";");
    const name = parts.shift().toUpperCase();
    const params = {};
    parts.forEach((p) => { const [k, v] = p.split("="); if (k) params[k.toUpperCase()] = (v || "").replace(/"/g, ""); });
    return { name, params, value };
  }
  // Retorna {ms, allDay}. Els TZID es tracten com a hora local (aproximació).
  function parseDate(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (h === undefined || (params && params.VALUE === "DATE")) {
      return { ms: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
    }
    const ms = z ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)) : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)).getTime();
    return { ms, allDay: false };
  }
  function parseDuration(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
    if (!m) return 0;
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000);
  }
  const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  function parseRrule(v) {
    const r = {};
    v.split(";").forEach((kv) => { const [k, val] = kv.split("="); r[k.toUpperCase()] = val; });
    if (!r.FREQ) return null;
    return {
      freq: r.FREQ,
      interval: +r.INTERVAL || 1,
      count: r.COUNT ? +r.COUNT : null,
      until: r.UNTIL ? (parseDate(r.UNTIL, {}) || {}).ms || null : null,
      byday: r.BYDAY ? r.BYDAY.split(",").map((d) => WD[d.slice(-2)]).filter((d) => d !== undefined) : null,
    };
  }

  function parseICS(text) {
    const lines = unfold(text);
    const events = [];
    let cur = null;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
      if (line === "END:VEVENT") {
        if (cur && cur.start != null) {
          if (cur.end == null) cur.end = cur.allDay ? cur.start + DAY : cur.start;
          if (cur.dur != null && !cur._hasEnd) cur.end = cur.start + cur.dur;
          delete cur.dur; delete cur._hasEnd;
          if (!cur.status || cur.status !== "CANCELLED") events.push(cur);
        }
        cur = null; continue;
      }
      if (!cur) continue;
      const p = parseLine(line);
      if (!p) continue;
      switch (p.name) {
        case "UID": cur.uid = p.value; break;
        case "SUMMARY": cur.title = unescapeText(p.value); break;
        case "LOCATION": cur.location = unescapeText(p.value); break;
        case "STATUS": cur.status = p.value.toUpperCase(); break;
        case "DTSTART": { const d = parseDate(p.value, p.params); if (d) { cur.start = d.ms; cur.allDay = d.allDay; } break; }
        case "DTEND": { const d = parseDate(p.value, p.params); if (d) { cur.end = d.ms; cur._hasEnd = true; } break; }
        case "DURATION": cur.dur = parseDuration(p.value); break;
        case "RRULE": cur.rrule = parseRrule(p.value); break;
        case "EXDATE": p.value.split(",").forEach((v) => { const d = parseDate(v, p.params); if (d) cur.exdates.push(d.ms); }); break;
      }
    }
    return events.map((e) => ({ ...e, title: e.title || "(sense títol)" }));
  }

  /* ---------- Recurrències ---------- */
  function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function weekStart(ms) { const d = new Date(startOfDay(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  function dayDiff(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }

  // Ocurrències (inici, final) d'un esdeveniment dins [from, to).
  function occurrences(ev, from, to) {
    const dur = (ev.end != null ? ev.end : ev.start) - ev.start;
    const out = [];
    const push = (s) => {
      if (ev.exdates && ev.exdates.includes(s)) return;
      if (s + dur > from && s < to) out.push({ ev, start: s, end: s + dur });
    };
    const r = ev.rrule;
    if (!r) { push(ev.start); return out; }
    const s0 = new Date(ev.start);
    const h = s0.getHours(), mi = s0.getMinutes(), sec = s0.getSeconds();
    let count = 0;
    const firstDay = startOfDay(ev.start);
    const lastDay = Math.min(to, r.until ? r.until + DAY : to);
    for (let day = firstDay, i = 0; day < lastDay && i < 6000; i++) {
      const d = new Date(day);
      let match = false;
      const diff = dayDiff(firstDay, day);
      if (r.freq === "DAILY") match = diff % r.interval === 0;
      else if (r.freq === "WEEKLY") {
        const wk = Math.round((weekStart(day) - weekStart(firstDay)) / (7 * DAY));
        const days = r.byday && r.byday.length ? r.byday : [s0.getDay()];
        match = wk % r.interval === 0 && days.includes(d.getDay());
      } else if (r.freq === "MONTHLY") {
        const mo = (d.getFullYear() - s0.getFullYear()) * 12 + d.getMonth() - s0.getMonth();
        match = mo % r.interval === 0 && d.getDate() === s0.getDate();
      } else if (r.freq === "YEARLY") {
        match = (d.getFullYear() - s0.getFullYear()) % r.interval === 0 && d.getMonth() === s0.getMonth() && d.getDate() === s0.getDate();
      } else break;
      if (match) {
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi, sec).getTime();
        if (s >= ev.start) {
          count++;
          if (r.count && count > r.count) break;
          push(s);
        }
      }
      const n = new Date(day); n.setDate(n.getDate() + 1); day = n.getTime();
    }
    return out;
  }

  /* ---------- Exportació ---------- */
  function fmtUTC(ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function fmtDate(ms) { const d = new Date(ms); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); }
  function fold(line) {
    const out = []; let s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); }
    out.push(s); return out.join("\r\n");
  }
  function toICS(events, calName) {
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Organitza'm TDAH//CA", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + escapeText(calName || "Organitza'm")];
    events.forEach((e) => {
      L.push("BEGIN:VEVENT", "UID:" + (e.uid || e.id) + "@organitzam", "DTSTAMP:" + fmtUTC(Date.now()));
      if (e.allDay) { L.push("DTSTART;VALUE=DATE:" + fmtDate(e.start), "DTEND;VALUE=DATE:" + fmtDate(e.end || e.start + DAY)); }
      else { L.push("DTSTART:" + fmtUTC(e.start), "DTEND:" + fmtUTC(e.end || e.start)); }
      L.push(fold("SUMMARY:" + escapeText(e.title)));
      if (e.location) L.push(fold("LOCATION:" + escapeText(e.location)));
      if (e.rrule) {
        L.push("RRULE:FREQ=" + e.rrule.freq + (e.rrule.interval > 1 ? ";INTERVAL=" + e.rrule.interval : "") +
          (e.rrule.byday ? ";BYDAY=" + e.rrule.byday.map((d) => Object.keys(WD).find((k) => WD[k] === d)).join(",") : ""));
      }
      (e.remind || []).forEach((m) => {
        L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + escapeText(e.title), "TRIGGER:-PT" + m + "M", "END:VALARM");
      });
      L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.join("\r\n");
  }

  const api = { parseICS, occurrences, toICS, startOfDay, DAY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Cal = api;
})(typeof window !== "undefined" ? window : globalThis);
