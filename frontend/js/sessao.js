/*
 * Sessão do aluno e fluxo de fotos/transferência.
 * Carregado por último: usa e complementa o que está em app.js e extras.js.
 */

// ---------------------------------------------------------------------------
// Regras de sessão e lembretes
// ---------------------------------------------------------------------------

const INTERVALO_LEMBRETE = 5 * 60 * 1000; // um lembrete a cada 5 minutos
const MAX_LEMBRETES = 6; // depois de 6 lembretes a secretaria é alertada
const PRAZO_DEVOLUCAO = 30 * 60 * 1000; // devolução até 30 min após o fim da reserva

// Sessão ativa = chave retirada e ainda não devolvida. Só existe uma por aluno.
const sessaoAtiva = (u) =>
  db.reqs.find((x) => x.user === u.id && x.status === "aprovada" && x.out && !x.ret);

// A partir de quando o aluno é cobrado pela foto de abertura (aprovação ou início da reserva).
const inicioCobranca = (x) =>
  x.type === "reserva"
    ? Math.max(x.apAt || x.at, ts(x.date, x.start))
    : x.apAt || x.start || x.at;

// Lembretes já disparados (0 a 6) contando a partir do instante t.
const lembretesDesde = (t) =>
  Math.max(0, Math.min(MAX_LEMBRETES, Math.floor((Date.now() - t) / INTERVALO_LEMBRETE)));

// Lembretes da foto de abertura (pedido aprovado, chave ainda não retirada).
const lembretesAbertura = (x) =>
  x.status === "aprovada" && !x.out ? lembretesDesde(inicioCobranca(x)) : 0;

const reservaExpirada = (x) =>
  x.type === "reserva" && Date.now() > ts(x.date, x.end) + PRAZO_DEVOLUCAO;

// Transferências concluídas em que o aluno ainda precisa mandar a foto da sala.
const fotosDeTransferencia = (u) =>
  db.reqs.flatMap((x) =>
    (x.hist || []).filter((h) => h.from === u.id && h.st === "foto").map((h) => ({ x, h })),
  );

// Itens aguardando decisão na aba Devoluções da secretaria.
const pendDev = () =>
  db.reqs.filter((r) => r.ret === "pendente").length +
  db.reqs.reduce((n, x) => n + (x.hist || []).filter((h) => h.st === "pend").length, 0);

const quando = (x) =>
  x.type === "reserva"
    ? `${x.date.split("-").reverse().join("/")} ${x.start}–${x.end}`
    : "Empréstimo imediato";

// Alertas da secretaria: os de extras.js + foto de abertura ausente + cancelamentos.
const alerts = () =>
  [
    ...alertsBase(),
    ...db.reqs
      .filter((x) => lembretesAbertura(x) >= MAX_LEMBRETES)
      .map((x) => ({ k: x.id + "f", s: "critico", t: "Foto de abertura não enviada (6 lembretes sem resposta)", x })),
    ...db.reqs
      .filter((x) => x.status === "cancelada" && x.canc)
      .map((x) => ({ k: x.id + "c", s: "atencao", t: "Solicitação cancelada pelo aluno", x })),
  ].filter((a) => !(db.res || {})[a.k]);

// ---------------------------------------------------------------------------
// Ações do aluno
// ---------------------------------------------------------------------------

// Empréstimo imediato "em aberto": aguardando aprovação ou aprovado e com a devolução ainda não aceita pela secretaria.
const emprestimoEmAberto = (u) =>
  db.reqs.find((x) => x.user === u.id && x.type === "emprestimo" && (x.status === "pendente" || (x.status === "aprovada" && x.ret !== "confirmada")));
// Aluno "ocupado": sessão ativa ou empréstimo imediato já aprovado e não devolvido. Não pode receber chave.
// (Um empréstimo ainda pendente não conta.)
const emSessao = (u) =>
  sessaoAtiva(u) ||
  db.reqs.find((x) => x.user === u.id && x.type === "emprestimo" && x.status === "aprovada" && !x.ret);
