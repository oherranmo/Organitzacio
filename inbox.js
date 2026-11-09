/* Importar missatges (WhatsApp, correus…): enganxes text o un xat exportat i l'app proposa esdeveniments per confirmar.
   No llegeix res automàticament: només el que tu li passes. */
(function () {
  // Línies d'un xat exportat de WhatsApp (iPhone: "[12/11/25, 17:30:12] Nom: text"; Android: "12/11/25, 17:30 - Nom: text")
  const CHAT = /^‎?\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s?[ap]\.?m\.?)?\]?\s*[-–]?\s*([^:]{1,60}?):\s(.*)$/i;

  function messages(text) {
    const out = []; let cur = null;
    text.replace(/\r/g, "").split("\n").forEach((line) => {
      const m = CHAT.exec(line);
      if (m) {
        const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
        cur = { at: new Date(y, +m[2] - 1, +m[1], +m[4], +m[5]).getTime(), who: m[6], text: m[7] }; out.push(cur);
      } else if (cur && line.trim() && out.length) cur.text += " " + line.trim();
      else if (line.trim()) { cur = null; out.push({ at: Date.now(), who: "", text: line.trim() }); }
    });
    return out;
  }
  function candidates(text) {
    const res = [], seen = new Set();
    messages(text).forEach((m) => {
      if (/<Multimèdia|<Media omitted|omitted>$/i.test(m.text)) return;
      const clean = m.text.replace(/https?:\/\/\S+/g, "").trim(); if (clean.length < 4) return;
      const r = parseQuick(clean, m.at); if (!r.event) return;
      const e = r.event; if (e.end < Date.now() - HOUR) return; // només futur
      if (m.at < Date.now() - 45 * DAY) return;
      const k = e.title + "|" + e.start;
      if (seen.has(k) || S.events.some((x) => x.title === e.title && x.start === e.start)) return;
      seen.add(k);
      res.push({ ...e, from: m.who, orig: clean });
    });
    return res.sort((a, b) => a.start - b.start).slice(0, 40);
  }

  let dlg;
  function open() {
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "dlg-inbox"; document.body.appendChild(dlg); }
    dlg.innerHTML = `<h1 style="font-size:1.3rem">📥 Passar missatges a l'agenda</h1>
      <div class="hint">Copia un missatge (o diversos) de WhatsApp, un correu, etc. i enganxa'l aquí. L'app hi busca dies i hores i et proposa què afegir. <b>No s'afegeix res sense que ho confirmis.</b></div>
      <textarea id="in-text" rows="6" placeholder="Ex: Ens veiem dijous a les 17:30 al metge"></textarea>
      <div class="row" style="margin-top:8px"><button id="in-paste">📋 Enganxar</button><button id="in-file">📄 Fitxer de xat (.txt)</button></div>
      <input type="file" id="in-fileinput" accept=".txt,text/plain" hidden>
      <div id="in-res"></div>
      <div class="row" style="margin-top:12px"><button class="primary" id="in-go">🔎 Buscar cites</button><button class="ghost" id="in-close">Tancar</button></div>`;
    const $$ = (s) => dlg.querySelector(s);
    $$("#in-close").onclick = () => dlg.close();
    $$("#in-paste").onclick = async () => { try { $$("#in-text").value = await navigator.clipboard.readText(); } catch { toast("Mantén premut al camp i tria Enganxar"); } };
    $$("#in-file").onclick = () => $$("#in-fileinput").click();
    $$("#in-fileinput").onchange = async (ev) => { if (ev.target.files[0]) { $$("#in-text").value = await ev.target.files[0].text(); go(); } };
    $$("#in-go").onclick = go;
    function go() {
      const c = candidates($$("#in-text").value);
      if (!c.length) { $$("#in-res").innerHTML = `<div class="empty">No he trobat cap cita futura amb dia o hora.</div>`; return; }
      $$("#in-res").innerHTML = `<h2>He trobat ${c.length}</h2>` + c.map((e, i) => `<div class="item"><input type="checkbox" class="in-chk" data-i="${i}" checked>
        <div class="t"><input class="in-title" data-i="${i}" value="${esc(e.title)}"><small>${dayLabel(e.start)}${e.allDay ? " · tot el dia" : " · " + hm(e.start)}${e.from ? " · " + esc(e.from) : ""}</small><br><small>“${esc(e.orig.slice(0, 90))}”</small></div></div>`).join("") +
        `<button class="primary" id="in-add" style="margin-top:10px;width:100%">Afegir els seleccionats</button>`;
      $$("#in-add").onclick = () => {
        let n = 0;
        dlg.querySelectorAll(".in-chk:checked").forEach((chk) => {
          const e = c[+chk.dataset.i], title = dlg.querySelector('.in-title[data-i="' + chk.dataset.i + '"]').value.trim() || e.title;
          S.events.push({ id: uid(), title, start: e.start, end: e.end, allDay: e.allDay, remind: [...S.settings.remind], travel: 0 }); n++;
        });
        save(); dlg.close(); render(); toast("Afegits " + n + " esdeveniments ✔");
      };
    }
    dlg.showModal();
  }

  hooks.now.push(() => `<div class="row" style="margin:12px 0"><button data-act="inbox-open">📥 Passar missatges (WhatsApp…) a l'agenda</button></div>`);
  document.addEventListener("click", (ev) => { if (ev.target.closest('[data-act="inbox-open"]')) open(); });
})();
