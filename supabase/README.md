# Volley API — primeira entrega

Esta PR implementa banco e API. As três migrations foram aplicadas ao projeto
`xejuimptprhvrjohhqyn` com aprovação explícita. A Edge Function não foi publicada.
Não muda as telas, não importa localStorage e não publica recursos automaticamente.
A migração de dados, o cache offline e a troca
dos repositórios do frontend serão a próxima entrega.

## Arquitetura aprovada

Navegador → Edge Function `volley-api` → RPCs fechadas → tabelas privadas.

Nenhuma chave de projeto Supabase vai para o navegador. O servidor usa
`SUPABASE_ANON_KEY`, fornecida pelo runtime da Edge Function, para autenticar a
aplicação. **Não usa service_role.** O usuário recebe um access token de sessão
e um refresh token, que são credenciais pessoais temporárias e exigem proteção.
Os tokens não devem ir para URLs, logs ou relatórios de erro.

O app pode continuar no GitHub Pages. Somente a URL pública da API será
configuração do frontend; não adicionar `VITE_SUPABASE_*`.

## Banco

- `private.players`, `private.matches`, `private.match_players`: dados do jogo.
- `private.mutation_receipts`: deduplicação por sessão + UUID de requisição.
- `private.audit_events`: rastreio de alterações, sem exposição pública.
- `private.actor_limits`: limite de 60 mutações aceitas por minuto por sessão.
- Nenhum papel do navegador recebe acesso às tabelas ou sequências.
- RLS habilitado; o papel sem login `volley_api_owner` recebe somente os
  privilégios necessários para as duas funções públicas. Não é proprietário
  das tabelas nem tem BYPASSRLS. As políticas privadas permitem esse papel.
- RPCs com SQL estático, `search_path` vazio e identidade extraída dos mesmos
  claims verificados usados por `auth.uid()`. A API valida o JWT online e
  PostgREST valida o token antes de estabelecer o contexto do banco. Não
  concedemos acesso ao schema de Auth do provedor ao papel customizado.
- Idempotência: repetir a mesma requisição retorna o resultado; alterar payload
  mantendo request_id gera conflito. UUID deve ser preservado ao tentar novamente.
- Versão esperada obrigatória nas alterações. Conflito exige recarregar e revisar,
  nunca sobrescrever automaticamente.
- Partida e participantes gravados na mesma transação; numeração do banco.
- Exclusão lógica e restauração; o ranking ignora partidas arquivadas, preserva
  jogadores com histórico e usa IDs mesmo depois de renomear.
- Importação ainda não disponível; tabela `import_batches` e operação transacional
  serão adicionadas com a prévia e resolução de duplicatas na próxima entrega.

## HTTP

Todos os endpoints usam POST e JSON. Respostas nunca incluem chave de projeto,
metadados de usuário, mensagem SQL ou detalhes internos de erro.

| Endpoint   | Corpo                                                                                 | Sessão                              |
| ---------- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| `/session` | `{}`                                                                                  | Cria sessão anônima automaticamente |
| `/refresh` | `{ "refresh_token": "..." }`                                                          | Renova sessão existente             |
| `/read`    | `{ "resource": "players", "limit": 100, "offset": 0 }`                                | Bearer access token                 |
| `/mutate`  | `{ "operation": "create_player", "request_id": "UUID", "input": { "name": "Nome" } }` | Bearer access token                 |

Leituras: `players`, `matches`, `ranking`. Paginação obrigatória, 1–200 registros.
O cliente deve buscar todas as páginas necessárias. Ranking calculado sobre todas
as partidas ativas no servidor antes da paginação.

Mutações: `create_player`, `rename_player`, `archive_player`, `restore_player`,
`create_match`, `set_match_winner`, `archive_match`, `restore_match`.
Ver os testes para os corpos tipados. Datas ISO `YYYY-MM-DD`; lado A/B; vencedor
A/B/null. A criação de partida começa sem vencedor, como no fluxo atual.

Erros: 400 entrada inválida, 401 sessão inválida, 403 origem, 404 ausente,
409 conflito, 413 corpo acima de 32 KiB, 429 limite, 502 falha de serviço,
503 configuração ausente. Tentar novamente não pode gerar outro request_id.

## Configuração antes de qualquer publicação

1. Revisar o histórico das três migrations já aplicadas no projeto Supabase.
   PGlite valida SQL e papéis localmente, mas não reproduz GoTrue, PostgREST,
   os privilégios específicos da plataforma ou concorrência entre conexões.
   Não aplicar `db reset` a banco remoto. A migration cria um papel dedicado;
   As diferenças de grants do ambiente gerenciado foram corrigidas nas migrations
   subsequentes e verificadas no projeto real. Os timestamps locais correspondem
   ao histórico remoto para evitar aplicação duplicada pela CLI.
