import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { home, outbox, pollCycle, seed } from './lifecycle.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`automatic sync skips unchanged writes, fetches remote changes and keeps a compact footer / ${theme}`, async ({
    page,
    backend,
    context,
  }, info) => {
    await seed(page, backend, ['André', 'Lana'], theme);
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    page.on('request', (request) => {
      if (/\/(command|state)$/.test(request.url()))
        requests.push({ url: request.url(), body: request.postDataJSON() });
    });
    const footer = page.getByTestId('sync-status');
    await expect(footer).toContainText('Última sync');
    await expect(page.getByRole('button', { name: 'Sincronizar', exact: true })).toHaveCount(0);
    await pollCycle(page);
    await expect.poll(() => requests.length).toBe(1);
    await expect.poll(async () => (await outbox(page)).lease).toBeNull();
    expect(requests[0].body).toEqual({ resource: 'players', limit: 1, offset: 0 });
    await backend.seedPlayers(['Remoto']);
    await pollCycle(page);
    await expect.poll(async () => (await outbox(page)).lease).toBeNull();
    await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remoto', exact: true })).toBeVisible();
    await home(page);
    expect(requests.filter((request) => request.url.endsWith('/command'))).toHaveLength(0);
    const version = page.locator('footer [title^="Versão"]');
    const versionBox = (await version.boundingBox())!;
    const statusBox = (await footer.boundingBox())!;
    expect(versionBox.x + versionBox.width).toBeLessThanOrEqual(statusBox.x);
    expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(
      (await page.evaluate(() => innerWidth)) - 24 + 1
    );
    await page.screenshot({ path: info.outputPath(`sync-${theme}.png`) });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const confirmed = await footer.getAttribute('title');
    backend.failReads = true;
    await pollCycle(page);
    await expect(footer).toContainText('Falha · última');
    expect(await footer.getAttribute('title')).toBe(confirmed);
    await page.screenshot({ path: info.outputPath(`sync-failure-${theme}.png`) });
    await context.setOffline(true);
    await expect(footer).toContainText('Offline · última');
    await page.screenshot({ path: info.outputPath(`sync-offline-${theme}.png`) });
    backend.failReads = false;
    await context.setOffline(false);
  });
}

test('local changes survive reload and wait five minutes; polling works away from Home', async ({
  page,
  backend,
}) => {
  await seed(page, backend);
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  await page.getByLabel('Nome do jogador').fill('Local');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Local', exact: true })).toBeVisible();
  const before = await outbox(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Local', exact: true })).toBeVisible();
  expect((await outbox(page)).queue).toEqual(before.queue);
  await page.clock.fastForward(290000);
  expect((await backend.players()).map((p) => p.name)).not.toContain('Local');
  await pollCycle(page);
  await expect.poll(async () => (await backend.players()).map((p) => p.name)).toContain('Local');
  await expect.poll(async () => (await outbox(page)).queue.length).toBe(0);
});