// Mensagem conforme a situação do empréstimo que está bloqueando o novo pedido.
const msgEmprestimoAberto = (u) => {
  const x = emprestimoEmAberto(u);
  if (x.status === "pendente") return "Você já tem um empréstimo imediato aguardando aprovação. Aguarde a resposta da secretaria ou cancele esse pedido.";
  if (x.ret === "pendente") return "Sua devolução ainda não foi aceita pela secretaria. Só é possível fazer outro empréstimo imediato depois que ela aceitar.";
  return "Você já tem um empréstimo imediato em andamento. Devolva a chave e aguarde a secretaria aceitar a devolução para fazer outro.";
};

const empBase = A.emp;
const empTela = V.emp;
V.emp = (u) => (emprestimoEmAberto(u) ? empty(msgEmprestimoAberto(u)) : empTela(u));

Object.assign(A, {
  // Pedido de empréstimo: bloqueado enquanto houver sessão ativa.
  emp(e) {
    if (emprestimoEmAberto(me())) {
      e.preventDefault();
      return err(msgEmprestimoAberto(me()));
    }
    if (sessaoAtiva(me())) {
      e.preventDefault();
      return err("Você já tem uma sessão ativa. Devolva a chave antes de pedir outra sala.");
    }
    empBase(e);
  },

  // Retirada da chave com a foto panorâmica de abertura.
  take(id, foto) {
    if (sessaoAtiva(me())) return alert("Devolva a chave da sessão atual antes de retirar outra.");
    const x = db.reqs.find((r) => r.id === id);
    x.out = Date.now();
    x.pO = foto;
    save();
    R();
  },

  // Devolução: foto de fechamento e espera pela confirmação da secretaria.
  give(id, foto) {
    const x = db.reqs.find((r) => r.id === id);
    x.pC = foto;
    x.ret = "pendente";
    save();
    R();
  },

  // Cancelamento de pedido pendente ou de reserva ainda não retirada.
  cancel(id) {
    if (db.reqs.find((r) => r.id === id).status !== "pendente")
      return alert("Solicitações aprovadas não podem ser canceladas. Se já está com a chave, faça a devolução.");
    if (!confirm("Cancelar esta solicitação? A sala volta a ficar livre e a secretaria é avisada.")) return;
    const x = db.reqs.find((r) => r.id === id);
    x.status = "cancelada";
    x.canc = Date.now();
    save();
    R();
  },

  // Passo 1 da transferência: escolher QR Code ou e-mail.
  tr(id) {
    modal = `<h2>Transferir chave</h2>
<div class="m">Como o novo responsável vai receber a chave?</div>
<button class="btn" style="width:100%;border:0" onclick="A.trQR('${id}')">QR Code</button>
<button class="btn" style="width:100%;border:0" onclick="A.trMail('${id}')">E-mail institucional</button>
${X}`;
    R();
  },

  // Transferência por QR Code: o novo responsável lê o código com a câmera.
  trQR(id) {
    const x = db.reqs.find((r) => r.id === id);
    x.tk = x.tk || uid() + uid();
    save();
    modal = `<h2>Transferir por QR Code</h2>
<div class="m">Peça para o novo responsável abrir Sessão → Ler QR Code e apontar a câmera para este código.</div>
<div id="qr" style="margin:12px 0"></div>
<div class="m">Código: <b>${x.tk}</b></div>${X}`;
    R();
    try {
      new QRCode($("#qr"), { text: x.tk, width: 170, height: 170 });
    } catch (e) {}
  },

  // Transferência por e-mail: o convite aparece na Sessão de quem recebe.
  trMail(id) {
    modal = `<h2>Transferir por e-mail</h2>
<label>E-mail institucional do novo responsável</label>
<input id="te" placeholder="nome@ic.ufal.br">
<div class="err" id="m"></div>
<button class="p" style="margin-top:8px" onclick="A.trE('${id}')">Enviar convite</button>${X}`;
    R();
  },

  trE(id) {
    const email = $("#te").value.trim().toLowerCase();
    const alvo = db.users.find((u) => u.email === email && u.role === "al");
    if (!alvo || alvo.id === db.me) return err("Informe o e-mail institucional de outro aluno cadastrado.");
    if (emSessao(alvo)) return err("Esse aluno está com uma sessão ativa e não pode receber a chave agora.");
    db.reqs.find((r) => r.id === id).tr = { to: email, st: "pendente" };
    save();
    modal = "";
    R();
  },

  // Quem recebeu o convite aceita ou recusa.
  trD(id, aceitar) {
    const x = db.reqs.find((r) => r.id === id);
    if (aceitar && emSessao(me())) return alert("Devolva a chave da sua sessão atual antes de aceitar outra.");
    if (aceitar) concluirTransferencia(x, db.me);
    else {
      x.tr = null;
      save();
      R();
    }
  },

  // Quem leu o QR Code (ou digitou o código) passa a ser o responsável pela chave.
  code(codigo) {
    const x = db.reqs.find((r) => r.tk === codigo && r.out && !r.ret && r.user !== db.me);
    if (!x) return alert("Código inválido ou chave indisponível para transferência.");
    if (emSessao(me())) return alert("Devolva a chave da sua sessão atual antes de receber outra.");
    concluirTransferencia(x, db.me);
  },

  // Quem transferiu envia a foto panorâmica da sala; a secretaria precisa aceitar.
  fotoTransf(id, hid, foto) {
    const h = db.reqs.find((r) => r.id === id).hist.find((t) => t.id === hid);
    h.ph = foto;
    h.st = "pend";
    save();
    R();
  },

  // Secretaria aceita ou recusa a foto da transferência (recusada: o aluno reenvia).
  thDec(id, hid, aceitar) {
    const h = db.reqs.find((r) => r.id === id).hist.find((t) => t.id === hid);
    h.st = aceitar ? "ok" : "foto";
    save();
    R();
  },
});

