# Migração do app para Beach Sports DS

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
