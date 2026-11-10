# Histórico compartilhado — modelo e contrato de segurança

Status: arquitetura de API no servidor escolhida pelo usuário. Implementação em
revisão na PR #10; migrations aplicadas e verificadas no projeto Supabase após
aprovação explícita. Edge Function e integração das telas ainda não publicadas.
Base: origin/main e6420b5. Projeto Supabase: xejuimptprhvrjohhqyn.

## Escopo acordado

Uma base compartilhada de jogadores e partidas, acessível em diferentes dispositivos.
Todos os visitantes podem consultar, criar e alterar pelos fluxos permitidos do app.
Sem internet: somente consulta ao último carregamento bem-sucedido.
Presença, sorteio em andamento, tema e fonte continuam locais.
O ranking mantém a regra atual: uma vitória = um ponto; sem vencedor = sem pontos.

## Decisão sobre chaves

Alternativa inicialmente apresentada: navegador usa URL do projeto e chave `sb_publishable_...`.
Essa chave é pública por definição, identificando o projeto sem conceder administração.
Não será tratada como senha nem apresentada como segredo protegido por `.env`:
variáveis VITE são incorporadas no build e podem ser lidas por qualquer visitante.
Senha do banco, connection string, `sb_secret_...` e `service_role` nunca entram no
frontend, repositório, build, logs ou exemplos de configuração.

Decisão do usuário: **API sem chave de projeto no navegador**. Usar Edge Function
no Supabase, com chave de aplicação somente no runtime do servidor e sessão
anônima validada online em cada leitura/gravação. O navegador recebe access token
e refresh token de sessão, que continuam sendo credenciais sensíveis do usuário.
O app permanece no GitHub Pages. Nenhuma service_role é usada nem mesmo pela API.
Esconder uma chave atrás de API pública não elimina abuso nem substitui autorização.
Decisão posterior do usuário: não usar CAPTCHA na interface. A exigência de
Turnstile foi removida da API e dos testes; a criação da sessão recebe apenas `{}`.
Criação/renovação preservam limites do Supabase Auth e mutações continuam limitadas
por sessão no banco. Nenhum secret adicional é necessário. Ver supabase/README.md.

## Modelo

Tabelas em schema `private`, fora da Data API. Todas com RLS ativado explicitamente.
Papéis `anon` e `authenticated` não recebem acesso direto às tabelas ou sequências.

| Tabela | Campos principais | Regras |
| --- | --- | --- |
| players | id UUID, name, created_at, updated_at, deleted_at, version, created_by | Nome aparado, 1–30 caracteres; unicidade de nome ativo ignorando caixa; versão positiva |
| matches | id UUID, number bigint identity, played_on date, winner A/B/null, created_at, updated_at, deleted_at, version, created_by | Numeração exclusiva gerada pelo banco; data válida; exclusão recuperável |
| match_players | match_id, player_id, side A/B, position, name_snapshot | Um jogador uma vez por partida; posição exclusiva por time; nomes históricos preservados |
| mutation_receipts | actor_id, request_id UUID, operation, input_hash, response, created_at | Chave composta por ator + request_id; reenvio igual retorna resultado original; payload diferente gera conflito |
| audit_events | id, actor_id, operation, entity_id, occurred_at, before_data, after_data | Registro de mudanças produzido no servidor; sem edição ou leitura pública |
| import_batches | id UUID, actor_id, source_id UUID, source_digest, created_at, summary | Evita repetir lote do aparelho; duplicatas entre aparelhos exigem revisão |

`match_players.player_id` referencia jogadores preservados por exclusão lógica.
O nome histórico não muda ao renomear o jogador. O ranking agrega por UUID,
com nome atual na listagem e nome histórico no detalhe da partida.
Jogador removido sai do elenco selecionável; resultados antigos permanecem no ranking.
Partida removida deixa de pontuar; restauração repõe a pontuação.
Datas são armazenadas como `date` e exibidas em DD/MM/AAAA; timestamps usam UTC.
Limite proposto de 100 participantes por partida e 500 partidas por lote de importação;
importações maiores devem ser divididas sem perder a identificação do lote.

