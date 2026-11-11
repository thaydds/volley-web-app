# Versões e atualizações do Volley App

## Identidade

A versão do app é independente de `@beachsports/components` e `@beachsports/tokens`. `package.json` e `package-lock.json` guardam a versão SemVer do app; o rodapé mostra somente `vX.Y.Z`. O título do elemento mantém o identificador Git do build para diagnóstico, sem expor o sufixo `+hash.dirty` na interface cotidiana.

A primeira versão estruturada será **0.1.0**. A versão antiga `0.0.0+commit` identificava builds, sem changelog, tags de release nem incremento de produto. Não foi inventado um histórico de releases anteriores. O manifest de releases começa vazio e o bootstrap aponta para o commit anterior à adoção deste fluxo.

Regras dos commits/PRs:

- `fix:` e `perf:`: patch, por exemplo `0.1.0 → 0.1.1`.
- `feat:`: minor, por exemplo `0.1.0 → 0.2.0`.
- Breaking change: exige indicação `!`/`BREAKING CHANGE` e revisão; durante 0.x incrementa minor, como o DS. A estabilização em 1.0 é uma decisão explícita de release.
- `docs:`, `test:`, `chore:` e alterações equivalentes não publicam uma release sozinhas.

## Fluxo de publicação

1. O merge de uma PR de implementação executa o CI em `main`, sem publicar o app imediatamente.
2. Após CI aprovado no commit atual de `main`, Release Please abre/atualiza a PR de release, com a versão, lockfile, manifest e `CHANGELOG.md`.
3. Essa PR também recebe CI explícito por `workflow_dispatch`: PRs criadas com `GITHUB_TOKEN` podem exigir aprovação para executar seus workflows automáticos; o dispatch garante a validação sem depender desse evento.
4. Após a pessoa revisar e mergear a PR de release, o CI de `main` roda de novo. A automação cria a tag `vX.Y.Z` e a GitHub Release e chama o deploy reutilizável no mesmo fluxo.
5. O deploy confere tag, versão, release pública estável e ancestralidade em `main`, antes de construir o PWA da tag aprovada e publicar no Pages.

`workflow_run` aceita somente push de `main` deste repositório com CI aprovado. Eventos de PR/fork, falhas e commits antigos não liberam a preparação. A automação não mergeia nem aprova PRs. Falhas de deploy podem ser retomadas por **Re-run failed jobs** na mesma execução, preservando a tag preparada.

O repositório precisa permitir que GitHub Actions crie PRs. O GitHub agrupa essa capacidade na opção **Allow GitHub Actions to create and approve pull requests**. A flag estava desabilitada na consulta de 11/11/2026; sua ativação precisa de aprovação da usuária. O workflow declara as permissões necessárias por job, preservando o padrão read-only do repositório. Não usa PAT nem publica npm.

## Atualização do app instalado/aberto

O service worker é registrado pela API nativa com `updateViaCache: none`. O app consulta novas versões a cada 5 minutos enquanto aberto e online; ao voltar à aba ou recuperar conexão, consulta se o prazo venceu. Essa checagem é separada da sincronização de dados. Falhas/offline não bloqueiam a interface e são repetidos depois.

O worker novo baixa e prepara os assets em segundo plano, mas fica aguardando. Home e Ajustes mostram **Nova versão disponível**. A confirmação explica que o reload descarta o placar provisório e textos não salvos. **Continuar no app** preserva a sessão; **Atualizar agora** ativa o worker e recarrega somente a aba que confirmou. Outra aba pode continuar com seu placar provisório até atualizar por conta própria. Ajustes também oferece verificação manual; não existe botão manual de sincronização de dados.

Fila e resultados salvos no IndexedDB não são apagados pela atualização. Caches de arquivos do PWA e dados locais do usuário têm funções separadas. App fechado não executa o timer; a detecção depende de conexão e do ciclo do navegador, sem garantia de atualização instantânea. Após a primeira migração do bundle antigo com `autoUpdate`, pode ser necessário fechar todas as abas/instâncias e abrir novamente para assumir o novo controle de atualização.

O preview de desenvolvimento não registra o worker. O teste `npm run test:pwa` constrói duas versões em uma pasta temporária própria, serve ambas sequencialmente, verifica a troca real A→B, duas abas, consentimento, fila persistida e uso offline, e limpa o diretório ao encerrar. Não envia dados ao Supabase de produção.

Fontes: [Release Please](https://github.com/googleapis/release-please-action), [checagem periódica de SW](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates), [aplicação de atualização com aviso](https://vite-pwa-org.netlify.app/guide/prompt-for-update).