// Troca de posse imediata; o aluno que transferiu fica com a pendência da foto.
function concluirTransferencia(x, novoId) {
  x.hist = x.hist || [];
  x.hist.push({ id: uid(), from: x.user, to: novoId, at: Date.now(), ph: null, st: "foto" });
  x.user = novoId;
  x.tr = null;
  x.tk = null;
  save();
  R();
}

// ---------------------------------------------------------------------------
// Leitor de QR Code (câmera)
// ---------------------------------------------------------------------------

function lerQR() {
  modal = `<h2>Ler QR Code</h2>
<video id="v" autoplay playsinline muted style="width:100%;border-radius:8px;background:#000"></video>
<div class="m" style="margin-top:6px">Aponte a câmera para o QR Code de quem vai transferir a chave.</div>
<div class="err" id="m"></div>
<button class="g" data-x style="margin-top:8px;width:100%">Cancelar</button>`;
  R();
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: "environment" } } })
    .then((s) => {
      stream = s;
      const video = $("#v");
      video.srcObject = s;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const varrer = () => {
        if (!stream) return; // câmera fechada
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const lido = window.jsQR && jsQR(img.data, img.width, img.height);
          if (lido && lido.data) {
            stopCam();
            modal = "";
            return A.code(lido.data);
          }
        }
        requestAnimationFrame(varrer);
      };
      varrer();
    })
    .catch(() => err("Não foi possível abrir a câmera. Permita o acesso e use uma conexão segura (HTTPS)."));
}

// ---------------------------------------------------------------------------
// Tela do aluno: Sessão
// ---------------------------------------------------------------------------

const tipoPedido = (x) => (x.type === "reserva" ? "Reserva antecipada" : "Empréstimo imediato");
const larguraTotal = 'style="width:100%;margin-top:8px"';

// Sessão em andamento: prazo, lembretes de devolução, devolver e transferir.
function cartaoSessaoAtiva(x) {
  const prazo = x.type === "reserva" ? ts(x.date, x.end) + PRAZO_DEVOLUCAO : null;
  const restante = prazo ? Math.ceil((prazo - Date.now()) / 60000) : 0;
  const atrasos = prazo ? lembretesDesde(prazo) : 0;
  return `<div class="card">
<div class="row"><b>Sessão ativa · ${esc(room(x.room).code)}</b>${badge("Em uso", "green")}</div>
<div class="m">${tipoPedido(x)} · chave retirada às ${hm(x.out)} · foto de abertura registrada</div>
${prazo ? `<div class="m">${restante > 0 ? `Devolver em até ${restante} min (até ${dl(x)})` : "Prazo de devolução vencido"}</div>` : ""}
${[...Array(atrasos)]
  .map((_, i) => `<div class="err">🔔 Lembrete de devolução ${i + 1}/${MAX_LEMBRETES} · ${hm(prazo + (i + 1) * INTERVALO_LEMBRETE)}</div>`)
  .join("")}
${atrasos >= MAX_LEMBRETES ? '<div class="err">A secretaria foi alertada sobre o atraso na devolução.</div>' : ""}
${x.tr ? `<div class="m">Convite de transferência enviado para ${esc(x.tr.to)}. Aguardando resposta.</div>` : ""}
${photoBtn("Devolver chave · tirar foto da sala", `A.give.bind(null,'${x.id}')`)}
<button class="g" ${larguraTotal} onclick="A.tr('${x.id}')">Transferir chave</button>
</div>`;
}

