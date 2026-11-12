const S = { fl: "todas", uf: "todos", af: "todos" };
let modal = "",
  sel = null;
const chips = (a, v) =>
  `<div class="chips">${a.map(([k, l]) => `<button class="${S[v] === k ? "p" : "g"}" onclick="A.set('${v}','${k}')">${l}</button>`).join("")}</div>`;
const fd = (t) => new Date(t).toLocaleDateString("pt-BR");
const ban = (u) => !!u.ban,
  restr = (u) => !ban(u) && lock(u) > Date.now();
const alertsBase = () => {
  const n = Date.now(),
    o = [];
  db.reqs.forEach((x) => {
    if (x.status !== "aprovada" || x.type !== "reserva") return;
    if (!x.out && n > ts(x.date, x.start) + 72e5)
      o.push({ k: x.id + "r", s: "atencao", t: "Retirada atrasada (mais de 2h)", x });
    if (x.out && !x.ret && n > ts(x.date, x.end) + 18e5)
      o.push({ k: x.id + "d", s: "critico", t: "Devolução fora do prazo", x });
  });
  return o.filter((a) => !(db.res || {})[a.k]);
};
// Avatar do aluno (foto de perfil ou inicial) e "avatar + nome" para listas e notificações.
const avatar = (u, px = 32) =>
  u && u.photo
    ? `<img src="${u.photo}" alt="" style="width:${px}px;height:${px}px;border-radius:50%;object-fit:cover;flex:none">`
    : `<span style="width:${px}px;height:${px}px;border-radius:50%;background:var(--b);color:var(--m);display:inline-grid;place-items:center;font-size:${Math.round(px * 0.45)}px;flex:none">${esc(((u && u.name) || "?").trim().charAt(0).toUpperCase())}</span>`;
const nome = (u, px = 28) =>
  `<span style="display:inline-flex;align-items:center;gap:8px">${avatar(u, px)}<span>${esc(u.name)}</span></span>`;

function pic(i, cb) {
  const f = i.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const m = new Image();
    m.onload = () => {
      const k = Math.min(1, 640 / m.width),
        c = document.createElement("canvas");
      c.width = m.width * k;
      c.height = m.height * k;
      c.getContext("2d").drawImage(m, 0, 0, c.width, c.height);
      cb(c.toDataURL("image/jpeg", 0.6));
    };
    m.src = r.result;
  };
  r.readAsDataURL(f);
}
const cal = (rid) =>
  [...Array(7)]
    .map((_, i) => {
      const d = new Date(Date.now() + i * D),
        k = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10),
        l = db.reqs
          .filter(
            (x) =>
              x.room === rid && x.type === "reserva" && x.status === "aprovada" && x.date === k,
          )
          .sort((a, b) => (a.start < b.start ? -1 : 1));
      return `<div class="row card" style="padding:8px;margin:4px 0"><b>${d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</b><span class="m">${l.map((x) => x.start + "–" + x.end + " " + esc(usr(x.user).name)).join(" · ") || "livre"}</span></div>`;
    })
    .join("");
const X = '<button class="g" data-x style="margin-top:10px">Fechar</button>';
const photoBtn = (t, fn) =>
  `<button class="btn" style="width:100%;border:0" onclick="cam(${fn})">${t}</button>`;

