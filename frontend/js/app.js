const K = "salareserva",
  D = 864e5,
  $ = (s) => document.querySelector(s),
  pad = (n) => String(n).padStart(2, "0");
const uid = () => Math.random().toString(36).slice(2, 9);
let db;
try {
  db = JSON.parse(localStorage.getItem(K));
} catch (e) {}
db = db || {
  users: [
    {
      id: "sec",
      name: "Secretaria Central",
      email: "secretaria@ic.ufal.br",
      mat: "",
      pw: "secretaria123",
      role: "sec",
      strikes: [],
    },
  ],
  rooms: [],
  reqs: [],
  me: null,
};
let tab = "home",
  mode = "in",
  q = "";
const save = () => {
  try {
    localStorage.setItem(K, JSON.stringify(db));
  } catch (e) {}
};
const me = () => db.users.find((u) => u.id === db.me);
const usr = (id) => db.users.find((u) => u.id === id) || { name: "(removido)", email: "" };
const room = (id) => db.rooms.find((r) => r.id === id) || { code: "?", name: "sala removida" };
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const ts = (d, t) => new Date(d + "T" + t).getTime();
const fmt = (t) => new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const act = (u) => u.strikes.filter((s) => s.exp > Date.now());
const lock = (u) => (u.ban ? 8e15 : act(u).length >= 3 ? Math.max(...act(u).map((s) => s.exp)) : 0);
const dl = (r) => {
  const t = new Date(ts(r.date, r.end) + 18e5);
  return pad(t.getHours()) + ":" + pad(t.getMinutes());
};
const err = (m) => {
  $("#m").textContent = m;
};
const pend = () => db.reqs.filter((r) => r.status === "pendente" || r.ret === "pendente").length;
const free = (r) => status(r).t === "Livre";
function status(r) {
  const n = Date.now(),
    l = db.reqs.find(
      (x) =>
        x.room === r.id &&
        x.type === "emprestimo" &&
        x.status === "aprovada" &&
        x.ret !== "confirmada",
    );
  if (l) return { t: "Emprestada", c: "red", who: l.user };
  const b = db.reqs.find(
    (x) =>
      x.room === r.id &&
      x.type === "reserva" &&
      x.status === "aprovada" &&
      n >= ts(x.date, x.start) &&
      n <= ts(x.date, x.end),
  );
  return b ? { t: "Reservada", c: "amber", who: b.user } : { t: "Livre", c: "green" };
}
const conflict = (rid, d, s, e) =>
  db.reqs.some(
    (x) =>
      x.room === rid &&
      !["recusada", "cancelada"].includes(x.status) &&
      (x.type === "reserva"
        ? x.date === d && s < x.end && e > x.start
        : x.status === "aprovada" && x.ret !== "confirmada" && d === today()),
  );
const badge = (t, c) => `<span class="badge ${c}">${t}</span>`;
const sc = (s) => ({ pendente: "amber", aprovada: "green", recusada: "red", cancelada: "gray" })[s];
const empty = (m) => `<div class="card m">${m}</div>`;
const roomOpts = (l) =>
  l
    .map(
      (r) => `<option value="${r.id}">${esc(r.code)} · ${esc(r.name)} (${r.cap} lugares)</option>`,
    )
    .join("");