// Pedido aprovado ainda sem retirada: cobra a foto de abertura com lembretes.
function cartaoRetirada(x, ativa) {
  const t0 = inicioCobranca(x);
  const n = lembretesAbertura(x);
  const antes = Date.now() < t0;
  let acao = "";
  if (reservaExpirada(x)) acao = '<div class="m">Reserva expirada sem retirada.</div>';
  else if (ativa) acao = '<div class="m">Devolva a chave da sessão atual antes de retirar outra.</div>';
  else acao = photoBtn("Retirar chave · tirar foto panorâmica", `A.take.bind(null,'${x.id}')`);
  return `<div class="card">
<div class="row"><b>${tipoPedido(x)} aprovada · ${esc(room(x.room).code)}</b>${badge("Aprovada", "green")}</div>
<div class="m">${x.type === "reserva" ? quando(x) : "Retire a chave e envie a foto de abertura"}</div>
${antes ? `<div class="m">Você já pode retirar a chave e enviar a foto. Os lembretes começam em ${fmt(t0)}.</div>` : ""}
${!antes && n === 0 && !reservaExpirada(x) ? '<div class="m">Envie a foto panorâmica da sala em até 5 minutos.</div>' : ""}
${[...Array(n)]
  .map((_, i) => `<div class="err">🔔 Lembrete ${i + 1}/${MAX_LEMBRETES} · ${hm(t0 + (i + 1) * INTERVALO_LEMBRETE)} · envie a foto panorâmica da sala</div>`)
  .join("")}
${n >= MAX_LEMBRETES ? '<div class="err">A secretaria foi alertada: foto de abertura não enviada.</div>' : ""}
${acao}
</div>`;
}

V.ses = (u) => {
  const ativa = sessaoAtiva(u);
  const pedidos = db.reqs.filter((r) => r.user === u.id).reverse();
  const convites = db.reqs.filter((x) => x.tr && x.tr.to === u.email && x.tr.st === "pendente");

  const fotos = fotosDeTransferencia(u).map(
    ({ x, h }) => `<div class="card">
<b>Transferência concluída · ${esc(room(x.room).code)}</b>
<div class="m">${nome(usr(h.to), 24)} recebeu a chave. Envie a foto panorâmica da sala; a secretaria precisa aceitar.</div>
${photoBtn("Enviar foto da transferência", `A.fotoTransf.bind(null,'${x.id}','${h.id}')`)}
</div>`,
  );

  const receber = `<div class="card">
<b>Receber chave</b>
<button class="btn" style="width:100%;border:0" onclick="lerQR()">Ler QR Code</button>
<div class="row" style="flex-wrap:nowrap;margin-top:8px"><input id="cd" placeholder="ou digite o código"><button class="g" onclick="A.code($('#cd').value.trim())">OK</button></div>
</div>`;

  const cartoesConvite = convites.map(
    (x) => `<div class="card">
<b>${nome(usr(x.user), 32)} quer transferir a chave da ${esc(room(x.room).code)} para você</b>
<div class="row" style="margin-top:8px"><button class="d" onclick="A.trD('${x.id}',0)">Recusar</button><button class="p" onclick="A.trD('${x.id}',1)">Aceitar</button></div>
</div>`,
  );

  return [
    ...fotos,
    ativa ? cartaoSessaoAtiva(ativa) : '<div class="card m">Nenhuma sessão ativa no momento.</div>' + receber,
    ...cartoesConvite,
    ...pedidos.filter((r) => r.status === "aprovada" && !r.out).map((r) => cartaoRetirada(r, ativa)),
  ].join("");
};

// Conta: perfil, foto, senha, penalidades e histórico.
let fotoCadastro = null; // foto escolhida na tela de criar conta

