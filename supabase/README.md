# Volley — banco, API e integração

A PR #10 contém a integração completa das telas, migração com prévia e consulta
offline. Seis migrations foram aplicadas ao projeto `xejuimptprhvrjohhqyn` e a
Edge Function `volley-api` foi publicada. O app publicado ainda depende do merge.

**Acesso habilitado e validação real concluída:** o usuário ativou Anonymous
Sign-Ins. Dois clientes independentes acessaram a API publicada, compartilharam
jogadores, partidas e ranking, renovaram sessão e verificaram conflitos,
restauração, importação e deduplicação. O app publicado será atualizado pelo merge.
Os limites reais foram exercitados apenas em uso normal, sem teste de carga ou
esgotamento de quotas. A configuração local em config.toml não altera o remoto.

## Arquitetura e chaves

Navegador → Edge Function → três RPCs fixas → sete tabelas privadas com RLS.

O build inclui somente a URL pública da API em `.env.production`. Nenhuma chave
Supabase vai para o frontend. A função usa SUPABASE_URL e SUPABASE_ANON_KEY do
runtime, nunca service_role. Em Auth, envia a chave de aplicação também como
Bearer de fallback, como o SDK oficial; em consultas/gravações, o Bearer é sempre
o token de sessão recebido do usuário, validado online por `/auth/v1/user`.

O navegador recebe access/refresh tokens temporários, guardados separadamente
no armazenamento da origem para reutilizar a sessão. São credenciais de usuário
que exigem proteção contra XSS; não devem ir para URLs, logs ou relatórios. O
app renderiza nomes como texto, sem HTML injetado. Não existe CAPTCHA, widget,
site key, secret Turnstile ou tela de login.

## Contrato HTTP

Todos os endpoints usam POST, JSON e `Cache-Control: no-store`. O servidor limita
os bytes efetivamente recebidos a 32 KiB e não retorna mensagens SQL, chaves ou
metadados internos. `verify_jwt=false` é intencional: o próprio handler verifica
online os tokens de todas as operações protegidas; bootstrap/refresh têm
contratos específicos.

| Endpoint   | Corpo                                                                                      | Autorização                               |
| ---------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `/session` | `{}`                                                                                       | Sessão anônima automática; quotas do Auth |
| `/refresh` | `{ "refresh_token": "..." }`                                                               | Token de renovação                        |
| `/read`    | `{ "resource": "players", "limit": 200, "offset": 0 }`                                     | Bearer de usuário                         |
| `/mutate`  | `{ "operation": "create_player", "request_id": "UUID", "input": { "name": "Nome" } }`      | Bearer de usuário                         |
| `/import`  | `{ "request_id": "UUID", "input": { "source_id": "UUID", "players": [], "matches": [] } }` | Bearer de usuário                         |

Leituras: players, matches, archived_matches e ranking. Cada página traz uma
revision. O cliente busca todas as páginas e só substitui o cache depois de
obter uma revisão consistente em todos os recursos; até três tentativas se a
base mudar durante a leitura. Erro nunca é convertido em lista vazia.

Mutações: create_player, rename_player, archive_player, restore_player,
create_match, set_match_winner, archive_match e restore_match. Campos exatos,
UUIDs, versões, participantes, tamanhos, datas e valores são validados. SQL
estático com parâmetros; nomes de tabela ou comandos SQL não são entradas da API.

## Dados e concorrência

- players, matches e match_players: IDs permanentes, números gerados no banco,
  times, resultados e nomes históricos. Uma vitória vale um ponto; sem vencedor
  não pontua. Ranking usa UUID, inclusive após renomear ou remover do elenco.
- mutation_receipts: UUID global de requisição. Reenvio igual retorna a resposta
  original mesmo após recriar a sessão. Payload diferente com o mesmo UUID é
  conflito. A versão esperada impede sobrescrever edições concorrentes.
- audit_events: rastreio interno; não é retornado pela API.
- actor_limits: 60 mutações aceitas por minuto por sessão; replays não consomem
  nova gravação. Um lote de importação conta como uma mutação, sem expor um
  mecanismo público de desativar esse limite.
