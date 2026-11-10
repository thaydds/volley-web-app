# Beach Sports · Volley Web App

PWA React + TypeScript para organizar partidas de vôlei, usando os pacotes publicados **@beachsports/components 0.5.0** e **@beachsports/tokens 0.1.1**.

[Design no Figma](https://www.figma.com/design/baO5SbbaGO01QTGc8d5M0P/volei-app--Copy-?node-id=2124-9496) · [Biblioteca e documentação](https://thaydds.github.io/Beach-Sports-DS/) · [App publicado](https://thaydds.github.io/volley-web-app/)

## Fluxo

- **Início:** montar time, partidas, ranking e ajustes. Cartas fica indisponível porque ainda não tem fluxo definido.
- **Seleção:** Chip MD alterna presença; contador usa os dados reais. Campo de cadastro sempre visível, sem seção expansível.
- **Times definidos:** sorteio, novo sorteio e movimentação por arraste. Alternativa por teclado/toque: selecionar jogador → Mover para Time A/B. A mudança é anunciada e o foco volta ao jogador.
- **Vencedor:** finalizar registra a partida; confirmação escolhe A/B. Cancelar mantém o registro sem vencedor.
- **Histórico e detalhes:** as partidas compartilhadas têm detalhe, edição de resultado, revanche, exclusão recuperável e restauração. Placar ausente aparece como `—`.
- **Ranking:** é derivado no banco por ID de jogador: uma vitória soma um ponto; empates recebem a mesma posição. Participantes históricos continuam aparecendo.
- **Ajustes:** temas Light/Dark e fonte padrão, grande (125%) ou muito grande (150%), salvos no aparelho. “Como usar” abre o onboarding do Figma.

## Desenvolvimento

```bash
npm ci
npm run dev
```

O servidor usa a base `/volley-web-app/`. Estilos e tokens públicos são importados uma única vez em `src/main.tsx`. A fonte Inter fica hospedada localmente e entra no cache offline, com licença em `src/assets/Inter-LICENSE.txt`.

## Validação

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

Vitest verifica regras, armazenamento e interações. Playwright usa o build de produção em 393px, 320px e desktop, com auditorias axe nos temas Light/Dark, reflow, preferências, movimento, foco e recarregamento offline. Evidências ficam em `test-results/`; relatório em `playwright-report/`.

## Dados e deploy

Jogadores, partidas e ranking usam a API do Supabase. A URL pública fica em
`.env.production`; nenhuma chave de projeto vai para o navegador. Acesso automático,
sem CAPTCHA, com tokens de sessão e permissões no banco. Presença e preferências
continuam no aparelho. Há prévia para importar o `volley-v1` antigo, preservando
a cópia original, e cache offline somente para consulta.

**Acesso anônimo habilitado e API validada com clientes reais.** O merge publica
a integração no GitHub Pages. Contrato, configuração, evidências e limites estão
em [supabase/README.md](supabase/README.md).

`npm run dev` sem VITE_VOLLEY_API_URL mantém a prévia local legada. O build de
produção é configurado para a API. Os testes de navegador interceptam esse endpoint
com handler e banco reais de teste, sem tocar no projeto remoto.

CI valida PRs; o workflow Deploy publica `main` no GitHub Pages. A versão da biblioteca fica fixada no lockfile; releases do DS não atualizam o app automaticamente.

As decisões e lacunas do Figma estão em [docs/redesign.md](docs/redesign.md).
