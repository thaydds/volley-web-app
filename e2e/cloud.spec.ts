import { expect, test } from './fixtures';
import {
  seed,
  start,
  score,
  finish,
  home,
  synchronized,
  outbox,
  apiUrl,
} from './lifecycle.helpers';

test('offline create/start/score/finalize survive reload and sync dependencies without duplicates', async ({
  page,
  context,
  backend,
}) => {
  await seed(page, backend);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  await page.getByLabel('Nome do jogador').fill('Nova pessoa');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nova pessoa', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await start(page, ['André', 'Lana', 'Nova pessoa']);
  await score(page, '21', '18');
  await expect(page.getByRole('button', { name: 'Salvar placar', exact: true })).toHaveCount(0);
  await finish(page);
  const before = await outbox(page);
  expect(before.queue.map((c) => (c as { operation?: string }).operation)).toEqual([
    'create_player',
    'start_match',
    'finish_match',
  ]);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Partida finalizada', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByText('Finalizada · sincronização pendente', { exact: true })).toHaveCount(
    2
  );
  expect((await backend.matches()).length).toBe(0);
  await context.setOffline(false);
  await page.waitForTimeout(150);
  expect((await backend.matches()).length).toBe(0);
  await home(page);
  await synchronized(page);
  expect((await backend.matches()).length).toBe(1);
  expect((await backend.players()).length).toBe(3);
  expect((await outbox(page)).queue).toEqual([]);
});

test('lost acknowledgement replays the identical operation after session recreation', async ({
  page,
  backend,
}) => {
  await seed(page, backend);
  await start(page);
  await score(page);
  await expect(page.getByRole('button', { name: 'Salvar placar', exact: true })).toHaveCount(0);
  await finish(page);
  await home(page);
  const requests = (await outbox(page)).queue.map((c) => c.request_id);
  backend.dropNextWrite = true;
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await backend.matches()).length).toBe(1);
  expect((await outbox(page)).queue.map((c) => c.request_id)).toEqual(requests);
  await page.evaluate(
    (url) => localStorage.removeItem('volley-cloud-session-v1:' + encodeURIComponent(url)),
    apiUrl
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
  await synchronized(page);
  expect((await backend.matches()).length).toBe(1);
  expect((await backend.matches())[0]).toMatchObject({ status: 'finished', score_a: 21 });
  expect((await outbox(page)).queue).toEqual([]);
});