2. Ativar sessões anônimas no Supabase Auth. Configurar limites de Auth e revisar
   as recomendações de proteção contra abuso do Supabase.
3. Não há CAPTCHA, widget, site key ou secret Turnstile. Confirmar que o Auth não
   exige desafio e revisar as quotas de criação anônima e renovação antes de ativar.
   A API preserva HTTP 429 do Auth, sem repetir automaticamente a requisição.
4. Configurar `VOLLEY_ALLOWED_ORIGIN=https://thaydds.github.io` no servidor.
   SUPABASE_URL e SUPABASE_ANON_KEY vêm do runtime Supabase; nenhuma chave de
   projeto vai para o frontend.
5. Implantar a função com `verify_jwt=false`: o próprio handler valida tokens
   online por `/auth/v1/user` em todas as leituras/mutações; somente criação e
   renovação de sessão têm contratos específicos sem esse access token.
6. Validar criação/renovação automática de sessão, grants, Data API, respostas
   sem secrets, quotas do Auth e dois clientes concorrentes. Reutilizar a sessão
   existente ao abrir o app e renová-la quando necessário, evitando criar um
   usuário novo a cada navegação. Revisar o Security Advisor.
7. Só depois conectar frontend, importação, cache e estados de falha; validar
   novamente antes de ativar no app publicado.

## Limites de segurança conhecidos

O requisito de escrita aberta permite que qualquer visitante com sessão altere
dados compartilhados, inclusive fora da interface. Não há restrição por dono;
created_by é auditoria, não autorização de propriedade. Se isso for inaceitável,
é necessário mudar a regra de acesso para membros/organizadores.

CORS limita navegadores, não bots. Por decisão do usuário, o fluxo não usa CAPTCHA.
Criação e renovação dependem dos limites do Supabase Auth; o banco continua
limitando mutações por sessão. Limites não distinguem humanos de robôs e não
protegem integralmente contra sessões múltiplas, leitura abusiva ou ataques
que consomem a quota para impedir acessos legítimos.

Os limites por IP do Auth podem considerar o IP de saída da Edge Function e
agrupar visitantes diferentes. Não encaminhamos IP fornecido pelo cliente e não
acrescentamos chaves administrativas para alterar isso. Antes de ativar, validar
esse comportamento, capacidade e monitoramento no ambiente real. A configuração
remota das quotas não foi alterada nem certificada nesta revisão.
A chave de projeto não é usada como mecanismo de autorização nem tratada como
segredo, embora permaneça no servidor por escolha do usuário.

Não existe promessa de risco zero. Os avisos iniciais sobre `rls_auto_enable`
foram resolvidos pela revogação de EXECUTE, preservando o event trigger.
O Advisor agora informa duas ocorrências de execução de SECURITY DEFINER pelo
papel authenticated nas RPCs: acesso intencional, limitado ao contrato descrito,
que deve ser revisado, não silenciado automaticamente.
[Critério do Advisor e recomendações](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Verificação no Supabase gerenciado

Em 2026-11-09, após autorização para aplicar e testar a estrutura:

- Seis tabelas privadas com RLS, sem acesso de schema para papéis do navegador.
- Papel de execução sem login, BYPASSRLS ou CREATE no schema público.
- EXECUTE negado a anon e permitido a authenticated somente nas duas RPCs;
  execução da função administrativa negada aos dois papéis.
- Asserções de banco em `tests/remote-checks.sql` passaram: sessão ausente,
  acesso direto, nomes com SQL, reenvio, versão, ranking, exclusão e restauração.
- Registros de teste foram desfeitos com ROLLBACK; contagens finais de jogadores,
  partidas, participantes, auditoria e receipts foram zero. Sequências de
  identidade podem apresentar intervalos, como é normal após rollback.
- Testes do banco simulam o contexto JWT verificado; não substituem os testes
  HTTP reais de GoTrue/PostgREST/Edge ou de clientes concorrentes.

Audit de dependências em 2026-11-09: `npm audit --omit=dev` retornou zero alertas.
Audit completo retornou 22 (3 low, 15 moderate, 1 high, 3 critical), na cadeia
de ferramentas já existente, incluindo Vite/Vitest/tinypool. PGlite não aparece
nos alertas. Esses problemas exigem atualização separada da toolchain; esta PR
não certifica o repositório completo nem publica uma API em produção.

## Validação local e CI

`npm run test:backend` executa PostgreSQL em WASM (PGlite) com a migration real,
papéis e RLS, além dos contratos HTTP com dependências externas simuladas.
`npm run typecheck` inclui backend; o CI executa a nova suíte junto da atual.
Nenhum teste precisa de chave, internet ou banco remoto.
O script SQL de verificação remota é manual e separado da suíte automática.

Referências:

- [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Sessões anônimas](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Limites de Auth](https://supabase.com/docs/guides/auth/rate-limits)
- [Produção](https://supabase.com/docs/guides/deployment/going-into-prod)
