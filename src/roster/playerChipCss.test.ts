import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('integração visual do DS', () => {
  it('carrega tokens e estilos públicos uma única vez no entrypoint', () => {
    const entry = readFileSync('src/main.tsx', 'utf8');
    expect(entry).toContain("import '@beachsports/tokens/css/tokens.css'");
    expect(entry).toContain("import '@beachsports/components/styles.css'");
  });
  it('a seleção usa o Chip público e não clona seus estilos', () => {
    const screen = readFileSync('src/roster/RosterScreen.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');
    expect(screen).toContain('<Chip');
    expect(screen).toContain('selected={player.present}');
    expect(css).not.toContain('.player-chip');
    expect(css).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
});