## API permitida

Funções RPC são endpoints fixos; nenhuma recebe SQL, nomes de tabela ou filtros SQL.
Todas verificam sessão Supabase válida por `auth.uid()`, inclusive leitura.
Sessão anônima automática não exige tela de login, mas usa o papel `authenticated`.

| Operação | Contrato |
| --- | --- |
| list_players / list_matches / get_ranking | Paginação limitada; somente dados necessários; sem actor_id ou dados de auditoria |
| create_player / rename_player | Nome validado no banco; conflito de nome tratado explicitamente |
| archive_player / restore_player | Sem exclusão física; alteração condicionada à versão |
| create_match | UUIDs e times; transação única para partida e participantes; nome histórico obtido no banco |
| set_match_winner | Apenas A, B ou null; exige versão esperada |
| archive_match / restore_match | Exclusão recuperável; exige versão esperada |
| import_history | Validação integral e transação; prévia no app; sem sobrescrever automaticamente dados existentes |

Cada mutação recebe request_id; ator, numeração, auditoria e timestamps são
definidos pelo servidor. Lock e comparação de versão detectam alterações concorrentes.
Resultados de consultas paginadas não podem ser apresentados como histórico completo
até todas as páginas necessárias terem sido carregadas. Ranking é calculado sobre
todas as partidas ativas no servidor, não só sobre a página exibida no histórico.

## Controles obrigatórios para implementação

- SQL estático com parâmetros tipados; sem concatenação ou execução de SQL recebido.
- Constraints no banco, além de validação no frontend; impedir times vazios,
  jogadores repetidos, jogadores inexistentes, lados inválidos e payloads excessivos.
- Funções com `SECURITY DEFINER` somente quando indispensáveis para o contrato
  fechado; `search_path = ''`, objetos qualificados e proprietário com menor
  privilégio necessário. Revogar EXECUTE de PUBLIC/anon; conceder somente endpoints
  aprovados a authenticated. Funções auxiliares ficam em private.
- RLS sem políticas amplas de escrita direta; testes de grants, funções e tabelas.
  Funções com privilégios elevados precisam fazer sua própria autorização, pois
  RLS pode ser ignorado pelo proprietário. RLS isolado não basta nesse desenho.
- Todos os visitantes com sessão podem executar as operações compartilhadas:
  created_by é auditoria, não uma falsa restrição de propriedade.
- Limitar operações por sessão e tamanho das requisições; revisar limites do
  Supabase Auth para criação/renovação de sessões, sem CAPTCHA. Preservar HTTP 429
  e reutilizar sessões existentes. Limites não distinguem humanos de robôs;
  múltiplas sessões continuam sendo um risco. O proxy pode agrupar visitantes
  pelo IP de saída; não confiar em cabeçalhos de IP enviados pelo navegador.
- O modelo aberto continua permitindo alterações indesejadas pelos endpoints
  autorizados. Se isso for inaceitável, será necessário restringir quem edita.
- Renderizar nomes como texto React; sem HTML injetado. Não usar nomes como
  propriedades de objetos comuns no ranking; usar Map ou estrutura sem protótipo.
- Cache contém somente dados públicos do app, nunca credenciais administrativas;
  não confundir falha de rede com lista vazia. Não destruir o localStorage antigo.
- Não ativar integração no deploy antes de validar políticas, proteção contra abuso,
  importação, cache, erros e fluxo em dois contextos de navegador independentes.

## Achado atual do Supabase

