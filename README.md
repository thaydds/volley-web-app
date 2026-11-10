# Beach Sports · Volley Web App

PWA React + TypeScript para organizar vôlei, com jogadores e partidas compartilhados via API e operações offline persistidas no aparelho.

[Design no Figma](https://www.figma.com/design/baO5SbbaGO01QTGc8d5M0P/volei-app--Copy-?node-id=2124-9496) · [DS](https://github.com/thaydds/Beach-Sports-DS/pull/24) · [App publicado](https://thaydds.github.io/volley-web-app/)

**Backend ativado em10/11/2026:** migration de ciclo de partidas aplicada, Edge Function `volley-api` versão7 publicada e autorização de desativação configurada. O banco preservou os4 jogadores existentes. O app usa components0.8.0, que traz o Counter final e a composição em linhas; tokens0.1.1 preservados.

## Fluxo

- **Home:** spinner inicial sem texto visual, dados salvos, última sincronização e botão Sincronizar. Ranking / Partidas / Ajustes permanecem no menu inferior; Cartas está desabilitado. O rodapé usa versão do pacote e revisão real do build.
- **Quem veio hoje:** chips de largura natural, marca de seleção, cadastro na mesma tela. O × abre desativação, independentemente da presença. Desativar exige conexão e palavra-chave validada pelo servidor; não apaga histórico. Nome igual normalizado oferece reativação explícita da identidade anterior, sem mesclar homônimos silenciosamente.
- **Pré-jogo:** sorteio, arraste ou seleção → Mover, novo sorteio e Iniciar partida. Cada time recebe um dos papéis complementares Começa no saque / Escolhe o lado. Times e atribuições ficam congelados após iniciar.
- **Partidas:** abas Em andamento / Finalizadas. Counter de duas casas por time, layout em linhas, sem botão Salvar. O placar provisório acompanha a sessão aberta; somente finalizar cria o resultado persistido, com confirmação e vencedor calculado pelo servidor.
- **Finalizadas:** somente consulta, inclusive offline; sem editar ou excluir. Revanche prepara outra partida e preserva a anterior. Resultados antigos sem placar continuam com vencedor e `—`, sem pontos inventados.
- **Offline:** com cache, permite cadastrar, preparar, iniciar e finalizar. Cada ação só é confirmada após persistência no IndexedDB. Sincronizar envia a fila em ordem e consulta a base; reconectar não envia automaticamente. Conflitos e respostas incertas preservam a fila até recuperação explícita. Desativação e importação são online.
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

## Counter e placar de acompanhamento — proposta atual

Fonte: Figma Counter2197:11752, partida2184:16993, confirmação2184:20090. O Counter usa2 casas (00–99), entrada única e botões por time. Placar fora desse intervalo vindo da API antiga permanece visível e inválido até correção explícita; não é truncado. Finalizadas históricas continuam numéricas e conservam seus resultados.

Decisão desta implementação: acompanhamento somente em memória da sessão aberta do app. Navegar entre lista/detalhe/Home conserva os números; recarregar ou fechar descarta o provisório não finalizado e reabre o último valor conhecido do servidor/legado (ou00). Não há escrita de save_score, autosave, envio por toque ou realtime. Finalizar cria finish_match na fila persistida existente e bloqueia edição local; Sincronizar compartilha o resultado. Iniciar partida continua uma operação persistida, pois representa o jogo em andamento, sem resultado/ranking oficial.

A API/banco não mudam nesta PR. A rota save_score continua para compatibilidade e recuperação de envios anteriores. Se um cliente antigo alterar a versão, a sessão preserva seu acompanhamento e exige revisão explícita antes de finalizar. Persistir o provisório entre recarregamentos ou sincronizá-lo exige decisão posterior; não foi assumido aqui.

Dependência: components0.8.0 publicada (PR26 do DS), fixada no lockfile. O artefato de revisão foi removido e a suíte foi revalidada contra a release publicada. Sem merge ou deploy nesta entrega.
