# Beach Sports · Volley Web App

PWA React + TypeScript para organizar vôlei, com jogadores e partidas compartilhados via API e operações offline persistidas no aparelho.

[Design no Figma](https://www.figma.com/design/baO5SbbaGO01QTGc8d5M0P/volei-app--Copy-?node-id=2124-9496) · [DS](https://github.com/thaydds/Beach-Sports-DS/pull/24) · [App publicado](https://thaydds.github.io/volley-web-app/)

**Backend ativado em10/11/2026:** migration de ciclo de partidas aplicada, Edge Function `volley-api` versão7 publicada e autorização de desativação configurada. O banco preservou os4 jogadores existentes. O app usa components0.7.0 e tokens0.1.1; publicação do frontend depende do merge/deploy desta PR.

## Fluxo

- **Home:** spinner inicial sem texto visual, dados salvos, última sincronização e botão Sincronizar. Ranking / Partidas / Ajustes permanecem no menu inferior; Cartas está desabilitado. O rodapé usa versão do pacote e revisão real do build.
- **Quem veio hoje:** chips de largura natural, marca de seleção, cadastro na mesma tela. O × abre desativação, independentemente da presença. Desativar exige conexão e palavra-chave validada pelo servidor; não apaga histórico. Nome igual normalizado oferece reativação explícita da identidade anterior, sem mesclar homônimos silenciosamente.
- **Pré-jogo:** sorteio, arraste ou seleção → Mover, novo sorteio e Iniciar partida. Cada time recebe um dos papéis complementares Começa no saque / Escolhe o lado. Times e atribuições ficam congelados após iniciar.
- **Partidas:** abas Em andamento / Finalizadas. Os dois inputs DS de 56×56 ficam nas colunas do ScoreMatch. Salvar aceita inteiros não negativos; finalizar exige dois placares distintos, confirmação e vencedor calculado pelo servidor.
- **Finalizadas:** somente consulta, inclusive offline; sem editar ou excluir. Revanche prepara outra partida e preserva a anterior. Resultados antigos sem placar continuam com vencedor e `—`, sem pontos inventados.
- **Offline:** com cache, permite cadastrar, preparar, iniciar, salvar placar e finalizar. Cada ação só é confirmada após persistência no IndexedDB. Sincronizar envia a fila em ordem e consulta a base; reconectar não envia automaticamente. Conflitos e respostas incertas preservam a fila até recuperação explícita. Desativação e importação são online.
- **Ranking:** calculado por UUID a partir dos resultados disponíveis, incluindo projeção das finalizações locais pendentes. Uma vitória vale um ponto; histórico de desativados é preservado.

## Desenvolvimento e validação

```bash
npm ci
npm run dev
```

A base é `/volley-web-app/`. Sem `VITE_VOLLEY_API_URL`, o servidor de desenvolvimento mantém a prévia local legada; produção sem URL mostra indisponibilidade. Configure uma API de desenvolvimento com origem permitida para trabalhar na integração. O build padrão contém somente a URL pública da API; não contém chaves Supabase.

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run test:backend
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes de navegador usam build de produção, handler real e migrations reais em PGlite, com Auth externo simulado; não acessam o projeto remoto. Cobrem 393px, 320px e desktop, Light/Dark, acessibilidade, offline/reload, dispositivos independentes, abas, idempotência, conflitos e falhas de armazenamento. Evidências: `test-results/` e `playwright-report/`.

Tokens 0.1.1, CSS Modules e fonte Inter local continuam compartilhados; a fonte entra no cache offline. Preferências, presença e pré-jogo são locais. Backups anteriores `volley-v1` são preservados. [Contrato, segurança e recuperação](supabase/README.md) · [decisões de arquitetura](aidlc/spaces/default/intents/261110-offline-match-lifecycle/construction/architecture.md).

CI valida PRs. O workflow de deploy existente publica `main` no GitHub Pages; esta entrega não fez merge, deploy, publicação npm nem alteração do Figma.