// Recorta no centro e reduz a foto para um quadrado pequeno (cabe no armazenamento do navegador).
function redimensionar(origem, lado, cb) {
  const desenhar = (url) => {
    const img = new Image();
    img.onload = () => {
      const k = lado / Math.min(img.width, img.height);
      const w = img.width * k;
      const h = img.height * k;
      const c = document.createElement("canvas");
      c.width = c.height = lado;
      c.getContext("2d").drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
      cb(c.toDataURL("image/jpeg", 0.8));
    };
    img.src = url;
  };
  if (typeof origem === "string") return desenhar(origem);
  const leitor = new FileReader();
  leitor.onload = () => desenhar(leitor.result);
  leitor.readAsDataURL(origem);
}

// Campo de matrícula: remove tudo que não for dígito enquanto a pessoa digita.
function soNumeros(input) {
  input.value = input.value.replace(/\D/g, "");
}

function lerFotoCadastro(input) {
  fotoCadastro = null;
  if (input.files[0]) redimensionar(input.files[0], 160, (d) => (fotoCadastro = d));
}

function trocarFoto(input) {
  if (!input.files[0]) return;
  redimensionar(input.files[0], 160, (d) => {
    me().photo = d;
    save();
    R();
  });
}

function cartaoPerfil(u) {
  return `<div class="card">
<div class="row" style="justify-content:flex-start;gap:14px">${avatar(u, 72)}<div><b>${esc(u.name)}</b><div class="m">${esc(u.email)}</div><div class="m">Matrícula ${esc(u.mat)}</div></div></div>
<label class="btn">Alterar foto<input type="file" accept="image/*" hidden onchange="trocarFoto(this)"></label>
<div class="m" style="margin-top:6px">Toque em "Alterar foto" para escolher uma imagem da galeria ou tirar uma nova. A foto é recortada e reduzida automaticamente.</div>
${u.photo ? '<button class="g" style="width:100%;margin-top:8px" onclick="A.rmFoto()">Remover foto</button>' : ""}
</div>`;
}

function cartaoSenha() {
  return `<form class="card" onsubmit="A.senha(event)">
<h2>Alterar senha</h2>
<label>Senha atual</label><input type="password" name="atual" required>
<label>Nova senha (mínimo 8 caracteres)</label><input type="password" name="nova" required>
<label>Confirmar nova senha</label><input type="password" name="conf" required>
<div class="err" id="m"></div><div class="m" id="ok" style="color:var(--g)"></div>
<button class="p">Salvar nova senha</button>
</form>`;
}

Object.assign(A, {
  rmFoto() {
    delete me().photo;
    save();
    R();
  },

  senha(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const u = me();
    const msg = (texto, ok) => {
      $("#m").textContent = ok ? "" : texto;
      $("#ok").textContent = ok ? texto : "";
    };
    if (f.atual !== u.pw) return msg("Senha atual incorreta.");
    if (f.nova.length < 8) return msg("A nova senha deve ter ao menos 8 caracteres.");
    if (f.nova === f.atual) return msg("A nova senha deve ser diferente da atual.");
    if (f.nova !== f.conf) return msg("A confirmação não confere com a nova senha.");
    u.pw = f.nova;
    save();
    e.target.reset();
    msg("Senha alterada com sucesso.", true);
  },
});

// Criar conta exige a foto de perfil e a salva junto com o cadastro.
const regBase = A.reg;
A.reg = (e) => {
  if (!fotoCadastro) {
    e.preventDefault();
    return err("Escolha uma foto de perfil (ou aguarde o carregamento dela).");
  }
  regBase(e);
  const u = me();
  if (u) {
    mode = "in"; // conta criada: no próximo logout, a tela é a de login
    u.photo = fotoCadastro;
    fotoCadastro = null;
    save();
    R();
  }
};