const A = {
  go(t) {
    tab = t;
    R();
  },
  mode(m) {
    mode = m;
    R();
  },
  out() {
    db.me = null;
    mode = "in"; // depois de sair, sempre volta para o login
    save();
    R();
  },
  login(e) {
    e.preventDefault();
    const f = new FormData(e.target),
      em = f.get("e").trim().toLowerCase();
    if (!em.endsWith("@ic.ufal.br"))
      return err("Use um e-mail institucional válido (@ic.ufal.br).");
    if (!f.get("p")) return err("Informe a senha.");
    const u = db.users.find((x) => x.email === em && x.pw === f.get("p"));
    if (!u) return err("E-mail ou senha incorretos.");
    db.me = u.id;
    tab = u.role === "sec" ? "dash" : "home";
    save();
    R();
  },
  reg(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)),
      em = f.e.trim().toLowerCase();
    if (!em.endsWith("@ic.ufal.br"))
      return err("Use um e-mail institucional válido (@ic.ufal.br).");
    if (!/^[0-9]+$/.test(f.m.trim())) return err("A matrícula deve conter apenas números.");
    if (f.p.length < 8) return err("A senha deve ter ao menos 8 caracteres.");
    if (db.users.some((x) => x.email === em || (x.mat && x.mat === f.m.trim())))
      return err("E-mail ou matrícula já cadastrados.");
    const u = {
      id: uid(),
      name: f.n.trim(),
      email: em,
      mat: f.m.trim(),
      pw: f.p,
      role: "al",
      strikes: [],
    };
    db.users.push(u);
    db.me = u.id;
    tab = "home";
    save();
    R();
  },
  res(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)),
      u = me();
    if (lock(u))
      return err(
        u.ban
          ? "Conta banida permanentemente."
          : "Conta restrita até " + new Date(lock(u)).toLocaleDateString("pt-BR") + ".",
      );
    if (!f.room) return err("Selecione uma sala.");
    if (f.end <= f.start) return err("O horário final deve ser depois do inicial.");
    if (conflict(f.room, f.date, f.start, f.end))
      return err("Horário já está em uso, escolha outro.");
    if (ts(f.date, f.start) < Date.now()) return err("Escolha um horário futuro.");
    db.reqs.push({
      id: uid(),
      type: "reserva",
      user: u.id,
      room: f.room,
      date: f.date,
      start: f.start,
      end: f.end,
      why: f.why.trim(),
      status: "pendente",
      at: Date.now(),
    });
    save();
    tab = "home";
    envioPendente = true;
    R();
  },
  emp(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)),
      u = me();
    if (lock(u))
      return err(
        u.ban
          ? "Conta banida permanentemente."
          : "Conta restrita até " + new Date(lock(u)).toLocaleDateString("pt-BR") + ".",
      );
    const r = db.rooms.find((x) => x.id === f.room);
    if (!r || !free(r)) return err("Essa sala não está livre. Escolha uma sala livre.");
    db.reqs.push({
      id: uid(),
      type: "emprestimo",
      user: u.id,
      room: r.id,
      why: f.why.trim(),
      status: "pendente",
      at: Date.now(),
    });
    save();
    tab = "home";
    envioPendente = true;
    R();
  },
  ret(id) {
    db.reqs.find((x) => x.id === id).ret = "pendente";
    save();
    R();
  },
  dec(id, s) {
    const x = db.reqs.find((r) => r.id === id);
    if (s === "aprovada" && x.type === "emprestimo" && !free(room(x.room)))
      return alert("A sala não está livre agora.");
    x.status = s;
    if (s === "aprovada") x.apAt = Date.now();
    if (s === "aprovada" && x.type === "emprestimo") x.start = Date.now();
    save();
    R();
  },
  rdec(id, ok) {
    const x = db.reqs.find((r) => r.id === id);
    if (ok) {
      x.ret = "confirmada";
      x.retAt = Date.now();
    } else delete x.ret;
    save();
    R();
  },
  addRoom(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)),
      c = f.c.trim();
    if (db.rooms.some((r) => r.code.toLowerCase() === c.toLowerCase()))
      return err("Já existe uma sala com esse código.");
    db.rooms.push({ id: uid(), code: c, name: f.n.trim(), cap: +f.k });
    save();
    R();
  },
  delRoom(id) {
    if (confirm("Remover esta sala?")) {
      db.rooms = db.rooms.filter((r) => r.id !== id);
      save();
      R();
    }
  },
  strike(id) {
    const w = (prompt("Justificativa do strike (obrigatória):") || "").trim();
    if (!w) return;
    usr(id).strikes.push({ why: w, at: Date.now(), exp: Date.now() + 180 * D });
    save();
    R();
  },
  find(v) {
    q = v.toLowerCase();
    R();
    const i = $("#q");
    i.focus();
    i.setSelectionRange(v.length, v.length);
  },
};

