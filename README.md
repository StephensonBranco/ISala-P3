\# SalaReserva



Sistema web para reserva e empréstimo de salas do IC/UFAL, com aprovação pela

secretaria, controle de chaves, strikes e banimentos.



\## Estado atual



\- \*\*Front-end:\*\* protótipo em HTML/CSS/JS puro. Os dados ficam no `localStorage`

&#x20; do navegador, então não há servidor nem banco conectado.

\- \*\*Banco de dados:\*\* modelo físico em PostgreSQL pronto em `database/schema.sql`,

&#x20; ainda \*\*não integrado\*\* ao site.



\## Como rodar o front-end



Abra `frontend/index.html` no navegador.



\## Como criar o banco (PostgreSQL 14+)



&#x20;   createdb -U postgres salareserva

&#x20;   psql -U postgres -d salareserva -f database/schema.sql



\## Estrutura



\- `frontend/`: site (HTML, CSS e JS)

\- `database/`: script SQL do modelo físico

\- `docs/`: diagrama do modelo físico



\## Próximos passos



\- \[ ] Criar o back-end (API) e conectar ao PostgreSQL

\- \[ ] Trocar o `localStorage` por chamadas à API

\- \[ ] Guardar senhas com hash (bcrypt/argon2)