// Tela Conta do aluno.
V.conta = (u) => {
  const pedidos = db.reqs.filter((r) => r.user === u.id).reverse();
  const penalidades = act(u);
  const historico = pedidos.map((r) => {
    const cancelavel = r.status === "pendente"; // aprovada não pode mais ser cancelada
    return `<div class="card">
<div class="row"><b>${tipoPedido(r)} · ${esc(room(r.room).code)}</b>${badge(r.status, sc(r.status))}</div>
<div class="m">${r.type === "reserva" ? `${quando(r)} · devolver até ${dl(r)}` : `Solicitado em ${fmt(r.at)}`}</div>
<div>${esc(r.why)}</div>
${r.status === "recusada" && r.just ? `<div class="err">Justificativa da recusa: ${esc(r.just)}</div>` : ""}
${r.ret === "pendente" ? '<div class="m">Devolução aguardando confirmação da secretaria.</div>' : ""}
${r.ret === "confirmada" ? `<div class="m">Chave devolvida em ${fmt(r.retAt)}.</div>` : ""}
${cancelavel ? `<button class="d" ${larguraTotal} onclick="A.cancel('${r.id}')">Cancelar solicitação</button>` : ""}
</div>`;
  });

  const cartaoPenalidades =
    penalidades.length || ban(u) || restr(u)
      ? `<div class="card"><b>Minhas penalidades</b>
${ban(u) ? '<div class="err">Banido permanentemente do uso de salas.</div>' : restr(u) ? `<div class="err">Restrito até ${fd(lock(u))}: reservas e empréstimos bloqueados.</div>` : ""}
${penalidades.map((k) => `<div class="m">• ${esc(k.why)} (expira em ${fd(k.exp)})</div>`).join("")}
</div>`
      : "";

  return [
    cartaoPerfil(u),
    cartaoSenha(),
    cartaoPenalidades,
    `<h2 style="margin:16px 0 4px">Histórico</h2><div class="m" style="margin-bottom:8px">Reservas antecipadas e empréstimos, passados e em andamento.</div>`,
    ...(historico.length ? historico : [empty("Você ainda não fez solicitações.")]),
  ].join("");
};

// ---------------------------------------------------------------------------
// Telas da secretaria: Devoluções (com transferências) e Alertas
// ---------------------------------------------------------------------------

// Cada trecho de uso tem duas fotos: início (abertura ou transferência) e fim (transferência ou fechamento).
function trechosDoPedido(x) {
  const hist = x.hist || [];
  const itens = hist.map((h, i) => ({
    tipo: "Transferência",
    quem: h.from,
    status: h.st,
    ini: i === 0 ? { rot: "Abertura", foto: x.pO } : { rot: "Transferência", foto: hist[i - 1].ph },
    fim: { rot: "Transferência", foto: h.ph },
    decidir: h.st === "pend" ? `A.thDec('${x.id}','${h.id}',` : "",
    at: h.at,
  }));
  if (x.ret) {
    itens.push({
      tipo: "Devolução",
      quem: x.user,
      status: x.ret,
      ini: hist.length ? { rot: "Transferência", foto: hist[hist.length - 1].ph } : { rot: "Abertura", foto: x.pO },
      fim: { rot: "Fechamento", foto: x.pC },
      decidir: x.ret === "pendente" ? `A.rdec('${x.id}',` : "",
      at: x.retAt || x.out,
    });
  }
  return itens.map((i) => ({ ...i, x }));
}

V.dev = () => {
  const itens = db.reqs.flatMap(trechosDoPedido).sort((a, b) => (b.decidir ? 1 : 0) - (a.decidir ? 1 : 0) || b.at - a.at);
  const foto = (p) =>
    p.foto
      ? `<div style="width:48%"><img src="${p.foto}" style="width:100%;border-radius:8px"><div class="m">${p.rot}</div></div>`
      : `<div class="m" style="width:48%">${p.rot}: sem foto</div>`;
  return itens.length
    ? itens
        .map(
          (i) => `<div class="card">
<div class="row"><b>${i.tipo} · ${esc(room(i.x.room).code)} · ${nome(usr(i.quem), 28)}</b>${badge(i.status === "pend" || i.status === "pendente" ? "pendente" : i.status === "foto" ? "aguardando foto" : "confirmada", i.status === "pend" || i.status === "pendente" ? "amber" : i.status === "foto" ? "gray" : "green")}</div>
<div class="m">${i.ini.rot} e ${i.fim.rot.toLowerCase()}</div>
<div class="row" style="margin:8px 0;align-items:flex-start">${foto(i.ini)}${foto(i.fim)}</div>
${i.decidir ? `<div class="row"><button class="d" onclick="${i.decidir}0)">Recusar</button><button class="p" onclick="${i.decidir}1)">Confirmar</button></div>` : ""}
</div>`,
        )
        .join("")
    : empty("Nenhuma devolução ou transferência registrada.");
};