Object.assign(A, {
  set(v, k) {
    S[v] = k;
    R();
  },
  x(e) {
    if (e.target.classList.contains("ov") || e.target.dataset.x !== undefined) {
      stopCam();
      modal = "";
      R();
    }
  },
  sala(id) {
    sel = id;
    cinit(id);
    tab = "sala";
    R();
  },
  pick(id, t) {
    cinit(id);
    tab = t;
    R();
    const s = $("[name=room]");
    if (s) {
      s.value = id;
      if (s.value !== id)
        $("#m").textContent = "Essa sala não está livre agora. Escolha uma sala livre.";
    }
  },
  cal_(id) {
    cinit(id);
    modal = `<h2>${esc(room(id).code)} · calendário</h2><div id="cal">${calHTML()}</div>${X}`;
    R();
  },
  hist(id) {
    const l = db.reqs.filter((x) => x.room === id).reverse();
    modal =
      `<h2>Histórico · ${esc(room(id).code)}</h2>` +
      (l
        .map(
          (x) =>
            `<div class="card"><div class="row"><b>${x.type === "reserva" ? "Reserva" : "Empréstimo"} · ${nome(usr(x.user), 24)}</b>${badge(x.status, sc(x.status))}</div><div class="m">Pedido ${fmt(x.at)}${x.out ? " · retirada " + fmt(x.out) : ""}${x.retAt ? " · devolução " + fmt(x.retAt) : ""}</div></div>`,
        )
        .join("") || '<div class="m">Sem registros.</div>') +
      X;
    R();
  },
  edit(id) {
    const r = room(id),
      n = prompt("Nome da sala:", r.name),
      k = n && prompt("Capacidade:", r.cap);
    if (n && +k > 0) {
      r.name = n.trim();
      r.cap = +k;
      save();
      R();
    }
  },
  res_(k) {
    db.res = db.res || {};
    db.res[k] = 1;
    save();
    R();
  },
  perfil(id) {
    const u = usr(id),
      l = db.reqs.filter((x) => x.user === id).reverse();
    modal = `<h2>${nome(u, 44)}</h2><div class="m">${esc(u.email)} · matrícula ${esc(u.mat)}</div><div style="margin:8px 0">${ban(u) ? badge("Banido", "red") : restr(u) ? badge("Restrito até " + fd(lock(u)), "red") : badge("Ativo", "green")}</div><b>Strikes ativos (${act(u).length})</b>${u.strikes.map((k, i) => (k.exp > Date.now() ? `<div class="card"><div>${esc(k.why)}</div><div class="m">${fmt(k.at)} · expira em ${fd(k.exp)} (${Math.ceil((k.exp - Date.now()) / D)} dias)</div><button class="d" onclick="A.rm('${id}',${i})">Remover strike</button></div>` : "")).join("") || '<div class="m">Nenhum.</div>'}<div class="row" style="margin:10px 0"><button class="g" onclick="A.strike('${id}');A.perfil('${id}')">Aplicar strike</button><button class="d" onclick="A.ban_('${id}')">${ban(u) ? "Remover banimento" : "Banir permanentemente"}</button></div><b>Histórico</b>${l.map((x) => `<div class="m">${x.type === "reserva" ? "Reserva" : "Empréstimo"} · ${esc(room(x.room).code)} · ${fmt(x.at)} · ${x.status}</div>`).join("") || '<div class="m">Sem registros.</div>'}${X}`;
    R();
  },
  rm(id, i) {
    const w = (prompt("Justificativa da remoção (obrigatória):") || "").trim();
    if (!w) return;
    usr(id).strikes.splice(i, 1);
    save();
    A.perfil(id);
  },
  ban_(id) {
    const w = (prompt("Justificativa (obrigatória):") || "").trim();
    if (!w) return;
    const u = usr(id);
    u.ban = !u.ban;
    save();
    A.perfil(id);
  },
});
const d0 = A.dec;
A.dec = (id, s) => {
  const x = db.reqs.find((r) => r.id === id);
  if (
    s === "aprovada" &&
    x.type === "reserva" &&
    db.reqs.some(
      (o) =>
        o !== x &&
        o.room === x.room &&
        o.type === "reserva" &&
        o.status === "aprovada" &&
        o.date === x.date &&
        x.start < o.end &&
        x.end > o.start,
    )
  )
    return alert("Conflito: já existe reserva aprovada para essa sala e horário.");
  d0(id, s);
};
const s0 = V.sal;
V.sal = () =>
  s0().replace(
    /<button class="d" onclick="A\.delRoom\('(\w+)'\)">/g,
    (m, id) =>
      `<button class="g" onclick="A.cal_('${id}')">Calendário</button> <button class="g" onclick="A.edit('${id}')">Editar</button> ${m}`,
  );

