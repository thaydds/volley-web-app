# Volley Web App

PWA mobile-first para peladas de vôlei: montar times com quem veio, sortear, acompanhar — funcionando offline, instalável no celular. Feito com Vite + React + TypeScript.

## Telas da v1

- **Home** — entrada com acesso a Partidas (Cartas e Configurações entram no futuro).
- **Partidas / Quem veio hoje?** — cadastra jogadores, marca presentes, sorteia Time A × Time B, ajusta manualmente e vê os times listados.
- **Ranking** — entra na próxima unidade (U3).

## Design

- **Figma**: [volei-app](https://www.figma.com/design/baO5SbbaGO01QTGc8d5M0P/volei-app--Copy-?node-id=2-2&p=f&t=KUiSkrsZaWPrVVwj-0)
- Cartões `#D9D9D9` com raio 24px, Inter, layout 393px fiel ao Figma.

## Dados

Só no aparelho (localStorage, chave versionada `volley-v1`); sem backend nesta v1. Leitura inválida redefine com aviso.

## Comandos

```bash
npm install     # dependências
npm run dev     # desenvolvimento
npm run build   # build de produção
npm run preview # prévia do build
npx vitest run src/roster src/matchmaking src/home  # testes da unidade
```

## Qualidade

BDD (Vitest + Testing Library), cobertura ≥80%, `tsc -b` verde, Prettier + ESLint. Branches curtas com PR revisado e squash; Conventional Commits.

## Roadmap

U2 Partidas (confirmação, histórico, vencedor), U3 Ranking; futuro: Cartas, Configurações (tamanho da fonte), API.
