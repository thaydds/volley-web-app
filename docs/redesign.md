# Referências de design e evolução do Volley

## Proposta atual: API e ciclo offline · 10 nov 2026

Fonte: [frames atuais](https://www.figma.com/design/baO5SbbaGO01QTGc8d5M0P/volei-app--Copy-?node-id=2124-9496), inspecionados por screenshots e metadata; nenhum write no Figma. Implementação em revisão, sem publicação.

| Fluxo                       | Nodes Figma                          | Implementação                                                                                                   |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Home Light/Dark             | 2124:9497 / 2124:10734               | LifecycleApp + Page; navegação inferior horizontal, sincronização manual, Cartas indisponível, versão do build. |
| Presença Light/Dark         | 2124:9595 / 2124:10832               | PresenceScreen; cadastro na mesma tela, chips naturais com check selecionado, remoção separada.                 |
| Pré-jogo                    | 2124:9686                            | PrepTeams; drag e alternativa acessível; badges complementares no título; inicia outra entidade de partida.     |
| Em andamento / placar       | 2184:16973 / 2184:16993 / 2184:17980 | MatchPanel; ScoreMatch com slots de dois Inputs DS 56×56, labels/participantes preservados.                     |
| Confirmar finalização       | 2184:20090                           | Modal DS com times, placar, vencedor derivado e aviso de imutabilidade.                                         |
| Desativar / erro / reativar | 2184:19935 / 2184:19992 / 2184:20135 | Modais DS; palavra em memória, erro no campo, autorização DB, reativação explícita do UUID.                     |
| Finalizadas / carregamento  | 2124:10622 / 2184:17061              | Somente números e leitura; spinner sem texto visual, com nome acessível.                                        |

O slot nativo Score content do Live permite inputs no lugar dos números; Finished permanece numérico. A [PR #24 do DS](https://github.com/thaydds/Beach-Sports-DS/pull/24) acrescenta composição tipada sem duplicar/desanexar ScoreMatch ou mudar labels existentes. A PR foi mergeada e o app agora usa a release npm0.7.0, fixada no lockfile; o artefato de revisão foi removido.

A correção aprovada do Chip segue documentação2098:55311: padding esquerdo16, gap8, direito0 depois do × com área44. O master tinha direito16; esta divergência foi documentada na PR DS, sem alterar tokens canônicos. O scrim do Modal continua a exceção documentada da versão0.6.0 do DS; não inventamos token de overlay.

Valores de exemplo do Figma (nomes, horários, contagens, versão v0.1.2) vêm de dados/revisão reais. Novo sorteio tem algoritmo e papéis aleatórios; não copia os times da amostra. Falhas, respostas incertas, conflitos e pendências são estados reais, não ações de demonstração. A diferença offline foi expressamente aprovada: agora há gravação local persistida, envio manual e tratamento de dependências, substituindo consulta offline apenas. O histórico anterior permanece preservado, com placar desconhecido quando não existia.

Light/Dark usam os mesmos tokens;320px mantém inputs em duas colunas, sem card separado Placar. A composição usa CSS Modules e controles DS. Testes verificam inputs56, badges na mesma linha, reflow, teclas e axe; isso não significa comparação pixel a pixel nem certifica todos os masters do DS.

As seções abaixo são o registro histórico das versões anteriores e não descrevem o contrato desta branch.

## Registro histórico: migração do app para Beach Sports DS

## Referência

[Workplace · Redesign](https://www.figma.com/design/baO5SbbaGO01QTGc8d5M0P/volei-app--Copy-?node-id=2124-9496), consultado em 04/11/2026 via Figma Desktop MCP. Contexto e screenshots das composições consultados antes da implementação.

| Composição Light | Node       | Implementação                 |
| ---------------- | ---------- | ----------------------------- |
| Home             | 2124:9497  | `home/Home.tsx`               |
| Seleção          | 2124:9595  | `roster/RosterScreen.tsx`     |
| Times definidos  | 2124:9686  | `matchmaking/DrawScreen.tsx`  |
| Histórico        | 2124:9900  | `matches/HistoryScreen.tsx`   |
| Ranking          | 2124:10204 | `home/RankingScreen.tsx`      |
| Configurações    | 2124:10438 | `settings/SettingsScreen.tsx` |
| Vencedor         | 2124:10550 | `matches/WinnerModal.tsx`     |
| Detalhe          | 2124:10622 | `matches/MatchSummary.tsx`    |
| Onboarding       | 2124:10679 | `home/OnboardingScreen.tsx`   |

O guia de presença e movimento é o node `2130:14057`. Dark troca os valores das mesmas variáveis por `data-theme="dark"` no html. Padding de tela 24, gaps 24/16/8, controles, cores e tipografia vêm dos tokens e dos componentes publicados. O CSS do app cuida da composição, áreas roláveis e gestos; não redefine o visual interno dos componentes.

## Integração

- DS instalado via npm, sem cópia de componentes ou alterações nos tokens canônicos.
- Button, Card, Badge, Chip, FormField, Typography, Ranking/RankingItem e ScoreMatch importados do pacote público.
- Cabeçalho e rodapé permanecem separados do conteúdo rolável. Layout móvel com largura máxima de 36rem no desktop, sem criar uma tela desktop não especificada.
- Inter local com licença preservada; nenhum serviço de fontes externo é necessário para leitura offline.
- Removidos o CSS antigo, chips locais e a etapa redundante de confirmação: os times são finalizados diretamente, conforme o fluxo do redesign.
- ScoreMatch e Ranking usam a correção responsiva publicada em `@beachsports/components@0.4.1`: duas colunas no detalhe e três no ranking em 393px, com reflow preservado em 320px e texto ampliado. A correção foi feita no DS, sem sobrescrever seus seletores internos no app.
- Histórico tem Card passivo com botão “Ver partida”, sem transformar o contêiner em botão nem aninhar controles. Detalhes usam ScoreMatch somente quando há vencedor confirmado; um registro sem vencedor não é anunciado como “Ao vivo”.
- Ranking aplica a função de pontuação existente do app, em vez de copiar as pontuações ilustrativas ou permitir arrastar uma classificação calculada. Uma partida excluída deixa de participar desse cálculo.
- Correção de preservação: `saveRoster` atualiza apenas a fatia de jogadores em `volley-v1`, mantendo partidas e demais campos.

## Decisões para lacunas do protótipo

- Nomes, presença, quantidade de jogadores, número, data, vitórias e derrotas vêm dos dados locais. Nenhum histórico de exemplo é inserido no aparelho de produção.
- `999` não tem regra de negócio definida. Nos times, mostramos a quantidade real de jogadores em vez de atribuir significado a esse número.
- Placar não existe no modelo atual: exibimos `—` e a indicação “Placar não informado no registro”.
- O Figma mostra apenas o detalhe #014; o app compõe o mesmo detalhe para qualquer partida real, sem redirecionar todos os registros para um exemplo.
- Cartas não tem destino: controle desabilitado e indicação “Em breve”.
- Falta RadioGroup no DS. A escolha de vencedor usa Button com `aria-pressed`, agrupamento e texto “Selecionado”; só um vencedor fica ativo.
- Falta Dialog no DS. O app usa `dialog` nativo para modalidade, contenção de foco e Escape, composto com DS. Exclusão começa com foco em Cancelar e retorna ao disparador quando cancelada. Vencedor tem apresentação de tela móvel inteira.
- Onboarding e fonte eram propostas. Onboarding é acessível por Ajustes → Como usar, sem criar cadastro nem forçar primeira visita. Fonte usa 100%/125%/150%, e o browser continua podendo ampliar mais.
- O campo de cadastro fica diretamente na seleção, sempre visível, sem seção expansível nem título adicional.
- Arraste usa a API do dnd-kit existente. Um deslocamento mínimo de 8 CSS pixels diferencia arrastar de tocar; esse número é configuração de gesto, não token visual. O handle é o botão real do Chip. O app mantém a seleção semântica do DS, oferece alternativa por teclado/toque e anuncia o resultado. Prévia/área de destino são comportamentos locais, sem criar variantes canônicas de DS.

## Fora desta migração

Sem backend, sincronização entre aparelhos, cadastro de placar ou fluxo de Cartas. Não foram inventados componentes na biblioteca nem novos tokens. Dados existentes usam a mesma origem/chave. A publicação do app depende do merge em main e do workflow de deploy.

## Atualização do Chip (0.4.2)

A atualização para `@beachsports/components@0.4.2` incluiu a área clicável das laterais/topo/base na seleção do Chip e desativou o destaque nativo de toque internamente. O reset global temporário de toque foi removido do app. A proteção contra foco duplicado continua na camada do app, limitada aos controles nativos que ele possui.

## Atualização dos tokens (0.1.1)

O app consome `@beachsports/tokens@0.1.1`, com nomes, valores e aliases alinhados
ao export do Figma. Os nomes legados permanecem como aliases de compatibilidade
e os valores já publicados foram preservados. Nessa atualização, `@beachsports/components`
permaneceu em `0.4.2`, cuja dependência `^0.1.0` aceita a correção `0.1.1`.

A atualização é feita nos pacotes publicados e no lockfile; o app continua
importando o CSS de tokens uma única vez. O Figma não foi alterado por esta
atualização e a fidelidade completa de todos os componentes é uma revisão separada.

## Atualização dos componentes (0.5.0)

O app consome `@beachsports/components@0.5.0`, mantendo os tokens em `0.1.1`,
compatíveis com a dependência `^0.1.0` da biblioteca. A versão adiciona `PlayerCard`
e `MatchCard` e preserva o `Card` composicional utilizado pelas telas atuais.

Esta atualização instala o pacote publicado e atualiza o lockfile. As telas
continuam usando suas composições atuais; a adoção dos novos cards exige uma
migração própria. A auditoria do DS registra pendências de contraste nos badges
Light desses novos cards e de vínculos no Figma; atualizar a dependência não
resolve essas pendências nem certifica a paridade completa com o design.