V.ale = () => {
  const lista = alerts().filter((a) => S.af === "todos" || a.s === S.af);
  return (
    chips([["todos", "Todos"], ["critico", "Crítico"], ["atencao", "Atenção"]], "af") +
    (lista.length
      ? lista
          .map(
            (a) => `<div class="card">
<div class="row"><b>${a.t}</b>${badge(a.s === "critico" ? "Crítico" : "Atenção", a.s === "critico" ? "red" : "amber")}</div>
<div class="m">${nome(usr(a.x.user), 28)} · sala ${esc(room(a.x.room).code)} · ${quando(a.x)}</div>
<div class="row" style="margin-top:8px"><a class="g" href="mailto:${esc(usr(a.x.user).email)}"><button class="g">Contatar</button></a><button class="p" onclick="A.res_('${a.k}')">Marcar como resolvido</button></div>
</div>`,
          )
          .join("")
      : empty("Nenhum alerta ativo."))
  );
};

// ---------------------------------------------------------------------------
// Pop-ups do aluno: envio da solicitação e resposta da secretaria
// ---------------------------------------------------------------------------

let envioPendente = false; // true logo após enviar uma reserva/empréstimo

// Aprovar ou recusar: a recusa exige justificativa, e o aluno é avisado por pop-up.
const decBase = A.dec;
A.dec = (id, status) => {
  const x = db.reqs.find((r) => r.id === id);
  let justificativa = "";
  if (status === "recusada") {
    justificativa = (prompt("Justificativa da recusa (obrigatória):") || "").trim();
    if (!justificativa) return;
  }
  const antes = x.status;
  decBase(id, status);
  if (x.status === status && antes !== status) {
    x.just = justificativa;
    x.aviso = status; // fica pendente até o aluno fechar o pop-up
    save();
    R();
  }
};

// Próximo pop-up a mostrar para o aluno logado (ou null).
function proximoAviso() {
  const u = me();
  if (!u || u.role !== "al") return null;
  if (envioPendente) return { html: "<b>Solicitação enviada, esperando confirmação.</b>" };
  const x = db.reqs.find((r) => r.user === u.id && r.aviso);
  if (!x) return null;
  const resumo = `${tipoPedido(x)} · sala ${esc(room(x.room).code)}${x.type === "reserva" ? " · " + quando(x) : ""}`;
  if (x.aviso === "aprovada")
    return { html: `<b>Solicitação aprovada</b><div class="m">${resumo}</div><div>Abra a aba Sessão para retirar a chave e enviar a foto da sala.</div>` };
  return { html: `<b>Solicitação recusada</b><div class="m">${resumo}</div><div class="err">Justificativa: ${esc(x.just || "não informada")}</div>` };
}

function fecharAviso() {
  if (envioPendente) envioPendente = false;
  else {
    const x = db.reqs.find((r) => r.user === db.me && r.aviso);
    if (x) delete x.aviso;
    save();
  }
  R();
}

// Desenha o pop-up por cima da tela atual (sem mexer no resto da interface).
function mostrarAviso() {
  const antigo = document.getElementById("pop");
  if (antigo) antigo.remove();
  const aviso = proximoAviso();
  if (!aviso) return;
  const pop = document.createElement("div");
  pop.id = "pop";
  pop.className = "ov";
  pop.innerHTML = `<div class="card" style="text-align:center">${aviso.html}<button class="p" style="margin-top:14px" onclick="fecharAviso()">OK</button></div>`;
  document.body.appendChild(pop);
}

// Todo redesenho passa a checar se há pop-up pendente.
const rBase = R;
R = function () {
  rBase();
  mostrarAviso();
};

// ---------------------------------------------------------------------------
// Atualização automática (lembretes e alertas dependem do relógio)
// ---------------------------------------------------------------------------

setInterval(() => {
  const campo = document.activeElement;
  if (!db.me || modal || (campo && /INPUT|TEXTAREA|SELECT/.test(campo.tagName))) return;
  if (["ses", "dev", "ale", "dash"].includes(tab)) R();
}, 15000);

R();
