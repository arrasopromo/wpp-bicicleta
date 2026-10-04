# wpp-bicicleta

WhatsApp da Casa das Bicicletas (instância `CasaBicicletas` na Evolution API): CRM com todas as conversas
e automação de atendimento para quem chega por anúncio.

## O que faz

- **Registra todas as conversas** (cliente, bot e atendente) num banco SQLite em `dados/crm.db`
- **Detecta anúncio** "clique para WhatsApp": guarda título, texto e link do anúncio no contato
- **Automação só para quem veio de anúncio** (mude `automacao: 'todos'` em `config.js` para valer para todo mundo):
  saudação citando o anúncio + menu (1 bicicletas, 2 endereço, 3 pagamento, 4 atendente)
- **Opção 1** lista as bicicletas (uma por subpasta de `MEDIA_DIR`) e manda as fotos/vídeos da escolhida
- **Bot para sozinho** quando o cliente pede atendente, ou quando alguém responde pelo celular ou pelo painel (12h)

## Painel CRM — `https://casadasbicicletas.site/crm`

Senha em `CRM_SENHA` no `.env`.

- Lista de conversas com filtros: Anúncio, Orgânico, Não lidas, Bot pausado + busca
- **⏸ Pausar bot / ▶ Retomar bot** por cliente (pausa pelo botão vale até clicar em Retomar)
- **Automação ligada/pausada** no topo: liga/desliga para todo mundo
- Status do cliente (novo, em atendimento, aguardando cliente, vendido, perdido) e notas
- Responder pelo painel

Textos do bot ficam em `config.js` — **preencha endereço, horário e pagamento** (estão como `[PREENCHER]`).

## Comandos

```bash
npm start          # sobe o servidor
npm run testar     # simula conversas sem mandar nada (banco em memória)
npm run webhook    # cadastra/atualiza o webhook na Evolution
```

## Colocar no ar

1. DNS: registro **A** de `casadasbicicletas.site` (e `www`) → IP da VPS.
2. Na VPS (Node 22+):
   ```bash
   git clone https://github.com/arrasopromo/wpp-bicicleta.git && cd wpp-bicicleta
   cp .env.example .env   # preencher com os mesmos valores do .env local (WEBHOOK_TOKEN igual!)
   ```
   Envie a pasta de mídias para `wpp-bicicleta/midia/` (subpastas `Aro12 fem`, `Aro16 masc`, …).
3. Rode com pm2 (porta 5000): `npm i -g pm2 && pm2 start npm --name wpp-bicicleta -- start && pm2 save && pm2 startup`
4. Nginx + HTTPS: siga os passos no topo de [`deploy/nginx.conf`](deploy/nginx.conf).
5. Teste: `https://casadasbicicletas.site/` deve mostrar `wpp-bicicleta ok — 12 bicicletas no catálogo`.

Atualizar depois: `git pull && pm2 restart wpp-bicicleta`.

O webhook já está cadastrado apontando para `https://casadasbicicletas.site/webhook/<WEBHOOK_TOKEN>`.
Faça backup de `dados/crm.db` — é ali que ficam as conversas.
