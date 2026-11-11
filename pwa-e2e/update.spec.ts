import { test, expect } from '../e2e/fixtures';
import { seed, start, score, home, outbox } from '../e2e/lifecycle.helpers';

test('a real A→B PWA update preserves active scores in other tabs and durable pending actions', async ({
  page,
  context,
  backend,
}) => {
  await seed(page, backend);
  await expect(page.locator('footer [title^="Versão"]')).toHaveText('v0.1.0');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await start(page);
  await score(page, '21', '18');
  const second = await context.newPage();
  await second.clock.install();
  await second.goto('./');
  await expect(second.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
  await page.request.post('http://127.0.0.1:4178/__pwa_test__/switch');
  // No manual update check: let the five-minute timer discover the real second build.
  await second.clock.fastForward(301000);
  await expect(second.getByRole('heading', { name: 'Nova versão disponível' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Placar Time A', exact: true })).toHaveValue(
    '21'
  );
  await expect(page.getByRole('spinbutton', { name: 'Placar Time B', exact: true })).toHaveValue(
    '18'
  );
  await home(page);
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  await page.getByLabel('Nome do jogador').fill('Pending during update');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Pending during update', exact: true })
  ).toBeVisible();
  const pending = (await outbox(page)).queue;
  expect(pending.length).toBeGreaterThan(0);
  await second.getByRole('button', { name: 'Atualizar app', exact: true }).click();
  await second.getByRole('dialog').getByRole('button', { name: 'Continuar no app' }).click();
  await expect(second.locator('footer [title^="Versão"]')).toHaveText('v0.1.0');
  await second.getByRole('button', { name: 'Atualizar app', exact: true }).click();
  await second.getByRole('dialog').getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(second.locator('footer [title^="Versão"]')).toHaveText('v0.1.1');
  expect((await outbox(second)).queue).toEqual(pending);
  // The other tab has not consented: still A, form/session untouched.
  await expect(page.getByRole('heading', { name: 'Quem veio hoje?' })).toBeVisible();
  await home(page);
  await expect(page.locator('footer [title^="Versão"]')).toHaveText('v0.1.0');
  await page.getByRole('navigation').getByRole('button', { name: 'Partidas', exact: true }).click();
  await page.getByRole('button', { name: /Abrir Partida/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Placar Time A', exact: true })).toHaveValue(
    '21'
  );
  await home(page);
  await page.getByRole('button', { name: 'Atualizar app', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(page.locator('footer [title^="Versão"]')).toHaveText('v0.1.1');
  expect((await outbox(page)).queue).toEqual(pending);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('footer [title^="Versão"]')).toHaveText('v0.1.1');
  expect((await outbox(page)).queue).toEqual(pending);
});
