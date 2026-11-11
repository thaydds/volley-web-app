# Volley — contrato de dados, API e operações offline

O novo ciclo de partidas está implementado nesta branch, com a migration aditiva `20261110163836_match_lifecycle.sql`. **Aplicada em produção em10/11/2026, junto da Edge Function versão7, após autorização explícita da usuária.** As seis migrations anteriores pertencem à integração v1. A evidência remota da v1 no fim deste arquivo não certifica a nova versão.

## Arquitetura e credenciais

Navegador → Edge Function `volley-api` → RPCs fixas → tabelas privadas PostgreSQL com RLS.

O frontend recebe somente a URL pública da API e tokens temporários de sessão anônima. Nenhuma chave de projeto, `service_role`, configuração administrativa ou palavra-chave de desativação está no build. O servidor usa as variáveis de runtime `SUPABASE_URL` e `SUPABASE_ANON_KEY`; para dados, encaminha o token do visitante validado online por `/auth/v1/user`, sem elevar seu papel. Bootstrap/refresh usam Auth no servidor. Não há CAPTCHA ou tela de login.

Access/refresh tokens são credenciais da sessão e ficam separados dos dados/backup. Proteção contra XSS continua necessária; o app renderiza nomes como texto. Tokens, palavras e respostas internas não são registrados em logs ou URLs. CORS restringe a origem, mas não substitui autorização nem impede clientes externos.

## Estrutura: nove tabelas privadas

| Tabela                   | Conteúdo e regras                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `players`                | UUID, nome, versão, datas e `deleted_at`. Desativação lógica; reativação conserva o UUID. Novos nomes normalizados não colidem com ativos/inativos. Duplicatas históricas não são mescladas pela migration. |
| `matches`                | UUID, número gerado pelo banco, data, versão, `status`, dois placares inteiros opcionais, vencedor, `serving_side`, marcador `legacy_result` e arquivo legado. Resultado final é imutável.                  |
| `match_players`          | Vínculos UUID, lado, posição e nome histórico. Composição congelada depois de iniciar.                                                                                                                      |
| `mutation_receipts`      | UUID global da operação, entrada e resposta aceita. Mesmo UUID/entrada retorna a confirmação anterior; entrada diferente é conflito. Não contém palavra-chave.                                              |
| `audit_events`           | Operação, ator, entidade, antes/depois e revisão consistente. Sem palavra-chave.                                                                                                                            |
| `actor_limits`           | Limite existente de 60 mutações aceitas/minuto/sessão. Replays aceitos não contam como nova escrita.                                                                                                        |
| `import_records`         | Deduplicação dos registros legados por origem/chave.                                                                                                                                                        |
| `deactivation_policy`    | Configuração administrativa privada: salt e digest SHA256 da frase de alta entropia. Nunca exposta por RPC. Sem valor padrão.                                                                               |
| `authorization_attempts` | Tentativas de autorização, inclusive incorretas: até 5 por sessão e 30 globais por janela de minuto. Não guarda a palavra.                                                                                  |

`anon`/`authenticated` não têm acesso direto ao schema/tabelas/sequências privadas. O papel `volley_api_owner` é interno, sem login, BYPASSRLS ou CREATE persistente. Funções públicas expostas são intencionalmente `SECURITY DEFINER`, com `search_path` vazio e concessões explícitas; auxiliares e configuração administrativa não podem ser chamadas pelo visitante. Consultas são SQL fixo com parâmetros, nunca SQL construído de nomes ou entradas do cliente.

## Contrato HTTP

POST + JSON, `Cache-Control: no-store`, origem permitida explícita e corpo efetivamente lido limitado a 32 KiB. `verify_jwt=false` na Edge é intencional: cada rota protegida valida o Bearer online, e PostgREST valida o JWT antes da RPC. Erros não revelam SQL, chave ou metadados internos.