const V = {
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
              return `<div class="card"><div class="row"><b>${esc(r.code)} · ${esc(r.name)}</b>${badge(s.t, s.c)}</div><div class="m">${r.cap} lugares${s.who ? " · " + esc(usr(s.who).name) : ""}</div></div>`;
            })
            .join("")
        : empty("Nenhuma sala cadastrada ainda. A secretaria precisa cadastrá-las."))
    );
  },
  res() {
    return db.rooms.length
      ? `<form class="card" onsubmit="A.res(event)"><h2>Reserva antecipada</h2><label>Sala</label><select name="room">${roomOpts(db.rooms)}</select><label>Data</label><input type="date" name="date" min="${today()}" required><label>Início</label><input type="time" name="start" required><label>Fim</label><input type="time" name="end" required><label>Justificativa</label><textarea name="why" rows="3" required></textarea><div class="m">A chave deve ser devolvida até 30 minutos após o fim da reserva.</div><div class="err" id="m"></div><button class="p">Enviar solicitação</button></form>`
      : empty("Nenhuma sala cadastrada ainda.");
  },
  emp() {
    const l = db.rooms.filter(free);
    return l.length
      ? `<form class="card" onsubmit="A.emp(event)"><h2>Empréstimo imediato</h2><label>Sala livre</label><select name="room">${roomOpts(l)}</select><label>Justificativa</label><textarea name="why" rows="3" required></textarea><div class="err" id="m"></div><button class="p">Solicitar empréstimo</button></form>`
      : empty("Não há salas livres no momento.");
  },
  min(u) {
    const l = db.reqs.filter((r) => r.user === u.id).reverse();
    return l.length
      ? l
          .map(
            (r) =>
              `<div class="card"><div class="row"><b>${r.type === "reserva" ? "Reserva" : "Empréstimo"} · ${esc(room(r.room).code)}</b>${badge(r.status, sc(r.status))}</div><div class="m">${r.type === "reserva" ? `${r.date.split("-").reverse().join("/")} · ${r.start}–${r.end} · devolver até ${dl(r)}` : "Solicitado em " + fmt(r.at)}</div><div>${esc(r.why)}</div>${r.status === "aprovada" ? (r.ret === "confirmada" ? `<div class="m">Chave devolvida em ${fmt(r.retAt)}.</div>` : r.ret === "pendente" ? '<div class="m">Devolução aguardando confirmação da secretaria.</div>' : `<button class="p" style="margin-top:8px" onclick="A.ret('${r.id}')">Devolver chave</button>`) : ""}</div>`,
          )
          .join("")
      : empty("Você ainda não fez solicitações.");
  },
  dash() {
    const o = db.rooms.filter((r) => !free(r)).length;
    return (
      `<div class="stats"><div class="card"><b>${db.reqs.filter((r) => r.status === "pendente").length}</b><span class="m">Solicitações</span></div><div class="card"><b>${o}/${db.rooms.length}</b><span class="m">Ocupadas</span></div><div class="card"><b>${db.reqs.filter((r) => r.ret === "pendente").length}</b><span class="m">Devoluções</span></div></div>` +
      (db.rooms.length
        ? `<div class="card"><table><tr><th>SALA</th><th>STATUS</th><th>RESPONSÁVEL</th></tr>${db.rooms
            .map((r) => {
              const s = status(r);
              return `<tr><td>${esc(r.code)} · ${esc(r.name)}</td><td>${badge(s.t, s.c)}</td><td>${s.who ? esc(usr(s.who).name) : "—"}</td></tr>`;
            })
            .join("")}</table></div>`
        : empty("Cadastre salas na aba Salas."))
    );
  },
  sol() {
    const p = db.reqs.filter((r) => r.status === "pendente"),
      d = db.reqs.filter((r) => r.ret === "pendente"),
      h = db.reqs.filter((r) => r.status !== "pendente").reverse();
    const info = (r) =>
      `<b>${r.type === "reserva" ? "Reserva" : "Empréstimo"} · ${esc(room(r.room).code)}</b><div class="m">${esc(usr(r.user).name)} · ${esc(usr(r.user).email)}${r.type === "reserva" ? ` · ${r.date.split("-").reverse().join("/")} ${r.start}–${r.end}` : ""}</div><div>${esc(r.why)}</div>`;
    return `<div class="grid"><div><h2>Pendentes</h2>${p.length ? p.map((r) => `<div class="card">${info(r)}<div class="row" style="margin-top:8px"><button class="d" onclick="A.dec('${r.id}','recusada')">Recusar</button><button class="p" onclick="A.dec('${r.id}','aprovada')">Aprovar</button></div></div>`).join("") : empty("Nenhuma solicitação pendente.")}</div><div><h2>Devoluções</h2>${d.length ? d.map((r) => `<div class="card">${info(r)}<div class="row" style="margin-top:8px"><button class="d" onclick="A.rdec('${r.id}',0)">Recusar</button><button class="p" onclick="A.rdec('${r.id}',1)">Confirmar devolução</button></div></div>`).join("") : empty("Nenhuma devolução pendente.")}</div></div><h2 style="margin-top:14px">Histórico</h2>${h.length ? h.map((r) => `<div class="card"><div class="row">${info(r)}${badge(r.status, sc(r.status))}</div></div>`).join("") : empty("Sem registros.")}`;
  },
  sal() {
    return (
      `<form class="card" onsubmit="A.addRoom(event)"><h2>Nova sala</h2><div class="grid"><div><label>Código</label><input name="c" required></div><div><label>Nome</label><input name="n" required></div></div><label>Capacidade</label><input type="number" name="k" min="1" required><div class="err" id="m"></div><button class="p">Adicionar</button></form>` +
      (db.rooms.length
        ? `<div class="card"><table>${db.rooms
            .map((r) => {
              const s = status(r);
              return `<tr><td>${esc(r.code)} · ${esc(r.name)}<div class="m">${r.cap} lugares</div></td><td>${badge(s.t, s.c)}</td><td><button class="d" onclick="A.delRoom('${r.id}')">Remover</button></td></tr>`;
            })
            .join("")}</table></div>`
        : empty("Nenhuma sala cadastrada."))
    );
  },
  usr() {
    const l = db.users.filter(
      (u) => u.role === "al" && (u.name + u.email + u.mat).toLowerCase().includes(q),
    );
    return (
      `<input id="q" placeholder="Buscar por nome, e-mail ou matrícula" value="${esc(q)}" oninput="A.find(this.value)" style="margin-bottom:10px">` +
      (l.length
        ? l
            .map((u) => {
              const s = act(u);
              return `<div class="card"><div class="row"><b>${esc(u.name)}</b>${lock(u) ? badge("Restrito até " + new Date(lock(u)).toLocaleDateString("pt-BR"), "red") : badge(s.length + " strike(s)", s.length ? "amber" : "green")}</div><div class="m">${esc(u.email)} · matrícula ${esc(u.mat)}</div>${s.map((k) => `<div class="m">• ${esc(k.why)} (${fmt(k.at)}; expira em ${Math.ceil((k.exp - Date.now()) / D)} dias)</div>`).join("")}<button class="g" style="margin-top:8px" onclick="A.strike('${u.id}')">Aplicar strike</button></div>`;
            })
            .join("")
        : empty("Nenhum aluno encontrado."))
    );
  },
};