Não há tabelas em public. Security Advisor emitiu dois avisos de EXECUTE concedido
implicitamente a anon/authenticated em `public.rls_auto_enable()`.
A definição consultada retorna `event_trigger` e tem search_path pg_catalog.
Isso é um achado de permissões a endurecer, não comprovação de exploração pela API.
Proposta: revogar EXECUTE de PUBLIC, anon e authenticated preservando o event trigger
administrativo; conferir novamente o Advisor e a criação de tabelas em teste.
Não remover a função nem desativar a ativação automática de RLS.

## Verificação antes de publicar

1. Aplicar migrations em banco de teste; verificar RLS, grants e schema exposto.
2. Sem sessão: negar endpoints e tabelas; com sessão: permitir somente contratos
   públicos; negar auditoria, receipts, import_batches e acesso direto às tabelas.
3. Testar strings com aspas, comandos SQL, HTML e chaves como __proto__ como dados;
   garantir que não executem, não mudem o esquema e não quebrem ranking/renderização.
4. Testar tentativas de forjar ator/numeração, tamanhos e datas inválidos,
   duplicatas, times vazios e rollback integral da criação/importação inválida.
5. Testar reenvio concorrente, mesma chave com payload diferente, versões
   divergentes, numeração concorrente, arquivamento e restauração.
6. Ranking por UUID, nomes históricos, paginação e importação repetida.
7. Abrir em dois dispositivos/contextos, atualizar ao retornar ao app, falhas de
   conexão, cache offline somente leitura e recuperação sem perder histórico local.
8. Tipos, lint, testes, build, scan do bundle para credenciais administrativas e
   nova revisão do Advisor. Documentar qualquer limitação; não prometer risco zero.

## Fontes

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/deployment/going-into-prod
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Próximo checkpoint

O usuário selecionou "Quero API sem chave no navegador" no checkpoint de arquitetura.
A primeira entrega implementa banco/API e testes em supabase/, sem integração do
frontend ou importação. O usuário aprovou "Aplicar e validar o banco". As três
migrations foram aplicadas, permissões verificadas e asserções de banco passaram
com rollback dos registros de teste. Ver supabase/README.md para evidências,
correções de grants no ambiente gerenciado e os dois avisos intencionais do Advisor.
Deploy e testes HTTP da API, revisão das quotas de Auth e integração do frontend continuam pendentes.

## Ampliação aprovada na mesma PR

O usuário pediu "faça tudo nesse MR já". A PR #10 agora inclui a integração das
telas, sessões automáticas, cache de consulta offline, importação com prévia,
restauração e testes entre dois navegadores. Cinco migrations foram aplicadas;
Edge Function publicada. Source IDs e recibos globais evitam repetir uma importação
ou um envio mesmo após trocar a sessão; conflitos não sobrescrevem o resultado.

O histórico `volley-v1` permanece intacto. O backend também protege contra uma
possível duplicata criada por outro dispositivo depois da prévia. A decisão de
importar um jogo semelhante é explícita, não uma heurística de exclusão silenciosa.

Validação real do endpoint: `anonymous_sign_in_disabled`. O acesso assistido ao
painel foi cancelado; não foi tentado contornar essa autenticação. É necessário
habilitar Anonymous Sign-Ins e validar duas sessões e quotas reais antes de ativar.
Os testes de navegador usam o handler e migrations reais, com Auth externo simulado.
Supabase/README.md registra o contrato final; o desenho anterior acima é histórico.

## Validação real após habilitação de Auth

O usuário ativou Anonymous Sign-Ins e confirmou a conclusão. Sessões, renovação,
compartilhamento entre clientes, resposta perdida seguida de nova sessão, ranking,
remoção/restauração e importação foram testados na API real. Um conflito de edição
revelou espera indevida no caminho HTTP; a sexta migration usa PT409 para conflitos
de negócio. A repetição do teste obteve uma gravação aceita e outra recusada com
409 em 666 ms. Todos os registros e perfis de teste foram removidos por IDs próprios.
A autenticação não está mais bloqueada. Não houve merge nem deploy do frontend.
