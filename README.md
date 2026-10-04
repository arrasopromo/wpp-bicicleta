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

1. Servidor com Node 22+ (VPS). Copie esta pasta e a pasta de mídias (`midia/` com as subpastas `Aro12 fem`, `Aro16 masc`, …).
2. No `.env` do servidor ajuste `MEDIA_DIR=./midia`.
3. Rode com pm2: `npm i -g pm2 && pm2 start npm --name wpp-bicicleta -- start && pm2 save`
4. DNS: registro **A** de `casadasbicicletas.site` → IP do servidor.
5. HTTPS com Caddy (`/etc/caddy/Caddyfile`):
   ```
   casadasbicicletas.site {
       reverse_proxy localhost:3000
   }
   ```
6. Teste: `https://casadasbicicletas.site/` deve mostrar `wpp-bicicleta ok — 12 bicicletas no catálogo`.

O webhook já está cadastrado apontando para `https://casadasbicicletas.site/webhook/<WEBHOOK_TOKEN>`.
Faça backup de `dados/crm.db` — é ali que ficam as conversas.
