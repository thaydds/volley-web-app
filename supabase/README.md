# Volley API — primeira entrega

Esta PR prepara banco e API. Não muda as telas, não importa localStorage e não
publica recursos automaticamente. A migração de dados, o cache offline e a troca
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
- RPCs com SQL estático, `search_path` vazio e autorização por `auth.uid()`.
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

| Endpoint   | Corpo                                                                                 | Sessão                           |
| ---------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| `/session` | `{ "captcha_token": "..." }`                                                          | Cria sessão anônima após CAPTCHA |
| `/refresh` | `{ "refresh_token": "..." }`                                                          | Renova sessão existente          |
| `/read`    | `{ "resource": "players", "limit": 100, "offset": 0 }`                                | Bearer access token              |
| `/mutate`  | `{ "operation": "create_player", "request_id": "UUID", "input": { "name": "Nome" } }` | Bearer access token              |

Leituras: `players`, `matches`, `ranking`. Paginação obrigatória, 1–200 registros.
O cliente deve buscar todas as páginas necessárias. Ranking calculado sobre todas
as partidas ativas no servidor antes da paginação.

Mutações: `create_player`, `rename_player`, `archive_player`, `restore_player`,
`create_match`, `set_match_winner`, `archive_match`, `restore_match`.
Ver os testes para os corpos tipados. Datas ISO `YYYY-MM-DD`; lado A/B; vencedor
A/B/null. A criação de partida começa sem vencedor, como no fluxo atual.

Erros: 400 entrada inválida, 401 sessão inválida, 403 origem/CAPTCHA, 404 ausente,
409 conflito, 413 corpo acima de 32 KiB, 429 limite, 502 falha de serviço,
503 configuração ausente. Tentar novamente não pode gerar outro request_id.

## Configuração antes de qualquer publicação

1. Revisar e aplicar a migration em ambiente Supabase de teste usando a CLI.
   PGlite valida SQL e papéis localmente, mas não reproduz GoTrue, PostgREST,
   os privilégios específicos da plataforma ou concorrência entre conexões.
   Não aplicar `db reset` a banco remoto. A migration cria um papel dedicado;
   confirmar as permissões de criação/troca de owner no ambiente de teste.
2. Ativar sessões anônimas no Supabase Auth. Configurar limites de Auth e revisar
   as recomendações de proteção contra abuso do Supabase.
3. Configurar Cloudflare Turnstile para o hostname do app. O widget deve usar a
   ação `volley-session`. A site key é pública e não é uma chave de projeto
   Supabase. O secret permanece exclusivamente no servidor.
4. Configurar secrets da Edge Function via ferramenta segura:
   `VOLLEY_ALLOWED_ORIGIN=https://thaydds.github.io` e `VOLLEY_TURNSTILE_SECRET`.
   Não salvar valores reais em arquivos versionados ou comandos registrados.
   SUPABASE_URL e SUPABASE_ANON_KEY vêm do runtime Supabase.
5. Implantar a função com `verify_jwt=false`: o próprio handler valida tokens
   online por `/auth/v1/user` em todas as leituras/mutações; somente criação e
   renovação de sessão têm contratos específicos sem esse access token.
   A criação falha fechada sem o secret do CAPTCHA.
6. Validar reais CAPTCHA, criação/renovação de sessão, grants, Data API, respostas
   sem secrets e dois clientes concorrentes. Revisar o Security Advisor.
7. Só depois conectar frontend, importação, cache e estados de falha; validar
   novamente antes de ativar no app publicado.

## Limites de segurança conhecidos

O requisito de escrita aberta permite que qualquer visitante com sessão altere
dados compartilhados, inclusive fora da interface. Não há restrição por dono;
created_by é auditoria, não autorização de propriedade. Se isso for inaceitável,
é necessário mudar a regra de acesso para membros/organizadores.

CORS limita navegadores, não bots. CAPTCHA protege a criação pelo gateway;
limite por sessão não protege de múltiplas sessões, ataques distribuídos ou
cotas de leitura. Antes de ativar, revisar também limites e monitoramento do
provedor. A chave pública de projeto não é usada como mecanismo de autorização
nem deve ser tratada como segredo, mesmo mantida no servidor por escolha do usuário.

Não existe promessa de risco zero. Os dois avisos atuais do Advisor sobre
`rls_auto_enable` são tratados pela revogação explícita de EXECUTE, preservando
o event trigger. SECURITY DEFINER intencional nas RPCs deve ser revisado, não
silenciado automaticamente no Advisor.

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

Referências:

- [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Sessões anônimas](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Produção](https://supabase.com/docs/guides/deployment/going-into-prod)