test('two independent devices retain a conflict until explicit review, never overwrite another score', async ({
  page,
  browser,
  backend,
  baseURL,
}) => {
  await seed(page, backend);
  await start(page);
  await home(page);
  await synchronized(page);
  const other = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  await backend.route(other);
  const second = await other.newPage();
  try {
    await second.goto('./');
    await expect(second.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
    for (const p of [page, second]) {
      await p
        .getByRole('navigation')
        .getByRole('button', { name: 'Partidas', exact: true })
        .click();
      await p.getByRole('button', { name: /Abrir Partida/ }).focus();
      await p.keyboard.press('Enter');
      await expect(p.getByRole('spinbutton', { name: 'Placar Time A', exact: true })).toBeVisible();
    }
    await score(page, '21', '18');
    await finish(page);
    await home(page);
    await synchronized(page);
    await score(second, '25', '19');
    await finish(second);
    await home(second);
    await second.getByRole('button', { name: 'Sincronizar', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Revisar conflito' })).toBeVisible();
    expect((await outbox(second)).queue).toHaveLength(1);
    expect((await backend.matches())[0]).toMatchObject({ score_a: 21, score_b: 18 });
    await second.reload();
    await expect(second.getByRole('button', { name: 'Revisar conflito' })).toBeVisible();
    await second.getByRole('button', { name: 'Revisar conflito' }).click();
    await second
      .getByRole('dialog')
      .getByRole('button', { name: /Usar servidor e descartar 1/ })
      .click();
    await expect(second.getByRole('dialog')).toHaveCount(0);
    expect((await outbox(second)).queue).toHaveLength(0);
    expect((await backend.matches())[0]).toMatchObject({ score_a: 21, score_b: 18 });
  } finally {
    await other.close();
  }
});

test('a failed refresh preserves cached data and a storage failure never acknowledges a local operation', async ({
  page,
  backend,
}) => {
  await seed(page, backend);
  backend.failReads = true;
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  await expect(page.getByRole('button', { name: 'André', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, 'restorePut', {
      value: () => {
        IDBObjectStore.prototype.put = original;
      },
    });
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('test-only quota injection', 'QuotaExceededError');
    };
  });
  await page.getByLabel('Nome do jogador').fill('Quota test');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível guardar');
  await expect(page.getByLabel('Nome do jogador')).toHaveValue('Quota test');
  expect((await outbox(page)).queue).toEqual([]);
  await page.evaluate(() => {
    (Reflect.get(window, 'restorePut') as () => void)();
  });
});

test('lost deactivation acknowledgement persists no authorization word and replays its receipt after reload', async ({
  page,
  backend,
}) => {
  const players = await seed(page, backend);
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  await page.getByRole('button', { name: 'Desativar André', exact: true }).click();
  backend.dropNextWrite = true;
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Palavra-chave de autorização').fill(backend.testAuthorizationWord);
  await dialog.getByRole('button', { name: 'Desativar jogador', exact: true }).click();
  await expect(dialog.getByText(/Não foi possível confirmar/)).toBeVisible();
  const pending = await outbox(page);
  expect(JSON.stringify(pending)).not.toContain(backend.testAuthorizationWord);
  expect(pending.deactivation).toMatchObject({
    input: { id: players[0].id, version: 1 },
    uncertain: true,
  });
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    backend.testAuthorizationWord
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sincronizar', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
  await page.getByLabel('Nome do jogador').fill('Must wait for deactivation');
  await expect(page.getByRole('button', { name: 'Adicionar', exact: true })).toBeDisabled();
  await home(page);
  await page.getByRole('button', { name: 'Revisar desativação pendente' }).click();
  await expect(page.getByLabel('Palavra-chave de autorização')).toHaveValue('');
  await page.getByLabel('Palavra-chave de autorização').fill(backend.testAuthorizationWord);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Desativar jogador', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await outbox(page)).deactivation).toBeNull();
  expect((await backend.players()).find((p) => p.id === players[0].id)).toMatchObject({
    version: 2,
  });
});

test('provisional scores stay in their tab; legacy updates require review and sync lease remains shared', async ({
  page,
  context,
  backend,
}) => {
  await seed(page, backend);
  await start(page);
  await home(page);
  await synchronized(page);
  const second = await context.newPage();
  let release = () => {};
  try {
    await second.goto('./');
    await expect(second.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
    for (const p of [page, second]) {
      await p
        .getByRole('navigation')
        .getByRole('button', { name: 'Partidas', exact: true })
        .click();
      await p.getByRole('button', { name: /Abrir Partida/ }).focus();
      await p.keyboard.press('Enter');
    }
    await score(page, '21', '18');
    await score(second, '25', '19');
    expect((await backend.matches())[0]).toMatchObject({ score_a: null, score_b: null });
    expect((await outbox(page)).queue).toEqual([]);
    await home(page);
    await synchronized(page);
    expect((await backend.matches())[0]).toMatchObject({ score_a: null, score_b: null });
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Partidas', exact: true })
      .click();
    await page.getByRole('button', { name: /Abrir Partida/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('spinbutton', { name: 'Placar Time A', exact: true })).toHaveValue(
      '21'
    );
    const game = (await backend.matches())[0];
    await backend.command('save_score', { id: game.id, version: 1, score_a: 20, score_b: 18 });
    await home(second);
    await synchronized(second);
    await second
      .getByRole('navigation')
      .getByRole('button', { name: 'Partidas', exact: true })
      .click();
    await second.getByRole('button', { name: /Abrir Partida/ }).focus();
    await second.keyboard.press('Enter');
    await expect(second.getByRole('alert')).toContainText('Revise o placar');
    await expect(
      second.getByRole('spinbutton', { name: 'Placar Time A', exact: true })
    ).toHaveValue('25');
    await second.getByRole('button', { name: 'Usar placar atual' }).click();
    await expect(
      second.getByRole('spinbutton', { name: 'Placar Time A', exact: true })
    ).toHaveValue('20');
    await home(page);
    await page.getByRole('button', { name: 'Preparar nova partida', exact: true }).click();
    await page.getByLabel('Nome do jogador').fill('Lease player');
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Lease player', exact: true })).toBeVisible();
    await home(page);
    await home(second);
    backend.writeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Sincronizar', exact: true })).toBeDisabled();
    release();
    backend.writeGate = null;
    await expect(page.getByText('Tudo sincronizado', { exact: true })).toBeVisible();
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Partidas', exact: true })
      .click();
    await page.getByRole('button', { name: /Abrir Partida/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('spinbutton', { name: 'Placar Time A', exact: true })).toHaveValue(
      '20'
    );
  } finally {
    release();
    backend.writeGate = null;
    await second.close();
  }
});

test('corrupt local journal is preserved and exportable, never replaced by an empty state', async ({
  page,
  backend,
}) => {
  await seed(page, backend);
  const corrupt = { schema: 2, base: 'damaged', queue: [{ request_id: 'preserve-this-record' }] };
  await page.evaluate(
    async ({ scope, value }) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('volley-lifecycle-v2', 1);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('states', 'readwrite');
          tx.objectStore('states').put(value, scope);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { scope: apiUrl, value: corrupt }
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('recuperação');
  expect(await outbox(page)).toEqual(corrupt);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup local' }).click();
  const file = await (await download).createReadStream();
  let text = '';
  for await (const chunk of file!) text += chunk;
  expect(JSON.parse(text).state).toEqual(corrupt);
  expect(text).not.toContain('access_token');
  expect(text).not.toContain('refresh_token');
});

test('legacy import preserves the original and historical winner without inventing scores or duplicates', async ({
  page,
  backend,
}) => {
  const original = JSON.stringify({
    players: [
      { name: 'André', present: false },
      { name: 'Lana', present: false },
    ],
    matches: [{ number: 7, date: '09/11/2026', teamA: ['André'], teamB: ['Lana'], winner: 'A' }],
  });
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('volley-v1')) localStorage.setItem('volley-v1', raw);
  }, original);
  await seed(page, backend);
  await page.getByRole('navigation').getByRole('button', { name: 'Ajustes' }).click();
  await page
    .getByRole('button', { name: 'Importar histórico deste aparelho', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('2 jogadores e 1 partidas válidas');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await backend.matches()).toMatchObject([
    { status: 'finished', winner: 'A', score_a: null, score_b: null },
  ]);
  expect(await page.evaluate(() => localStorage.getItem('volley-v1'))).toBe(original);
  await page
    .getByRole('button', { name: 'Importar histórico deste aparelho', exact: true })
    .click();
  await page.getByTestId('import-confirm').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await backend.matches()).toHaveLength(1);
});

test('v1 uncertain intents recover only accepted receipts; unknown requests stay preserved', async ({
  page,
  backend,
}) => {
  const acceptedId = crypto.randomUUID();
  const unknownId = crypto.randomUUID();
  await backend.mutate('create_player', { name: 'Already accepted' }, acceptedId);
  const pending = [
    {
      request_id: acceptedId,
      action: 'mutate',
      operation: 'create_player',
      input: { name: 'Already accepted' },
    },
    {
      request_id: unknownId,
      action: 'mutate',
      operation: 'archive_match',
      input: { id: crypto.randomUUID(), version: 1 },
    },
  ];
  await page.addInitScript(
    ({ url, pending }) => {
      const key = 'volley-cloud-pending-v1:' + encodeURIComponent(url);
      if (!localStorage.getItem('seeded-v1')) {
        localStorage.setItem(key, JSON.stringify(pending));
        localStorage.setItem('seeded-v1', 'true');
      }
    },
    { url: apiUrl, pending }
  );
  await seed(page, backend);
  await page.getByRole('button', { name: 'Verificar envios antigos' }).click();
  await expect(page.getByRole('alert')).toContainText('envio antigo');
  expect((await outbox(page)).legacyPending).toEqual([pending[1]]);
  expect(await backend.players()).toHaveLength(3);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Verificar envios antigos' })).toBeVisible();
  expect((await outbox(page)).legacyPending).toEqual([pending[1]]);
  expect(await backend.matches()).toEqual([]);
});

test('offline v1 cache preserves archived unfinished games as read-only, without inventing archive dates', async ({
  page,
  backend,
}) => {
  const [a, b] = await backend.seedPlayers(['André', 'Lana']);
  const archived = {
    id: crypto.randomUUID(),
    number: 1,
    version: 1,
    played_on: '2026-11-09',
    winner: null,
    participants: [
      { player_id: a.id, name: a.name, side: 'A', position: 0 },
      { player_id: b.id, name: b.name, side: 'B', position: 1 },
    ],
  };
  const cache = {
    players: [a, b],
    matches: [],
    archived: [archived],
    ranking: [],
    syncedAt: '2026-11-09T12:00:00Z',
  };
  await page.addInitScript(
    ({ url, cache }) =>
      localStorage.setItem(
        'volley-cloud-cache-v1:' + encodeURIComponent(url),
        JSON.stringify(cache)
      ),
    { url: apiUrl, cache }
  );
  backend.failReads = true;
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Bora pra areia?' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: /Histórico arquivado anterior/ }).click();
  await page.getByRole('button', { name: 'Em andamento', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: /Abrir Partida/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finalizar partida', exact: true })).toHaveCount(0);
  // Reading the legacy seed need not create a new IDB record. The original is durable.
  expect(await outbox(page)).toBeUndefined();
  expect(
    JSON.parse(
      (await page.evaluate(
        (url) => localStorage.getItem('volley-cloud-cache-v1:' + encodeURIComponent(url)),
        apiUrl
      ))!
    )
  ).toEqual(cache);
});
