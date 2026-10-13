import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the shared player-name chip against cascade-order breakage.
 *
 * The base `.player-chip` rule lives in index.css, which Vite emits *after*
 * the component stylesheets. A bare modifier selector (`.player-chip--present`)
 * has the same specificity as the base, so it gets overridden and every chip
 * silently renders grey. Compound selectors (`.player-chip.player-chip--present`)
 * raise specificity to (0,2,0) and win regardless of stylesheet order.
 */
describe('player chip CSS cascade', () => {
  const cssFiles = ['index.css', 'roster/RosterScreen.css', 'matchmaking/DrawScreen.css'];

  function modifierSelectors(): Array<{ file: string; selector: string }> {
    const found: Array<{ file: string; selector: string }> = [];
    for (const file of cssFiles) {
      const css = readFileSync(path.join('src', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // Match `selector {` occurrences that mention a player-chip modifier.
      const ruleRe = /([^{}]+)\{/g;
      let match: RegExpExecArray | null;
      while ((match = ruleRe.exec(css)) !== null) {
        for (const selector of match[1]?.split(',') ?? []) {
          const trimmed = selector.trim().replace(/\s+/g, ' ');
          if (trimmed.includes('player-chip--')) {
            found.push({ file, selector: trimmed });
          }
        }
      }
    }
    return found;
  }

  it('cobre os modificadores do chip', () => {
    const selectors = modifierSelectors().map((entry) => entry.selector);
    expect(selectors).toContain('.player-chip.player-chip--present');
    expect(selectors).toContain('.player-chip.player-chip--team');
    expect(selectors).toContain('.player-chip.player-chip--dragging');
  });

  it('nenhum modificador é um seletor simples que a regra base sobrescreveria', () => {
    const bare = modifierSelectors().filter(
      (entry) => !entry.selector.includes('.player-chip.player-chip--')
    );
    expect(bare).toEqual([]);
  });

  it('os tokens de cor do chip azul batem com o Figma', () => {
    const css = readFileSync(path.join('src', 'index.css'), 'utf8');
    expect(css).toMatch(/--color-chip-pressed:\s*#a1e0ff/i);
    expect(css).toMatch(/--color-chip-border:\s*#4c85ff/i);
  });
});