| Rota               | Entrada                                              | Resultado                                                                                                                                     |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/session`         | `{}`                                                 | Sessão anônima automática, sujeita às quotas Auth.                                                                                            |
| `/refresh`         | `{refresh_token}`                                    | Renovação da sessão.                                                                                                                          |
| `/state`           | `{resource,limit,offset}`                            | `players` (ativos e desativados), `matches`, `archived_matches`; páginas até 200, com revisão.                                                |
| `/command`         | `{request_id,operation,input}`                       | Uma operação do ciclo abaixo, com entidade/versão/revisão confirmadas.                                                                        |
| `/deactivate`      | `{request_id,input:{id,version},authorization_word}` | Desativação online autorizada; palavra transitória, separada do payload persistido.                                                           |
| `/recover`         | `{request_id,operation,input}`                       | Somente prova de recibo já aceito (`found`); não executa uma intenção antiga desconhecida.                                                    |
| `/import`          | `{request_id,input:{source_id,players,matches}}`     | Importação histórica online, com prévia, transação e deduplicação.                                                                            |
| `/read`, `/mutate` | Contratos v1 restritos                               | Compatibilidade de leitura/recibos. Novas operações v1 de arquivo/resultado são recusadas com HTTP 426, sem eliminar envios incertos antigos. |

Operações `/command` (somente estes campos):

| Operação            | `input`                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `create_player`     | `{id,name}`: UUID gerado uma vez no aparelho, nome até 30 caracteres.                                                             |
| `reactivate_player` | `{id,version}`: decisão explícita, mesmo histórico.                                                                               |
| `start_match`       | `{id,played_on,serving_side,participants:[{player_id,side}]}`: UUID persistente, lados A/B não vazios, sem participante repetido. |
| `save_score`        | `{id,version,score_a,score_b}`: dois inteiros entre 0 e 2147483647. Empate pode ser salvo.                                        |
| `finish_match`      | Mesmos campos: empate proibido, vencedor derivado pelo banco; bloqueia mudanças posteriores.                                      |

Campos extras, escolha de vencedor pelo cliente, autorização pela rota genérica e acesso a função/tabela arbitrária são rejeitados. Conflito retorna 409; palavra incorreta 403; excesso de tentativas 429; autorização ausente 503. Falhas de serviço/contrato não descartam a fila. Mesmo chamando RPC diretamente, o visitante precisa da autorização de desativação e não consegue editar/excluir uma partida finalizada.

## Persistência e sincronização

`src/lifecycle` separa tipos/projeção, transporte, IndexedDB, fila e telas. Um registro transacional por URL da API contém snapshot confirmado, fila FIFO, presença, pré-jogo, pendência segura de desativação, envios v1 antigos e lease de sincronização. A UI só confirma uma ação após commit local; falta de espaço não apaga o formulário nem finge sucesso. Dados inválidos no armazenamento geram recuperação/backup, sem reset silencioso.

Cada ação local tem UUID fixo e versão esperada capturada. O snapshot é projetado com a fila para consulta/ranking offline. Dependências seguem criar jogador → iniciar partida → finalizar (save_score só para compatibilidade). O número da partida é atribuído somente pelo banco; antes, aparece como local. Finalizada offline fica imediatamente somente leitura, com sincronização pendente.

Na abertura, mostra o cache disponível e verifica se o intervalo automático venceu. Sem cache, carrega os dados; falhas são repetidas após 5 minutos sem botão de retry. O spinner inicial tem apenas nome acessível. Reconectar/voltar à aba retoma um ciclo vencido; não antecipa o próximo envio se ainda não venceu.

O ciclo automático de 5 minutos adquire o intervalo e o lease atomicamente, captura um lote da fila, envia em ordem, persiste cada confirmação e depois busca a base. Sem fila, não há escrita: uma consulta limitada a 1 jogador informa a revisão global; se não mudou, o download do histórico é dispensado. O lease limita remetentes concorrentes, sem bloquear presença/Counter ou novos comandos locais. Falha entre commit remoto e confirmação local conserva UUID/payload; repetir recupera o recibo, mesmo com nova sessão. BroadcastChannel notifica abas; lease expira após 60 s, revalidado antes dos requests. Idempotência e versões protegem replays após suspensão/expiração; não é um lock distribuído de segurança.

Conflito interrompe a fila, mantém operações e oferece revisão com a versão atual e a intenção local, exportação e escolha explícita do servidor. Só essa confirmação descarta o comando escolhido e dependentes transitivos; alterações independentes permanecem. Não há rebase automático, sobrescrita silenciosa ou realtime. Alteração não salva nos inputs também não é substituída silenciosamente por outra aba: conserva texto e exige revisão antes de salvar.

Falha somente na consulta depois de escritas confirmadas não recria suas operações. Desativação tem confirmação validada e persistida antes de fechar o modal, sem depender de atualizar dados não relacionados. Se a resposta for incerta, conserva só envelope/UUID/versão; pede novamente a palavra para recuperar o mesmo recibo. A palavra permanece exclusivamente na memória do campo e no transporte HTTPS enquanto necessária.

## Preservação e versão anterior

A migration conserva UUIDs, números, participantes, nomes, datas e arquivo legado. Resultados anteriores com vencedor tornam-se finalizados com placares desconhecidos (`null`, UI `—`). Não inventa pontuação. Registros antigos sem vencedor ficam em andamento. Arquivados anteriores continuam consultáveis, sem novos controles de edição/exclusão/restauração.

`volley-v1`, cache e presença anteriores não são apagados. A nova base IndexedDB incorpora o cache conhecido e presença por UUID. A importação continua com prévia, duplicatas desmarcadas, seleção explícita e cópia original disponível. Recibos aceitos e origem/chave impedem reimportar o mesmo registro. Nome igual não resolve homônimos automaticamente: revise a prévia e diferencie pessoas; se um nome desativado colidir, reative explicitamente ou corrija a origem antes de importar.

Envios v1 ainda incertos são conservados em `legacyPending`. Verificar envios antigos consulta apenas recibos; não repete ações que a nova versão deixou de permitir. Intenção não confirmada requer backup e descarte explícito, seguido de recriação manual se desejado. O armazenamento original continua intacto. O backup exclui tokens de sessão e inclui dados/fila, não segredos.

## Ativação

Plano executado após autorização da usuária; evidências na seção seguinte:

1. DS: concluído pela usuária. PR #24 mergeada e components0.7.0 confirmada no npm; o app já fixa essa versão no package.json/lockfile.
2. Fazer backup do banco e ensaiar todas as migrations numa base de staging com cópia representativa do legado. Conferir contagens, permissões, históricos com/sem vencedor e arquivos anteriores. Não usar `remote-checks.sql` antigo como certificação deste ciclo.
3. Aplicar a migration aditiva e publicar o novo handler em staging. Validar Auth/renovação, dois dispositivos reais, quotas, conflitos e resposta perdida, com a mesma origem/configuração prevista para produção.
4. Definir a frase de autorização com o responsável. Usar valor aleatório de alta entropia, guardado em gerenciador seguro. Um administrador configura `private.configure_deactivation_secret(text)` por sessão TLS e parâmetro vinculado, sem literal em script versionado, URL, histórico de terminal, relatório ou chat. O visitante e a Edge não têm permissão para configurar. A configuração está ausente por padrão: desativação falha fechada; demais fluxos podem ser revisados/testados com fixtures locais.
5. Obter autorização de publicação/migração/deploy, coordenar banco → Edge → app e verificar a versão publicada. Clientes v1 antigos não podem finalizar/excluir pelo contrato anterior; solicitar atualização. Preservar backups e recibos durante a transição. Não reverter a migration removendo colunas ou dados para recuperar a UI antiga.

A autorização de produção foi dada em seguida pela usuária. A frase foi recebida por formulário seguro, validada localmente e gravada somente como salt/digestSHA256; não foi necessária senha adicional do banco. A frase bruta não foi enviada em SQL, registrada em código ou incluída nos backups.

## Validação e limites

`npm run test:backend`: SQL de todas as migrations em PGlite, grants/RLS, legado, imutabilidade, autorização/rate limit, recibos e handler. `npm run test:coverage`: regras, projeção da fila, ranking por UUID e interações. `npm run test:e2e`: build real, handler e SQL locais, Auth externo simulado; Light/Dark, 393/320/1440px, teclado, offline/reload, resposta incerta, dispositivos independentes, abas, conflitos, armazenamento e recuperação.

Esses testes não certificam GoTrue, políticas/quotas remotas, concorrência entre conexões PostgreSQL reais ou a implantação atual. A ativação foi validada no serviço real conforme registro abaixo. O acesso segue compartilhado: visitantes podem cadastrar e registrar resultados; não há propriedade por usuário. Quotas e palavra-chave reduzem abuso, mas não garantem disponibilidade contra múltiplas sessões. A ausência de CAPTCHA foi uma decisão explícita da usuária.

A toolchain tinha alertas de auditoria anteriores à mudança; não atualizamos dependências de ferramentas como parte deste fluxo. O pacote de componentes0.7.0 publicado no npm substitui o artefato de revisão; o lockfile fixa sua versão e integridade.

Referências: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [sessões anônimas](https://supabase.com/docs/guides/auth/auth-anonymous), [chaves](https://supabase.com/docs/guides/getting-started/api-keys), [limites Auth](https://supabase.com/docs/guides/auth/rate-limits).

## Evidência histórica: integração v1 no Supabase real

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

## Ativação do ciclo em produção ·10/11/2026

- Backup privado dos7 conjuntos de dados e funções, com cópia da Edge anterior; rehearsal da migration usando a cópia real preservou os4 jogadores.
- Migration remota `20261110163836_match_lifecycle` aplicada. O nome local foi alinhado ao histórico remoto para não repetir a migration em futuras execuções CLI.
- `volley-api` versão7 publicada; Auth do visitante continua validado pelo handler e pelo PostgREST. Nenhuma chave de projeto no frontend.
- Palavra de desativação recebida por formulário seguro. Validação de tamanho e cálculo do digest aconteceram localmente; somente salt/verificador foram gravados via conexão administrativa existente. Sem senha direta do banco ou palavra literal em SQL.
- HTTP real: sessão obrigatória,2 sessões independentes, criação visível no outro cliente, reenvio idempotente entre sessões, palavra incorreta recusada, desativação/replay com autorização e reativação preservando UUID passaram.
- SQL real dentro de transação com rollback: iniciar, salvar0×0, conflito de versão, empate recusado, finalizar21×18 com vencedorA, edição final recusada e trigger de imutabilidade passaram. Não foram persistidas partidas de teste; sequências podem ter intervalos após rollback.
- Um jogador temporário, seus recibos/auditoria e2 contas anônimas de teste foram removidos por IDs registrados e guardas de nome/versão/ausência de participações. Contagens finais:4 jogadores,0 partidas e4 eventos de auditoria originais. Nenhum registro de terceiro foi excluído.
- Conferido: visitante não tem acesso ao schema privado nem permissão para configurar a autorização. Os testes locais anteriores e CI continuam documentados na PR; não houve teste de carga.

A publicação do frontend segue o merge da PR11 e o workflow de GitHub Pages, verificados separadamente. A frase é necessária apenas para desativação; demais operações seguem compartilhadas. Para trocar a frase futuramente, usar entrada segura e configuração administrativa; não colocá-la no repositório, no chat ou na URL.
