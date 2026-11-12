-- =====================================================================
-- SalaReserva · (PostgreSQL)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- Tipos ----------
CREATE TYPE perfil_usuario    AS ENUM ('student', 'secretary');
CREATE TYPE status_reserva    AS ENUM ('pending', 'approved', 'denied',
                                       'cancelled', 'completed',
                                       'expired');                 
CREATE TYPE tipo_reserva      AS ENUM ('agendada', 'imediata');    
CREATE TYPE tipo_banimento    AS ENUM ('temporario', 'permanente');
CREATE TYPE status_devolucao  AS ENUM ('em_uso', 'devolucao_pendente',
                                       'devolucao_confirmada');  
CREATE TYPE metodo_transf     AS ENUM ('qr', 'email');
CREATE TYPE status_convite    AS ENUM ('pendente', 'concluida',
                                       'recusada', 'cancelada');  
CREATE TYPE tipo_foto         AS ENUM ('abertura', 'transferencia'); 
CREATE TYPE status_foto       AS ENUM ('pendente_envio', 'em_analise',
                                       'aceita', 'recusada');    

-- ---------- Contas ----------
CREATE TABLE conta_usuario (
  id_usuario  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE
              CHECK (email = lower(email) AND email LIKE '%@ic.ufal.br'),
  hash_senha  VARCHAR(255) NOT NULL,          
  perfil      perfil_usuario NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE estudante (
  id_estudante      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario        INT NOT NULL UNIQUE REFERENCES conta_usuario(id_usuario),
  numero_matricula  VARCHAR(30) NOT NULL UNIQUE CHECK (numero_matricula ~ '^[0-9]+$'),
  nome_completo     VARCHAR(150) NOT NULL,
  curso             VARCHAR(120)
);

CREATE TABLE secretaria (
  id_secretaria  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario     INT NOT NULL UNIQUE REFERENCES conta_usuario(id_usuario),
  nome_completo  VARCHAR(150) NOT NULL
);

-- ---------- Salas ----------
CREATE TABLE sala (
  id_sala      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_sala  VARCHAR(30)  NOT NULL UNIQUE,
  nome_sala    VARCHAR(120) NOT NULL,
  capacidade   INT NOT NULL CHECK (capacidade > 0),
  localizacao  VARCHAR(150),
  ativa        BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- Reservas / empréstimos ----------
CREATE TABLE reserva (
  id_reserva    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_estudante  INT NOT NULL REFERENCES estudante(id_estudante),
  id_sala       INT NOT NULL REFERENCES sala(id_sala),
  tipo          tipo_reserva NOT NULL DEFAULT 'agendada', 
  inicio_em     TIMESTAMPTZ NOT NULL,
  fim_em        TIMESTAMPTZ NOT NULL,
  finalidade    VARCHAR(255),
  status        status_reserva NOT NULL DEFAULT 'pending',
  avaliada_por  INT REFERENCES secretaria(id_secretaria),
  avaliada_em   TIMESTAMPTZ,
  criada_em     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (fim_em > inicio_em),
  CHECK ((avaliada_por IS NULL) = (avaliada_em IS NULL)),
  EXCLUDE USING gist (id_sala WITH =, tstzrange(inicio_em, fim_em) WITH &&)
    WHERE (status IN ('pending', 'approved'))
);
CREATE INDEX idx_reserva_estudante ON reserva (id_estudante);
CREATE INDEX idx_reserva_status    ON reserva (status);

CREATE TABLE historico_reserva (
  id_historico     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_reserva       INT NOT NULL REFERENCES reserva(id_reserva),
  alterado_por     INT NOT NULL REFERENCES conta_usuario(id_usuario),
  status_anterior  status_reserva,
  novo_status      status_reserva NOT NULL,
  alterado_em      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacoes      VARCHAR(255)
);
CREATE INDEX idx_hist_reserva ON historico_reserva (id_reserva);

-- ---------- Chaves ----------
CREATE TABLE entrega_chave (
  id_entrega            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_reserva            INT NOT NULL REFERENCES reserva(id_reserva),
  id_estudante          INT NOT NULL REFERENCES estudante(id_estudante), 
  entregue_por          INT NOT NULL REFERENCES secretaria(id_secretaria),
  numero_chave          VARCHAR(30) NOT NULL,
  retirada_em           TIMESTAMPTZ NOT NULL,
  devolvida_em          TIMESTAMPTZ,                                     
  status_devolucao      status_devolucao NOT NULL DEFAULT 'em_uso',      
  devolucao_confirmada_por INT REFERENCES secretaria(id_secretaria),     
  devolucao_confirmada_em  TIMESTAMPTZ,                                  
  observacoes_condicao  VARCHAR(255),
  CHECK (devolvida_em IS NULL OR devolvida_em >= retirada_em),
  CHECK ((status_devolucao = 'em_uso') = (devolvida_em IS NULL)),
  CHECK ((status_devolucao = 'devolucao_confirmada')
         = (devolucao_confirmada_por IS NOT NULL AND devolucao_confirmada_em IS NOT NULL))
);
-- uma sessão ativa por aluno
CREATE UNIQUE INDEX uq_sessao_ativa_aluno  ON entrega_chave (id_estudante) WHERE status_devolucao = 'em_uso';
-- uma chave física não pode estar com duas pessoas
CREATE UNIQUE INDEX uq_chave_em_uso        ON entrega_chave (numero_chave) WHERE status_devolucao <> 'devolucao_confirmada';
-- uma entrega ativa por reserva
CREATE UNIQUE INDEX uq_entrega_ativa_reserva ON entrega_chave (id_reserva) WHERE status_devolucao <> 'devolucao_confirmada';

-- transferência de chave entre alunos (QR Code ou e-mail)
CREATE TABLE transferencia_chave (
  id_transferencia      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_entrega            INT NOT NULL REFERENCES entrega_chave(id_entrega),
  id_estudante_origem   INT NOT NULL REFERENCES estudante(id_estudante),
  id_estudante_destino  INT REFERENCES estudante(id_estudante),  
  metodo                metodo_transf NOT NULL,
  token                 VARCHAR(64) UNIQUE,                     
  status                status_convite NOT NULL DEFAULT 'pendente',
  criada_em             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluida_em          TIMESTAMPTZ,
  CHECK (id_estudante_destino IS DISTINCT FROM id_estudante_origem),
  CHECK (metodo <> 'qr' OR token IS NOT NULL),
  CHECK (metodo <> 'email' OR id_estudante_destino IS NOT NULL),
  CHECK ((status = 'concluida') = (concluida_em IS NOT NULL))
);
-- só um convite pendente por entrega
CREATE UNIQUE INDEX uq_transf_pendente ON transferencia_chave (id_entrega) WHERE status = 'pendente';

-- fotos da sala (abertura e pós-transferência) com aceite da secretaria
CREATE TABLE foto_sala (
  id_foto           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_reserva        INT NOT NULL REFERENCES reserva(id_reserva),
  id_estudante      INT NOT NULL REFERENCES estudante(id_estudante), 
  tipo              tipo_foto NOT NULL,
  id_transferencia  INT REFERENCES transferencia_chave(id_transferencia),
  caminho_arquivo   VARCHAR(255),                 
  status            status_foto NOT NULL DEFAULT 'pendente_envio',
  enviada_em        TIMESTAMPTZ,
  avaliada_por      INT REFERENCES secretaria(id_secretaria),
  avaliada_em       TIMESTAMPTZ,
  CHECK ((tipo = 'transferencia') = (id_transferencia IS NOT NULL)),
  CHECK (status = 'pendente_envio' OR caminho_arquivo IS NOT NULL)
);
-- Foto recusada: o registro fica como 'recusada' e o app cria outro 'pendente_envio'.
CREATE INDEX idx_foto_status ON foto_sala (status);

-- ---------- Punições ----------
CREATE TABLE strike (
  id_strike     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_estudante  INT NOT NULL REFERENCES estudante(id_estudante),
  aplicado_por  INT NOT NULL REFERENCES secretaria(id_secretaria),
  id_reserva    INT REFERENCES reserva(id_reserva),        
  id_entrega    INT REFERENCES entrega_chave(id_entrega),  
  iniciado_em   TIMESTAMPTZ NOT NULL,
  termina_em    TIMESTAMPTZ NOT NULL,
  motivo        VARCHAR(255),
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (termina_em > iniciado_em)
);
CREATE INDEX idx_strike_estudante ON strike (id_estudante, termina_em);

CREATE TABLE banimento (
  id_banimento         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_estudante         INT NOT NULL REFERENCES estudante(id_estudante),
  aplicado_por         INT NOT NULL REFERENCES secretaria(id_secretaria),
  tipo                 tipo_banimento NOT NULL,
  iniciado_em          TIMESTAMPTZ NOT NULL,
  termina_em           TIMESTAMPTZ,
  numero_no_historico  INT NOT NULL,
  motivo               VARCHAR(255),
  ativo                BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (id_estudante, numero_no_historico),
  CHECK ((tipo = 'permanente' AND termina_em IS NULL)
      OR (tipo = 'temporario' AND termina_em IS NOT NULL AND termina_em > iniciado_em))
);

CREATE VIEW estudante_bloqueado AS
SELECT e.id_estudante
FROM estudante e
WHERE (SELECT count(*) FROM strike s
        WHERE s.id_estudante = e.id_estudante AND s.ativo AND s.termina_em > now()) >= 3
   OR EXISTS (SELECT 1 FROM banimento b
               WHERE b.id_estudante = e.id_estudante AND b.ativo
                 AND (b.tipo = 'permanente' OR b.termina_em > now()));