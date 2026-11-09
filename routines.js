/* Rutines: llistes de passos que es repeteixen (matí, nit…) i es mostren a "Ara" quan toquen. */
(function () {
  const WD = ["dg", "dl", "dt", "dc", "dj", "dv", "ds"];
  const key = (r) => r.id + "|" + ymd(Date.now());
  const parseDays = (t) => {
    t = t.trim().toLowerCase();
    if (!t || t === "tots") return [0, 1, 2, 3, 4, 5, 6];
    if (t === "feiners") return [1, 2, 3, 4, 5];
    if (t === "cap de setmana") return [0, 6];
    const out = new Set();
    t.split(/[ ,]+/).forEach((p) => { const m = /^([a-z]{2})(?:-([a-z]{2}))?$/.exec(p); if (!m) return; const a = WD.indexOf(m[1]); if (a < 0) return; const b = m[2] ? WD.indexOf(m[2]) : a; for (let i = a; ; i = (i + 1) % 7) { out.add(i); if (i === b) break; } });
    return out.size ? [...out].sort() : [0, 1, 2, 3, 4, 5, 6];
  };
  const daysText = (d) => (d.length === 7 ? "tots els dies" : d.length === 5 && !d.includes(0) && !d.includes(6) ? "feiners" : d.map((i) => WD[i]).join(" "));

  function materialise(r) {
    S.events = S.events.filter((e) => e.routine !== r.id);
    if (!r.on) return;
    const [h, m] = r.time.split(":").map(Number), d = new Date(); d.setHours(h, m, 0, 0);
    S.events.push({ id: "r:" + r.id, routine: r.id, title: "🔔 " + r.name, start: d.getTime() - 400 * DAY, end: d.getTime() - 400 * DAY + 15 * MIN, allDay: false, remind: [10, 0], travel: 0,
      rrule: { freq: "WEEKLY", interval: 1, byday: r.days } });
    // l'inici és al passat perquè la regla no es perdi el dia d'avui; l'hora de paret es manté.
    const e = S.events[S.events.length - 1]; const base = new Date(d); base.setDate(base.getDate() - 400); base.setHours(h, m, 0, 0); e.start = base.getTime(); e.end = e.start + 15 * MIN;
  }
  function edit(id) {
    let r = S.routines.find((x) => x.id === id);
    const isNew = !r;
    const name = prompt("Nom de la rutina (buit = esborrar):", r ? r.name : "Rutina del matí"); if (name === null) return;
    if (!name.trim() && r) { S.routines = S.routines.filter((x) => x !== r); materialise({ id, on: false }); save(); return render(); }
    if (!name.trim()) return;
    const time = prompt("A quina hora? (HH:MM)", r ? r.time : "07:30"); if (time === null) return;
    if (!/^\d{1,2}:\d{2}$/.test(time.trim())) return toast("Format d'hora: 07:30");
    const days = prompt("Quins dies? (tots, feiners, cap de setmana, o dl-dv, dt dj…)", r ? daysText(r.days) : "tots"); if (days === null) return;
    const steps = prompt("Passos separats per punt i coma (;)", r ? r.steps.join("; ") : "Beure aigua; Medicació; Dutxa; Vestir-me; Esmorzar"); if (steps === null) return;
    if (isNew) { r = { id: uid(), on: true }; S.routines.push(r); }
    Object.assign(r, { name: name.trim(), time: time.trim().padStart(5, "0"), days: parseDays(days), steps: steps.split(";").map((x) => x.trim()).filter(Boolean) });
    materialise(r); save(); render(); checkReminders();
  }
  function examples() {
    [["Rutina del matí", "07:30", ["Beure aigua", "Medicació", "Dutxa i vestir-me", "Esmorzar", "Mirar l'agenda d'avui"]], ["Rutina de la nit", "22:00", ["Preparar la roba de demà", "Revisar l'agenda de demà", "Carregar el mòbil", "Pantalles fora"]]]
      .forEach(([name, time, steps]) => { const r = { id: uid(), name, time, steps, days: [0, 1, 2, 3, 4, 5, 6], on: true }; S.routines.push(r); materialise(r); });
    save(); render(); toast("Rutines d'exemple afegides");
  }

  hooks.now.push(() => {
    const now = Date.now(); let h = "";
    S.routines.filter((r) => r.on).forEach((r) => {
      const o = occ(now - 3 * HOUR, now + 40 * MIN).find((x) => x.ev.routine === r.id); if (!o) return;
      const done = S.routineDone[key(r)] || [];
      const left = r.steps.length - done.length;
      h += `<div class="card"><b>🔔 ${esc(r.name)}</b> <small style="color:var(--mute)">${hm(o.start)}</small>
        ${r.steps.map((st, i) => `<label class="chk"><input type="checkbox" data-act="rstep" data-id="${r.id}" data-i="${i}" ${done.includes(i) ? "checked" : ""}><span class="${done.includes(i) ? "done" : ""}" style="${done.includes(i) ? "text-decoration:line-through;color:var(--mute)" : ""}">${esc(st)}</span></label>`).join("")}
        ${left === 0 && r.steps.length ? `<div class="hint">🎉 Rutina completa!</div>` : ""}</div>`;
    });
    return h;
  });
  hooks.tasks.push(() => `<h2>Rutines</h2><div class="card">${S.routines.length ? S.routines.map((r) => `<div class="item"><input type="checkbox" ${r.on ? "checked" : ""} data-act="ron" data-id="${r.id}" aria-label="Activa"><div class="t" data-act="redit" data-id="${r.id}"><b>${esc(r.name)}</b><small>${r.time} · ${daysText(r.days)} · ${r.steps.length} passos</small></div></div>`).join("") : `<div class="empty">Una rutina és una llista que et surt sola a l'hora que toca.</div>`}
    <div class="row" style="margin-top:10px"><button class="primary" data-act="rnew">＋ Nova rutina</button>${S.routines.length ? "" : `<button data-act="rex">Exemples</button>`}</div></div>`);

  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el) return; const a = el.dataset.act;
    if (a === "rnew") edit(); else if (a === "redit") edit(el.dataset.id); else if (a === "rex") examples();
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target, r = S.routines.find((x) => x.id === el.dataset.id);
    if (el.dataset.act === "rstep" && r) { const k = key(r), d = new Set(S.routineDone[k] || []); el.checked ? d.add(+el.dataset.i) : d.delete(+el.dataset.i); S.routineDone[k] = [...d]; Object.keys(S.routineDone).slice(0, -30).forEach((x) => delete S.routineDone[x]); save(); render(); if (el.checked && d.size === r.steps.length) toast("Rutina completa! 🎉"); }
    if (el.dataset.act === "ron" && r) { r.on = el.checked; materialise(r); save(); render(); }
  });
})();