Object.assign(V, {
  home() {
    const n = db.rooms.map(status);
    return (
      `<div class="stats">${[
        ["Livres", "Livre"],
        ["Reservadas", "Reservada"],
        ["Emprestadas", "Emprestada"],
      ]
        .map(
          ([l, t]) =>
            `<div class="card"><b>${n.filter((s) => s.t === t).length}</b><span class="m">${l}</span></div>`,
        )
        .join("")}</div>` +
      (db.rooms.length
        ? db.rooms
            .map((r) => {
              const s = status(r);
              return `<div class="card" style="cursor:pointer" onclick="A.sala('${r.id}')"><div class="row"><b>${esc(r.code)} · ${esc(r.name)}</b>${badge(s.t, s.c)}</div><div class="m">${r.cap} lugares${s.who ? " · " + esc(usr(s.who).name) : ""}</div></div>`;
            })
            .join("")
        : empty("Nenhuma sala cadastrada ainda."))
    );
  },
  sala() {
    const r = db.rooms.find((x) => x.id === sel);
    if (!r) return V.home();
    const s = status(r);
    return `<button class="g" onclick="A.go('home')">← Voltar</button><div class="card" style="margin-top:10px"><div class="row"><b>${esc(r.code)} · ${esc(r.name)}</b>${badge(s.t, s.c)}</div><div id="cal">${calHTML()}</div><button class="btn" style="width:100%;border:0" onclick="A.pick('${r.id}','res')">Reserva antecipada</button><button class="btn" style="width:100%;border:0" onclick="A.pick('${r.id}','emp')">Empréstimo imediato</button></div>`;
  },
  dash() {
    const o = db.rooms.filter((r) => !free(r)).length;
    return (
      `<div class="stats"><div class="card"><b>${db.reqs.filter((r) => r.status === "pendente").length}</b><span class="m">Solicitações</span></div><div class="card"><b>${o}/${db.rooms.length}</b><span class="m">Ocupadas</span></div><div class="card"><b>${alerts().length}</b><span class="m">Alertas</span></div></div>` +
      (db.rooms.length
        ? `<div class="card"><table><tr><th>SALA</th><th>STATUS</th><th>RESPONSÁVEL</th><th></th></tr>${db.rooms
            .map((r) => {
              const s = status(r);
              return `<tr><td>${esc(r.code)} · ${esc(r.name)}</td><td>${badge(s.t, s.c)}</td><td>${s.who ? nome(usr(s.who), 24) : "—"}</td><td><button class="g" onclick="A.cal_('${r.id}')">Calendário</button> <button class="g" onclick="A.hist('${r.id}')">Histórico</button></td></tr>`;
            })
            .join("")}</table></div>`
        : empty("Cadastre salas na aba Salas."))
    );
  },
  sol() {
    const f = S.fl,
      l = db.reqs
        .filter(
          (x) =>
            f === "todas" ||
            (f === "reserva" || f === "emprestimo"
              ? x.type === f
              : f === "pendentes"
                ? x.status === "pendente"
                : x.status === "aprovada"),
        )
        .reverse();
    return (
      chips(
        [
          ["todas", "Todas"],
          ["reserva", "Reserva"],
          ["emprestimo", "Empréstimo"],
          ["pendentes", "Pendentes"],
          ["aprovadas", "Aprovadas"],
        ],
        "fl",
      ) +
      (l.length
        ? l
            .map(
              (r) =>
                `<div class="card"><div class="row"><b>${r.type === "reserva" ? "Reserva" : "Empréstimo"} · ${esc(room(r.room).code)}</b>${badge(r.status, sc(r.status))}</div><div class="m">${nome(usr(r.user), 28)} · ${esc(usr(r.user).email)}${r.type === "reserva" ? ` · ${r.date.split("-").reverse().join("/")} ${r.start}–${r.end}` : ""}</div><div>${esc(r.why)}</div>${r.status === "pendente" ? `<div class="row" style="margin-top:8px"><button class="d" onclick="A.dec('${r.id}','recusada')">Recusar</button><button class="p" onclick="A.dec('${r.id}','aprovada')">Aprovar</button></div>` : ""}</div>`,
            )
            .join("")
        : empty("Nenhuma solicitação nesta categoria."))
    );
  },
  usr() {
    const al = db.users.filter((u) => u.role === "al"),
      f = S.uf,
      l = al.filter(
        (u) =>
          (u.name + u.email + u.mat).toLowerCase().includes(q) &&
          (f === "todos" ||
            (f === "sem"
              ? !act(u).length && !ban(u)
              : f === "com"
                ? act(u).length && !restr(u) && !ban(u)
                : f === "restr"
                  ? restr(u)
                  : ban(u))),
      );
    return (
      `<div class="stats"><div class="card"><b>${al.length}</b><span class="m">Alunos</span></div><div class="card"><b>${al.filter((u) => act(u).length).length}</b><span class="m">Com strike</span></div><div class="card"><b>${al.filter(ban).length}</b><span class="m">Banidos</span></div></div>` +
      chips(
        [
          ["todos", "Todos"],
          ["sem", "Sem ocorrências"],
          ["com", "Com strikes"],
          ["restr", "Restritos"],
          ["ban", "Banidos"],
        ],
        "uf",
      ) +
      `<input id="q" placeholder="Buscar por nome, e-mail ou matrícula" value="${esc(q)}" oninput="A.find(this.value)" style="margin-bottom:10px">` +
      (l.length
        ? l
            .map(
              (u) =>
                `<div class="card"><div class="row"><b>${nome(u, 36)}</b>${ban(u) ? badge("Banido", "red") : restr(u) ? badge("Restrito até " + fd(lock(u)), "red") : badge(act(u).length + " strike(s)", act(u).length ? "amber" : "green")}</div><div class="m">${esc(u.email)} · matrícula ${esc(u.mat)}</div><div class="row" style="margin-top:8px"><button class="g" onclick="A.perfil('${u.id}')">Ver perfil</button><button class="g" onclick="A.strike('${u.id}')">Aplicar strike</button></div></div>`,
            )
            .join("")
        : empty("Nenhum aluno encontrado."))
    );
  },
});

