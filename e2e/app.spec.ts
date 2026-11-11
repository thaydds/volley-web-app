import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { seed, prepare, score, finish, home, synchronized, pollCycle } from './lifecycle.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`approved navigation, roster, pregame, scores and immutable result / ${theme}`, async ({
    page,
    backend,
  }, info) => {
    await seed(page, backend, ['André', 'Lana', 'Andressa', 'LL'], theme);
    const capture = async (name: string) => {
      const path = info.outputPath(`${name}-${theme}.png`);
      await page.screenshot({ path, fullPage: true });
      await info.attach(`${name}-${theme}`, { path, contentType: 'image/png' });
    };
    await capture('home');
    await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
    await capture('presence');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(nav.getByRole('button')).toHaveText(['Ranking', 'Partidas', 'Ajustes']);
    await expect(page.getByRole('button', { name: 'Cartas', exact: true })).toBeDisabled();
    await expect(page.locator('footer [title^="Versão"]')).toBeVisible();
    await prepare(page, ['André', 'Lana', 'Andressa', 'LL']);
    await expect(page.getByText('Começa no saque', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Escolhe o lado', { exact: true })).toHaveCount(1);
    await capture('pregame');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    const a = page.getByTestId('draw-team-a');
    const member = a.locator('[data-player-id]').first();
    const id = await member.getAttribute('data-player-id');
    const name = (await member.innerText()).trim();
    const badge = a.locator('[data-badge]');
    const title = a.getByRole('heading', { name: 'Time A' });
    expect(Math.abs((await badge.boundingBox())!.y - (await title.boundingBox())!.y)).toBeLessThan(
      10
    );
    await member.getByRole('button').focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: `Mover ${name} para Time B` }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('draw-team-b').locator(`[data-player-id="${id}"]`)).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar partida', exact: true }).click();
    const input = page.getByRole('spinbutton', { name: 'Placar Time A', exact: true });
    await expect(input).toBeVisible();
    for (const root of await page.locator('[data-counter]').all()) {
      await expect(root).toHaveCSS('width', '158px');
      await expect(root).toHaveCSS('height', '106px');
    }
    await expect(
      page.getByRole('button', { name: 'Finalizar partida', exact: true })
    ).toBeDisabled();
    await score(page, '-1', '3');
    await expect(
      page.getByRole('button', { name: 'Finalizar partida', exact: true })
    ).toBeDisabled();
    await score(page, '2.5', '3');
    await expect(
      page.getByRole('button', { name: 'Finalizar partida', exact: true })
    ).toBeDisabled();
    await score(page, '3', '3');
    await expect(
      page.getByRole('button', { name: 'Finalizar partida', exact: true })
    ).toBeDisabled();
    await score(page, '21', '18');
    await expect(page.getByRole('button', { name: 'Salvar placar', exact: true })).toHaveCount(0);
    expect((await backend.matches()).length).toBe(0);
    await expect(
      page.getByRole('button', { name: 'Finalizar partida', exact: true })
    ).toBeEnabled();
    await capture('live');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Finalizar partida', exact: true }).click();
    await capture('confirm');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Finalizar partida', exact: true })
    ).toBeFocused();
    await finish(page);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Finalizar partida', exact: true })).toHaveCount(
      0
    );
    await expect(page.getByRole('button', { name: 'Revanche', exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await capture('finished');
    await home(page);
    await synchronized(page);
    expect(await backend.matches()).toMatchObject([
      { status: 'finished', score_a: 21, score_b: 18, winner: 'A' },
    ]);
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Partidas', exact: true })
      .click();
    await page.getByRole('button', { name: 'Finalizadas', exact: true }).click();
    await page.getByRole('button', { name: /Abrir Partida/ }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Partida finalizada', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Revanche', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Times definidos' })).toBeVisible();
    expect((await backend.matches()).length).toBe(1);
  });
  test(`deactivation is separate from presence; authorization and reactivation preserve identity / ${theme}`, async ({
    page,
    backend,
  }) => {
    const players = await seed(page, backend, ['André', 'Lana'], theme);
    const gameId = crypto.randomUUID();
    await backend.command('start_match', {
      id: gameId,
      played_on: '2026-11-10',
      serving_side: 'A',
      participants: [
        { player_id: players[0].id, side: 'A' },
        { player_id: players[1].id, side: 'B' },
      ],
    });
    await backend.command('finish_match', { id: gameId, version: 1, score_a: 21, score_b: 18 });
    await synchronized(page);
    await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
    const andre = page.getByRole('button', { name: 'André', exact: true });
    await andre.click();
    await page.getByRole('button', { name: 'Desativar André', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(andre).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByLabel('Palavra-chave de autorização').fill('wrong-test-word');
    await dialog.getByRole('button', { name: 'Desativar jogador' }).click();
    await expect(dialog.getByText('Palavra-chave incorreta.', { exact: false })).toBeVisible();
    await dialog.getByLabel('Palavra-chave de autorização').fill(backend.testAuthorizationWord);
    await dialog.getByRole('button', { name: 'Desativar jogador' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(andre).toHaveCount(0);
    await page.getByLabel('Nome do jogador').fill('  aNdRé  ');
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Reativar André?' })).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Reativar jogador', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(andre).toBeVisible();
    await home(page);
    await synchronized(page);
    const restored = (await backend.players()).find((p) => p.name === 'André');
    expect(restored).toMatchObject({ id: players[0].id, deleted_at: null, version: 3 });
    expect((await backend.matches())[0]).toMatchObject({
      id: gameId,
      status: 'finished',
      score_a: 21,
    });
  });
}

test('deactivation fails closed until server authorization is configured', async ({
  page,
  backend,
}) => {
  await seed(page, backend);
  await backend.authorizationConfigured(false);
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  await page.getByRole('button', { name: 'Desativar André' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Palavra-chave de autorização').fill('explicit-test-only-phrase');
  await dialog.getByRole('button', { name: 'Desativar jogador' }).click();
  await expect(
    dialog.getByText('A autorização de desativação ainda não foi configurada no serviço.')
  ).toBeVisible();
  expect((await backend.players()).every((p) => p.deleted_at === null)).toBe(true);
});

test('initial loading is only a spinner, failures retry and settings keep preferences', async ({
  page,
  backend,
}) => {
  let release!: () => void;
  backend.readGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  backend.failReads = false;
  try {
    await page.goto('./');
    const loading = page.getByRole('main', { name: 'Carregamento' });
    await expect(loading).toHaveAttribute('aria-busy', 'true');
    await expect(loading).toHaveText('');
    await expect(
      loading.getByRole('status', { name: 'Carregando jogadores e partidas' })
    ).toBeVisible();
    backend.failReads = true;
  } finally {
    release();
    backend.readGate = null;
  }
  await expect(page.getByRole('heading', { name: 'Não foi possível carregar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
  backend.failReads = false;
  await pollCycle(page);
  await expect(page.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
});

test('pregame pointer drag moves the real DS chip without starting or changing a match', async ({
  page,
  backend,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Native pointer drag; keyboard alternative is checked in all layouts.'
  );
  await seed(page, backend, ['André', 'Lana', 'Andressa', 'LL']);
  await prepare(page, ['André', 'Lana', 'Andressa', 'LL']);
  const source = page.getByTestId('draw-team-a').locator('[data-player-id]').first();
  const id = await source.getAttribute('data-player-id');
  const button = await source.getByRole('button').boundingBox();
  const target = await page.getByTestId('draw-team-b').boundingBox();
  await page.mouse.move(button!.x + button!.width / 2, button!.y + button!.height / 2);
  await page.mouse.down();
  await page.mouse.move(button!.x + button!.width / 2 + 12, button!.y + button!.height / 2, {
    steps: 3,
  });
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {
    steps: 25,
  });
  await page.mouse.up();
  await expect(page.getByTestId('draw-team-b').locator(`[data-player-id="${id}"]`)).toBeVisible();
  expect(await backend.matches()).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`presence taps keep geometry and rapid toggles survive reload / ${theme}`, async ({
    page,
    backend,
  }) => {
    await seed(page, backend, ['André', 'Lana', 'Andressa'], theme);
    await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
    const chip = page.getByRole('button', { name: 'André', exact: true });
    const before = await chip.locator('..').boundingBox();
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    const after = await chip.locator('..').boundingBox();
    expect(after!.width).toBe(before!.width);
    expect(after!.height).toBe(before!.height);
    await expect(chip).toBeEnabled();
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect((await chip.locator('..').boundingBox())!.width).toBe(before!.width);
    // Synchronous rapid events must not be dropped by a global storage busy flag.
    await chip.evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error('Expected native chip button');
      button.click();
      button.click();
      button.click();
    });
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Lana', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sortear times', exact: true })).toBeEnabled();
    await page.reload();
    await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Lana', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
  });
}