- import_records: deduplicação de cada chave legada por aparelho/origem.
- Escritas são serializadas para ordenar a revisão da base e garantir a coerência
  das páginas. Partida, participantes, resultado importado e recibos de um lote
  são transacionais. Conflito ou entrada inválida desfaz o lote inteiro.
- Remoção é lógica. A interface permite listar removidas e restaurar partidas;
  uma partida removida sai do ranking e a restauração repõe sua contribuição.

Papéis anon/authenticated não acessam tabelas, sequências ou schema privado.
Somente as três RPCs públicas têm EXECUTE para authenticated. O papel interno
volley_api_owner não tem login, BYPASSRLS nem CREATE nos schemas. Auxiliares
privadas não podem ser chamadas por esses papéis. O schema de Auth do provedor
não foi liberado ao papel customizado; ele usa a mesma extração de claims
verificados de auth.uid(). PostgREST verifica JWT antes de estabelecer o contexto.

O Advisor mantém três ocorrências intencionais de SECURITY DEFINER executável
por authenticated. [Critério e recomendações](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
A função administrativa rls_auto_enable continua como event trigger e não pode
ser executada pelos papéis do navegador.

## Telas, cache e envios incertos

O app carrega os dados ao abrir, voltar à aba, reconectar ou tocar em Atualizar.
Ranking, jogadores e histórico usam o servidor. Presença usa IDs e fica somente
no aparelho; sorteio em andamento, tema e fonte também são locais.

O cache é identificado pela URL da API e guarda apenas a última consulta completa,
com horário visível. Offline permite consulta, bloqueando cadastros/resultados,
remoções e restaurações. Não há fila de novas gravações offline.

Antes de uma mutação, o cliente persiste seu UUID e payload. Se a resposta se
perder, conserva o envio pendente inclusive após recarregar, bloqueia novos envios
incompatíveis e oferece Repetir envio pendente. Não reenvia automaticamente ao
reconectar. Recibos globais evitam duplicação mesmo se a sessão precisar ser
recriada. Uma confirmação de gravação não é invalidada por uma falha posterior
na consulta; a interface distingue atualização pendente de novos envios.

Produção sem URL configurada mostra indisponibilidade, sem voltar silenciosamente
a gravações locais. `LocalApp` fica somente como prévia legada para desenvolvimento
sem VITE_VOLLEY_API_URL e para os testes unitários já existentes. Para desenvolver
a integração, configure essa variável com uma API própria de desenvolvimento e
uma origem explicitamente permitida; não libere origens arbitrárias em produção.

## Importação

O `volley-v1` antigo não é sobrescrito ou apagado. Uma prévia mostra jogadores,
partidas válidas, erros e possíveis duplicatas, com download da cópia original.
Itens inválidos ficam fora do envio com aviso, sem destruir a fonte original.

Possíveis duplicatas consideram data e os dois times, inclusive invertidos e
partidas removidas. Começam desmarcadas; uma repetição legítima pode ser selecionada
explicitamente. O banco também verifica uma duplicata surgida em outro aparelho
entre a prévia e o envio e exige revisão. Não tenta identificar pessoas além da
regra existente de nomes únicos normalizados; jogadores homônimos exigem revisão.

A origem recebe UUID persistente e cada partida mantém uma chave legada estável.
O número exibido após importar é o número novo do banco. Nomes de jogadores são
reaproveitados sem distinção de caixa. A seleção é dividida em lotes menores que
24 KiB, preservando todas as partidas escolhidas. Cada lote é atômico; se houver
falha depois de um lote concluído, a repetição retoma com deduplicação por origem.
A cópia completa continua disponível no aparelho mesmo após a conclusão.

## Limites e verificação antes do merge

O acesso compartilhado continua aberto: qualquer visitante com sessão pode
alterar os dados pelas operações aprovadas. Não há propriedade por usuário;
created_by é auditoria. CORS não distingue humanos de robôs. Quotas reduzem
abuso, mas não eliminam sessões múltiplas ou indisponibilidade por esgotamento.

Auth pode aplicar limites ao IP de saída da Edge Function e agrupar visitantes.
Não encaminhamos IP fornecido pelo navegador nem adicionamos chaves administrativas
para mudar esse comportamento. Validar criação, renovação, quotas e acesso por
dois clientes no Supabase real depois de habilitar Anonymous Sign-Ins.

A função responde sem expor internals se esse acesso for desabilitado. Os testes de banco com contexto JWT simulado passaram no projeto
real, incluindo importação, rejeição de duplicatas, revisão e permissões. Todos
os registros de teste foram desfeitos; contagens finais de jogadores, partidas,
participantes, recibos, importações e auditoria foram zero. Sequências podem ter
intervalos após rollback.

Os testes de navegador usam o build de produção, o handler real da API e as
migrations reais em PostgreSQL WASM (PGlite); somente o serviço externo de Auth é
simulado. Não acessam o banco real nem usam suas chaves. Verificam dois contextos,
conflitos, restauração, cache offline, falhas e resposta perdida após commit.
Isso não certifica GoTrue, limites remotos ou concorrência entre conexões reais.

Audit de dependências em 2026-11-09: zero alertas em `npm audit --omit=dev`.
O audit completo ainda informa 22 alertas anteriores na toolchain, incluindo
high/critical em Vite/Vitest/tinypool. Não foram introduzidos por esta integração;
a atualização das ferramentas continua pendente e não há certificação de risco zero.

## Validação

`npm run test:backend`: contratos da API, cliente, migração, SQL e papéis.
`npm run test:coverage`: regras e interações existentes.
`npm run test:e2e`: fluxos do app de produção em 393px, 320px e desktop.
`npm run typecheck`: frontend, backend e suporte de testes.
`tests/remote-checks.sql`: verificação manual no projeto vazio antes da ativação,
com rollback; não executar automaticamente em produção.

Referências: [chaves](https://supabase.com/docs/guides/getting-started/api-keys),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[acesso anônimo](https://supabase.com/docs/guides/auth/auth-anonymous),
[quotas](https://supabase.com/docs/guides/auth/rate-limits),
[erros de Auth](https://supabase.com/docs/guides/auth/debugging/error-codes).

## Verificação HTTP no Supabase real

Em 2026-11-10 UTC, após a habilitação pelo usuário, o cliente real em src/shared/client.ts
foi executado contra a Edge Function publicada, sem chaves de projeto no cliente.

- Requisição sem sessão recusada com 401; sessões anônimas independentes confirmadas.
- Jogadores criados por um cliente apareceram no outro; nome com apóstrofo permaneceu dado.
- Resposta de criação perdida de propósito, seguida de nova sessão e repetição do
  mesmo UUID: somente uma partida foi criada.
- Edições HTTP simultâneas com a mesma versão: uma aceita e outra com 409, em 666 ms
  na rodada observada. O ranking refletiu o resultado confirmado.
- Remoção e restauração apareceram no outro cliente; renovação preservou a identidade.
- Importação real apareceu no outro cliente, reenvio da origem foi deduplicado e
  possível duplicata de outro aparelho exigiu revisão.
- Dois jogadores, duas partidas e sete contas anônimas temporárias, além dos seus
  recibos, auditoria e vínculos, foram removidos por IDs registrados pelo teste,
  com guardas de origem/nome/data. Contagens finais desses registros: zero.
  Nenhum registro alheio ao teste foi removido. Tokens ficaram somente em memória.

A validação encontrou que conflitos de negócio com SQLSTATE 40001 podiam resultar
em espera/502 no caminho HTTP real. A sexta migration usa PT409 para devolver
um conflito de aplicação diretamente, mantendo 40001 para falhas transacionais
reais. Teste de regressão exige esse código; o handler aceita ambos por compatibilidade.
[Erros HTTP definidos por função no PostgREST](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes).

O Advisor continua apontando as três RPCs autenticadas intencionalmente privilegiadas
e informa proteção contra senhas vazadas desabilitada. O Volley usa sessões anônimas,
sem senha; nenhuma política dos demais provedores foi modificada.
[Proteção de senhas no Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