const MOB =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && innerWidth < 900);
const MODO_TESTE = true; // true = libera aluno e secretaria em qualquer aparelho (só para testes). Volte para false depois.
const dev = (u) =>
  MODO_TESTE
    ? ""
    : u.role === "al" && !MOB
      ? "A área do aluno só está disponível no celular."
      : u.role === "sec" && MOB
        ? "A área da secretaria só está disponível no computador."
        : "";
const l0 = A.login,
  r1 = A.reg;
A.login = (e) => {
  const f = new FormData(e.target),
    u = db.users.find((x) => x.email === f.get("e").trim().toLowerCase() && x.pw === f.get("p"));
  if (u && dev(u)) {
    e.preventDefault();
    return err(dev(u));
  }
  l0(e);
};
A.strike = (id) => {
  const u = usr(id);
  if (ban(u) || restr(u))
    return alert("Usuário restrito ou banido: não é possível aplicar novos strikes.");
  const w = (prompt("Justificativa do strike (obrigatória):") || "").trim();
  if (!w) return;
  u.strikes.push({ why: w, at: Date.now(), exp: Date.now() + 180 * D });
  if (act(u).length === 3) {
    u.rst = (u.rst || 0) + 1;
    if (u.rst >= 3) u.ban = true;
  }
  save();
  R();
};
let stream;
const stopCam = () => {
  stream && stream.getTracks().forEach((t) => t.stop());
  stream = null;
};
function cam(cb) {
  modal = `<h2>Foto da sala</h2><video id="v" autoplay playsinline muted style="width:100%;border-radius:8px;background:#000"></video><div class="err" id="m"></div><button class="p" style="margin-top:8px" id="sh">Tirar foto</button><button class="g" data-x style="margin-top:8px;width:100%">Cancelar</button>`;
  R();
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
    .then((s) => {
      stream = s;
      $("#v").srcObject = s;
      $("#sh").onclick = () => {
        const v = $("#v");
        if (!v.videoWidth) return;
        const c = document.createElement("canvas"),
          k = Math.min(1, 640 / v.videoWidth);
        c.width = v.videoWidth * k;
        c.height = v.videoHeight * k;
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        const d = c.toDataURL("image/jpeg", 0.6);
        stopCam();
        modal = "";
        cb(d);
      };
    })
    .catch(() =>
      err("Não foi possível abrir a câmera. Permita o acesso e use uma conexão segura (HTTPS)."),
    );
}
const C = { y: 0, m: 0, k: "", rid: "" },
  dk = (t) => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10),
  hm = (t) => new Date(t).toTimeString().slice(0, 5);
const cinit = (rid) => {
  const n = new Date();
  C.y = n.getFullYear();
  C.m = n.getMonth();
  C.k = today();
  C.rid = rid;
};
const evs = (rid, k) =>
  db.reqs
    .filter(
      (x) =>
        x.room === rid &&
        !["recusada", "cancelada"].includes(x.status) &&
        (x.type === "reserva"
          ? x.date === k
          : x.status === "aprovada" && x.start && dk(x.start) === k),
    )
    .map((x) =>
      x.type === "reserva"
        ? { s: x.start, e: x.end, x }
        : { s: hm(x.start), e: x.ret === "confirmada" ? hm(x.retAt) : "em andamento", x },
    )
    .sort((a, b) => (a.s < b.s ? -1 : 1));
