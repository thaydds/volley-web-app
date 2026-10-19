# Volley Web App

PWA mobile-first para peladas de vôlei: montar times com quem veio, sortear, acompanhar — funcionando offline, instalável no celular. Feito com Vite + React + TypeScript.

## Telas

- **Home** — entrada com acesso a Partidas, Histórico e Ranking.
- **Partidas / Quem veio hoje?** — cadastra jogadores, marca presentes, sorteia Time A × Time B, ajusta manualmente e vê os times listados.
- **Confirmação / Histórico** — confirma a partida, define o vencedor e lista o histórico com rematch e exclusão.
- **Ranking** — reordena jogadores por arrastar e soltar.

## Design

- **Figma**: [volei-app](https://www.figma.com/design/baO5SbbaGO01QTGc8d5M0P/volei-app--Copy-?node-id=2-2&p=f&t=KUiSkrsZaWPrVVwj-0)
- Cartões `#D9D9D9` com raio 24px, Inter, layout 393px fiel ao Figma.

## Dados

Só no aparelho (localStorage, chave versionada `volley-v1`); sem backend nesta v1. Leitura inválida redefine com aviso.

## Comandos

```bash
npm install         # dependências
npm run dev         # desenvolvimento
npm run build       # build de produção
npm run preview     # prévia do build

npm run lint        # ESLint
npm run format      # Prettier (--write)
npm run format:check
npm run typecheck   # tsc -b
npm test            # testes (Vitest)
npm run test:coverage  # testes com cobertura
```

## Qualidade

BDD (Vitest + Testing Library), cobertura ≥80% com thresholds no CI, `tsc -b` verde, Prettier + ESLint. Branches curtas com PR revisado e squash; Conventional Commits. O workflow `CI` roda lint, formatação, typecheck e testes a cada push/PR; o `Deploy` publica no GitHub Pages a partir de `main`.

## Deploy

Publicado via GitHub Actions em <https://thaydds.github.io/volley-web-app/> (subpath `/volley-web-app/`, refletido no `base`, `scope` e `start_url` do PWA).

## Roadmap

Futuro: Cartas, Configurações (tamanho da fonte), API.
