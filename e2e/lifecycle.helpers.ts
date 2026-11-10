import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import type { Backend } from './support/backend';
export const apiUrl = 'https://xejuimptprhvrjohhqyn.supabase.co/functions/v1/volley-api';
export async function seed(
  page: Page,
  backend: Backend,
  names = ['André', 'Lana'],
  theme: 'light' | 'dark' = 'light'
) {
  const players = await backend.seedPlayers(names);
  await page.addInitScript(
    ({ theme }) => {
      if (!localStorage.getItem('e2e-preferences')) {
        localStorage.setItem(
          'volley-preferences-v1',
          JSON.stringify({ theme, fontSize: 'standard' })
        );
        localStorage.setItem('e2e-preferences', 'true');
      }
    },
    { theme }
  );
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
  return players;
}
export async function prepare(page: Page, names = ['André', 'Lana']) {
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  for (const name of names) {
    const chip = page.getByRole('button', { name, exact: true });
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  }
  await page.getByRole('button', { name: 'Sortear times', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Times definidos' })).toBeVisible();
}
export async function start(page: Page, names = ['André', 'Lana']) {
  await prepare(page, names);
  await page.getByRole('button', { name: 'Iniciar partida', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Placar Time A', exact: true })).toBeVisible();
}
export async function score(page: Page, a = '21', b = '18') {
  await page.getByRole('spinbutton', { name: 'Placar Time A', exact: true }).fill(a);
  await page.getByRole('spinbutton', { name: 'Placar Time B', exact: true }).fill(b);
}
export async function finish(page: Page) {
  await page.getByRole('button', { name: 'Finalizar partida', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar e finalizar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Partida finalizada', exact: true })
  ).toBeVisible();
}
export async function home(page: Page) {
  for (
    let i = 0;
    i < 3 && !(await page.getByRole('heading', { name: 'Bora pra areia?' }).isVisible());
    i++
  )
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
}
export async function synchronized(page: Page) {
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(page.getByText('Tudo sincronizado', { exact: true })).toBeVisible();
}
export async function outbox(page: Page): Promise<{
  queue: Array<{ request_id: string; input: Record<string, unknown> }>;
  [key: string]: unknown;
}> {
  return page.evaluate(
    async (scope) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('volley-lifecycle-v2', 1);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('states').objectStore('states').get(scope);
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
        request.onerror = () => reject(request.error);
      }),
    apiUrl
  );
}