const calHTML = () => {
  const f = new Date(C.y, C.m, 1),
    n = new Date(C.y, C.m + 1, 0).getDate();
  let h = `<div class="row"><button class="g" onclick="A.mm(-1)">◀</button><b>${f.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</b><button class="g" onclick="A.mm(1)">▶</button></div><div class="mg">${[..."DSTQQSS"].map((c) => `<i>${c}</i>`).join("")}`;
  for (let i = 0; i < f.getDay(); i++) h += "<span></span>";
  for (let d = 1; d <= n; d++) {
    const k = `${C.y}-${pad(C.m + 1)}-${pad(d)}`;
    h += `<button class="${k === C.k ? "on" : ""}${evs(C.rid, k).length ? " has" : ""}" onclick="A.day('${k}')">${d}</button>`;
  }
  return (
    h +
    `</div><div style="margin:10px 0 6px"><b>${C.k.split("-").reverse().join("/")}</b> ${badge("Reserva antecipada", "red")} ${badge("Empréstimo imediato", "blue")} ${badge("Pendente", "amber")}</div><div class="col">${slots()}</div>`
  );
};
const mn = (t) => {
  const [h, m] = t.split(":");
  return +h * 60 + +m;
};
const slots = () => {
  const n = new Date(),
    end = C.k === today() ? n.getHours() * 60 + n.getMinutes() : 1440,
    E = evs(C.rid, C.k).map((v) => ({
      a: mn(v.s),
      b: v.e === "em andamento" ? Math.max(end, mn(v.s) + 30) : mn(v.e),
      v,
    }));
  let h = "";
  for (let m = 360; m < 1380; m += 30) {
    const e = E.find((o) => m < o.b && m + 30 > o.a),
      f = e && ((e.a >= m && e.a < m + 30) || m === 360),
      x = e && e.v.x,
      c = !e ? "" : x.status === "pendente" ? "pd" : x.type === "reserva" ? "rs" : "em",
      t = e
        ? `${x.type === "reserva" ? "Reserva antecipada" : "Empréstimo imediato"}${x.status === "pendente" ? " (pendente)" : ""} · ${e.v.s}–${e.v.e} · ${esc(usr(x.user).name)}`
        : "Livre";
    h += `<div class="tr"><span class="tl">${m % 60 ? "" : pad(m / 60) + ":00"}</span><div class="ts ${m % 60 ? "h" : ""} ${c}" title="${t}">${f ? t : ""}</div></div>`;
  }
  return h;
};
const calRender = () => {
  const e = $("#cal");
  if (e) e.innerHTML = calHTML();
};
Object.assign(A, {
  mm(d) {
    C.m += d;
    if (C.m > 11) {
      C.m = 0;
      C.y++;
    }
    if (C.m < 0) {
      C.m = 11;
      C.y--;
    }
    calRender();
  },
  day(k) {
    C.k = k;
    calRender();
    const i = $("[name=date]");
    if (i && k >= today()) i.value = k;
  },
  rsel(id) {
    C.rid = id;
    calRender();
  },
});
const r0 = V.res;
V.res = () => {
  if (!db.rooms.length) return r0();
  if (!db.rooms.some((r) => r.id === C.rid)) cinit(db.rooms[0].id);
  return (
    r0()
      .replace('<select name="room">', '<select name="room" onchange="A.rsel(this.value)">')
      .replace(`<option value="${C.rid}">`, `<option value="${C.rid}" selected>`) +
    `<div class="card" id="cal">${calHTML()}</div>`
  );
};
R = function () {
  const u = me(),
    a = $("#app");
  if (u && dev(u)) {
    db.me = null;
    mode = "in";
    save();
    R();
    return;
  }
  if (!u) {
    a.innerHTML = auth();
    return;
  }
  const sec = u.role === "sec",
    ST = ["dash", "sol", "dev", "sal", "usr", "ale"],
    T = sec
      ? [
          ["dash", "Painel"],
          ["sol", "Solicitações"],
          ["dev", "Devoluções"],
          ["sal", "Salas"],
          ["usr", "Usuários"],
          ["ale", "Alertas"],
        ]
      : [
          ["home", "Início"],
          ["res", "Reservar"],
          ["emp", "Empréstimo"],
          ["ses", "Sessão"],
          ["conta", "Conta"],
        ],
    c = {
      sol: db.reqs.filter((r) => r.status === "pendente").length,
      dev: pendDev(),
      ale: alerts().length,
    };
  if (sec !== ST.includes(tab)) tab = T[0][0];
  a.innerHTML = `<div class="shell${sec ? " wide" : ""}"><header><b>SalaReserva</b><span>${nome(u, 28)}</span><button class="g" onclick="A.out()">Sair</button></header><nav>${T.map(([k, l]) => `<button class="${tab === k ? "on" : ""}" onclick="A.go('${k}')">${l}${c[k] ? `<i>${c[k]}</i>` : ""}</button>`).join("")}</nav><main>${V[tab](u)}</main></div>${modal ? `<div class="ov" onclick="A.x(event)"><div class="card">${modal}</div></div>` : ""}`;
};
R();
