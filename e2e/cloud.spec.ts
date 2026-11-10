import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function ready(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Última atualização:' })).toBeVisible();
}
async function draw(page: Page) {
  await page.getByTestId('home-montar-time').click();
  await page.getByRole('button', { name: 'Ana', exact: true }).click();
  await page.getByRole('button', { name: 'Bia', exact: true }).click();
  await page.getByTestId('roster-draw-button').click();
  await page.getByTestId('draw-confirm-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function finish(page: Page, side: 'a' | 'b' = 'a') {
  await page.getByTestId(`matches-winner-${side}-button`).click();
  await page.getByTestId('matches-winner-confirm-button').click();
  await expect(page.getByTestId('matches-card-1')).toBeVisible();
}

test('dois navegadores compartilham partidas e ranking, mantendo presença e sessões separadas', async ({
  page,
  browser,
  backend,
}) => {
  await backend.seedPlayers(['Ana', 'Bia']);
  const other = await browser.newContext();
  await backend.route(other);
  const second = await other.newPage();
  try {
    await page.goto('./');
    await ready(page);
    await second.goto('http://127.0.0.1:4178/volley-web-app/');
    await ready(second);
    await second.getByTestId('home-history-button').click();
    await expect(second.getByTestId('matches-history-empty')).toBeVisible();
    await draw(page);
    await finish(page);
    await second.getByRole('button', { name: 'Atualizar dados', exact: true }).click();
    await expect(second.getByTestId('matches-card-1')).toBeVisible();
    await second.getByTestId('matches-history-back-button').click();
    await second.getByTestId('home-ranking-button').click();
    await expect(second.getByRole('table')).toContainText('Ana');
    await expect(second.getByRole('table')).toContainText('1 vitórias');
    await second.getByRole('button', { name: 'Voltar', exact: true }).click();
    await second.getByTestId('home-montar-time').click();
    await expect(second.getByTestId('roster-present-count')).toContainText('0 presentes');
    expect(backend.sessionCount).toBe(2);
  } finally {
    await other.unrouteAll({ behavior: 'wait' });
    await other.close();
  }
});

test('cache offline permite consultar, bloqueia gravações e volta a atualizar ao reconectar', async ({
  page,
  context,
  backend,
}) => {
  await backend.seedPlayers(['Ana', 'Bia']);
  await page.goto('./');
  await ready(page);
  await draw(page);
  await finish(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        })
      );
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('home-history-button').click();
  await expect(page.getByTestId('matches-card-1')).toBeVisible();
  await page.getByTestId('matches-card-1').click();
  await expect(page.getByTestId('matches-delete-open-1')).toBeDisabled();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByTestId('matches-history-back-button').click();
  await page.getByTestId('home-montar-time').click();
  await expect(page.getByTestId('roster-add-button')).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId('roster-add-button')).toBeEnabled();
});

test('falha de consulta não vira histórico vazio e uma nova consulta recupera o app', async ({
  page,
  backend,
}) => {
  backend.failReads = true;
  await page.goto('./');
  await page.getByTestId('home-history-button').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('matches-history-empty')).toHaveCount(0);
  backend.failReads = false;
  await page.getByRole('button', { name: 'Atualizar dados', exact: true }).click();
  await expect(page.getByTestId('matches-history-empty')).toBeVisible();
});

test('resposta perdida após salvar não duplica o registro ao recarregar e repetir o envio', async ({
  page,
  backend,
}) => {
  await page.goto('./');
  await ready(page);
  await page.getByTestId('home-montar-time').click();
  await page.getByLabel('Nome do jogador').fill('Ana');
  backend.dropNextWrite = true;
  await page.getByTestId('roster-add-button').click();
  await expect(page.getByRole('button', { name: 'Repetir envio pendente' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Repetir envio pendente' })).toBeVisible();
  await page.getByRole('button', { name: 'Repetir envio pendente' }).click();
  await expect(page.getByRole('button', { name: 'Repetir envio pendente' })).toHaveCount(0);
  await page.getByTestId('home-montar-time').click();
  await expect(page.getByTestId('roster-player-chip')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Ana', exact: true })).toBeVisible();
});

test('prévia desmarca possível duplicata, importa a seleção e preserva o localStorage antigo', async ({
  page,
  backend,
}) => {
  await backend.seedLegacy({
    source_id: crypto.randomUUID(),
    players: ['Ana', 'Bia'],
    matches: [
      {
        key: 'other-device',
        played_on: '2026-11-01',
        winner: 'A',
        team_a: ['Ana'],
        team_b: ['Bia'],
      },
    ],
  });
  const raw = JSON.stringify({
    players: [
      { name: 'Ana', present: true },
      { name: 'Bia', present: true },
    ],
    matches: [
      { number: 7, date: '01/11/2026', winner: 'A', teamA: ['Ana'], teamB: ['Bia'] },
      { number: 8, date: '02/11/2026', winner: null, teamA: ['Ana'], teamB: ['Bia'] },
    ],
  });
  await page.addInitScript((raw) => localStorage.setItem('volley-v1', raw), raw);
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Revisar histórico deste aparelho' }).click();
  const duplicate = page.getByRole('checkbox', { name: /Partida local #7/ });
  await expect(duplicate).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Partida local #8/ })).toBeChecked();
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('import-dialog')).toHaveCount(0);
  await page.getByTestId('home-history-button').click();
  await expect(page.getByTestId('matches-history-list').getByRole('listitem')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('volley-v1'))).toBe(raw);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Revisar histórico deste aparelho' })).toHaveCount(
    0
  );
});

test('exclusão é recuperável e uma edição concorrente não sobrescreve o outro navegador', async ({
  page,
  browser,
  backend,
}) => {
  await backend.seedPlayers(['Ana', 'Bia']);
  await page.goto('./');
  await ready(page);
  await draw(page);
  await finish(page);
  const context = await browser.newContext();
  await backend.route(context);
  const second = await context.newPage();
  try {
    await second.goto('http://127.0.0.1:4178/volley-web-app/');
    await ready(second);
    await second.getByTestId('home-history-button').click();
    await page.getByTestId('matches-card-1').click();
    await second.getByTestId('matches-card-1').click();
    await page.getByRole('button', { name: 'Alterar resultado' }).click();
    await second.getByRole('button', { name: 'Alterar resultado' }).click();
    await page.getByTestId('matches-winner-b-button').click();
    await page.getByTestId('matches-winner-confirm-button').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await second.getByTestId('matches-winner-a-button').click();
    await second.getByTestId('matches-winner-confirm-button').click();
    await expect(second.getByRole('alert')).toContainText('mudaram em outro dispositivo');
    await expect(second.getByRole('dialog')).toHaveCount(0);
    await second.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(second.getByTestId('matches-winner-badge-1')).toContainText('Time B');
    await page.getByTestId('matches-delete-open-1').click();
    await page.getByTestId('matches-delete-confirm-button').click();
    await expect(page.getByTestId('matches-history-empty')).toBeVisible();
    await page.getByRole('button', { name: 'Partidas removidas (1)' }).click();
    await page.getByRole('button', { name: 'Restaurar partida #001' }).click();
    await expect(page.getByTestId('matches-card-1')).toBeVisible();
  } finally {
    await context.unrouteAll({ behavior: 'wait' });
    await context.close();
  }
});