function auth() {
  const r = mode === "up";
  return `<div class="auth"><form class="card" onsubmit="A.${r ? "reg" : "login"}(event)"><h2>SalaReserva · IC/UFAL</h2>${r ? '<label>Nome completo</label><input name="n" required><label>Matrícula</label><input name="m" required inputmode="numeric" pattern="[0-9]+" title="Somente números" oninput="soNumeros(this)"><label>Foto de perfil</label><input type="file" accept="image/*" required onchange="lerFotoCadastro(this)">' : ""}<label>E-mail institucional</label><input name="e" type="email" placeholder="nome@ic.ufal.br" required><label>Senha${r ? " (mínimo 8 caracteres)" : ""}</label><input name="p" type="password" required><div class="err" id="m"></div><button class="p">${r ? "Criar conta" : "Entrar"}</button></form><button class="g" style="width:100%" onclick="A.mode('${r ? "in" : "up"}')">${r ? "Já tenho conta" : "Criar conta institucional"}</button></div>`;
}

function R() {
  const u = me(),
    a = $("#app");
  if (!u) {
    a.innerHTML = auth();
    return;
  }
  const sec = u.role === "sec",
    T = sec
      ? [
          ["dash", "Painel"],
          ["sol", "Solicitações"],
          ["sal", "Salas"],
          ["usr", "Usuários"],
        ]
      : [
          ["home", "Início"],
          ["res", "Reservar"],
          ["emp", "Empréstimo"],
          ["ses", "Sessão"],
          ["conta", "Conta"],
        ];
  if (!T.some((t) => t[0] === tab)) tab = T[0][0];
  a.innerHTML = `<div class="shell${sec ? " wide" : ""}"><header><b>SalaReserva</b><span>${esc(u.name)}</span><button class="g" onclick="A.out()">Sair</button></header><nav>${T.map(([k, l]) => `<button class="${tab === k ? "on" : ""}" onclick="A.go('${k}')">${l}${k === "sol" && pend() ? `<i>${pend()}</i>` : ""}</button>`).join("")}</nav><main>${V[tab](u)}</main></div>`;
}
R();
