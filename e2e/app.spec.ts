import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const names = [
  'André',
  'Andressa',
  'Arrana',
  'Erick',
  'Gustavo',
  'Iolanda',
  'Lana',
  'LL',
  'Richard',
  'Thay',
  'Sabrina',
  'Tigrinho',
];
async function seed(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    ({ names, theme }) => {
      if (!localStorage.getItem('e2e-seeded')) {
        localStorage.setItem(
          'volley-v1',
          JSON.stringify({
            players: names.map((name, index) => ({ name, present: index < 10 })),
            matches: [],
          })
        );
        localStorage.setItem(
          'volley-preferences-v1',
          JSON.stringify({ theme, fontSize: 'standard' })
        );
        localStorage.setItem('e2e-seeded', 'true');
      }
    },
    { names, theme }
  );
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
}
async function audit(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {}))
    );
  });
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const overflow = await page
    .locator('.screen-content:visible')
    .evaluateAll((nodes) => nodes.some((n) => n.scrollWidth > n.clientWidth + 1));
  expect(overflow).toBe(false);
}
for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: seleção, movimento acessível, vencedor, histórico e persistência`, async ({
    page,
  }, testInfo) => {
    await seed(page, theme);
    await audit(page);
    await page.screenshot({ path: testInfo.outputPath(`home-${theme}.png`) });
    await page.getByTestId('home-montar-time').click();
    await expect(page.getByTestId('roster-present-count')).toContainText('10 presentes');
    await page.getByRole('button', { name: 'Sabrina', exact: true }).click();
    await expect(page.getByTestId('roster-present-count')).toContainText('11 presentes');
    await page.getByRole('button', { name: 'Sabrina', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sabrina', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await audit(page);
    await page.screenshot({ path: testInfo.outputPath(`selection-${theme}.png`) });
    await page.getByTestId('roster-draw-button').click();
    const first = page.getByTestId('draw-team-a').getByTestId('draw-team-member').first();
    const movedName = await first.getAttribute('data-player-name');
    await first.getByRole('button').press('Space');
    await page.getByRole('button', { name: 'Mover para Time B', exact: true }).click();
    const moved = page.getByTestId('draw-team-b').locator(`[data-player-name="${movedName}"]`);
    await expect(moved).toHaveCount(1);
    await expect(moved.getByRole('button')).toBeFocused();
    await expect(page.getByTestId('draw-team-member')).toHaveCount(10);
    await audit(page);
    await page.screenshot({ path: testInfo.outputPath(`teams-${theme}.png`) });
    await page.getByTestId('draw-confirm-button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('matches-winner-confirm-button')).toBeDisabled();
    await page.getByTestId('matches-winner-a-button').click();
    await audit(page);
    await page.screenshot({ path: testInfo.outputPath(`winner-${theme}.png`) });
    await page.getByTestId('matches-winner-confirm-button').click();
    await page.getByTestId('matches-card-1').click();
    await expect(page.getByRole('heading', { name: 'Detalhes da partida' })).toBeVisible();
    await expect(page.locator('[data-score-match]')).toContainText('—');
    if (testInfo.project.name === 'mobile') {
      const teams = page.locator('[data-score-match] [data-slot="team"]');
      const first = await teams.first().boundingBox();
      const second = await teams.last().boundingBox();
      expect(second!.y).toBeCloseTo(first!.y, 1);
      expect(second!.x).toBeGreaterThan(first!.x);
    }

    await audit(page);
    await page.screenshot({ path: testInfo.outputPath(`detail-${theme}.png`) });
    await page.getByTestId('matches-delete-open-1').click();
    await expect(page.getByTestId('matches-delete-cancel-button')).toBeFocused();
    await audit(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('matches-delete-open-1')).toBeFocused();
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await page.getByTestId('matches-history-back-button').click();
    await page.getByTestId('home-montar-time').click();
    await page.getByRole('button', { name: 'André', exact: true }).click();
    await page.reload();
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('volley-v1')!).matches)
    ).toHaveLength(1);
    await page.getByTestId('home-ranking-button').click();
    await expect(page.getByRole('table')).toBeVisible();
    if (testInfo.project.name === 'mobile') {
      await expect(page.getByRole('columnheader').first()).toBeVisible();
      await expect(page.locator('[data-ranking] tbody')).toHaveCSS('display', 'table-row-group');
    }

    await audit(page);
    await page.screenshot({ path: testInfo.outputPath(`ranking-${theme}.png`) });
  });
  test(`${theme}: ajustes e onboarding acessíveis com fonte ampliada`, async ({
    page,
  }, testInfo) => {
    await seed(page, theme);
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Muito grande', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-font-size', 'extra-large');
    await audit(page);
    await page
      .getByRole('button', { name: theme === 'light' ? 'Tema escuro' : 'Tema claro', exact: true })
      .click();
    await page.screenshot({ path: testInfo.outputPath(`settings-${theme}.png`) });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      theme === 'light' ? 'dark' : 'light'
    );
    await expect(page.locator('html')).toHaveAttribute('data-font-size', 'extra-large');
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Como usar o Beach Sports' }).click();
    await expect(page.getByRole('heading', { name: 'Seu vôlei, organizado.' })).toBeVisible();
    await audit(page);
    await page.getByRole('button', { name: 'Começar', exact: true }).click();
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await audit(page);
  });
}
test('PWA recarrega offline com fonte e dados locais', async ({ page, context }) => {
  await seed(page, 'light');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        })
      );
    return !!registration.active;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await page.getByTestId('home-montar-time').click();
  await expect(page.getByTestId('roster-present-count')).toContainText('10 presentes');
  await context.setOffline(false);
});

test('arraste por ponteiro move apenas um jogador e mantém os demais', async ({
  page,
}, testInfo) => {
  await seed(page, 'light');
  await page.getByTestId('home-montar-time').click();
  await page.getByTestId('roster-draw-button').click();
  const source = page.getByTestId('draw-team-a').getByTestId('draw-team-member').first();
  const name = await source.getAttribute('data-player-name');
  const start = await source.getByRole('button').boundingBox();
  const end = await page.getByTestId('draw-team-b').boundingBox();
  if (!start || !end) throw new Error('Áreas de arraste ausentes');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 15, { steps: 3 });
  await page.mouse.move(end.x + end.width / 2, end.y + 30, { steps: 20 });
  await expect(page.getByTestId('draw-team-b')).toHaveAttribute('data-drop-target', 'true');
  await page.screenshot({ path: testInfo.outputPath('drag-preview.png') });
  await page.mouse.up();
  await expect(page.getByTestId('draw-team-b').locator(`[data-player-name="${name}"]`)).toHaveCount(
    1
  );
  await expect(page.getByTestId('draw-team-member')).toHaveCount(10);
  await audit(page);
});

test('primeiro uso permite cadastrar vários jogadores e rejeita duplicata', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('home-montar-time').click();
  const input = page.getByLabel('Nome do jogador');
  await input.fill('Lana');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(input).toBeVisible();
  await input.fill('Bia');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByRole('button', { name: 'Lana', exact: true }).click();
  await page.getByRole('button', { name: 'Bia', exact: true }).click();
  await expect(page.getByTestId('roster-draw-button')).toBeEnabled();
  await input.fill('Lana');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('roster-player-chip')).toHaveCount(2);
  await audit(page);
});

test('toque no Chip alterna presença sem iniciar arraste', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'Toque é verificado nos projetos móveis.');
  await seed(page, 'light');
  await page.getByTestId('home-montar-time').tap();
  const player = page.getByRole('button', { name: 'Sabrina', exact: true });
  await player.tap();
  await expect(player).toHaveAttribute('aria-pressed', 'true');
  await player.tap();
  await expect(player).toHaveAttribute('aria-pressed', 'false');
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: foco do Input e do Chip pertence ao contêiner inteiro`, async ({
    page,
  }, info) => {
    await seed(page, theme);
    await page.getByTestId('home-montar-time').click();
    const input = page.getByRole('textbox', { name: 'Nome do jogador' });
    await expect(input).toBeVisible();
    await input.fill('Teste');
    await expect(input).toHaveCSS('outline-style', 'none');
    await expect(page.locator('[data-input]')).toHaveCSS('outline-width', '2px');
    await page.screenshot({ path: info.outputPath(`input-focus-${theme}.png`) });
    const chip = page
      .locator('[data-chip]')
      .filter({ has: page.getByRole('button', { name: 'Sabrina', exact: true }) });
    const button = chip.getByRole('button', { name: 'Sabrina', exact: true });
    await button.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(chip).toHaveCSS('outline-width', '2px');
    await expect(button).toHaveCSS('outline-style', 'none');
    await expect(button).toHaveCSS('-webkit-tap-highlight-color', 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const actionColor = await chip.evaluate((node) =>
      getComputedStyle(node).getPropertyValue('--ds-color-action-default').trim()
    );
    await expect(chip).toHaveCSS(
      'background-color',
      await chip.evaluate((node, color) => {
        const probe = document.createElement('span');
        probe.style.color = color;
        node.append(probe);
        const result = getComputedStyle(probe).color;
        probe.remove();
        return result;
      }, actionColor)
    );
    await page.screenshot({ path: info.outputPath(`chip-focus-${theme}.png`) });
    await audit(page);
  });
}
