import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = new URL('../output/browser/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
await page.addInitScript(() => { Math.random = () => .9; });
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);

try {
  const regressionPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  regressionPage.on('pageerror', error => errors.push(String(error)));
  regressionPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await regressionPage.addInitScript(() => { Math.random = () => .3; });
  await regressionPage.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await regressionPage.locator('#start-button').click();
  await regressionPage.evaluate(() => window.advanceTime(0));
  const allowedShapes = await regressionPage.evaluate(async () => {
    const { SHAPES } = await import('./engine.js');
    return SHAPES;
  });
  assert.equal(allowedShapes.length, 3);
  for (const shape of allowedShapes) {
    for (let index = 0; index < shape.points.length; index += 1) {
      const point = shape.points[index];
      const next = shape.points[(index + 1) % shape.points.length];
      const horizontal = Math.abs(next[0] - point[0]);
      const vertical = Math.abs(next[1] - point[1]);
      assert.ok(horizontal === 0 || vertical === 0 || horizontal === vertical);
    }
  }
  for (let turn = 0; turn < 4; turn += 1) {
    const current = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(current.mode, 'playing');
    assert.ok(current.active.vertices.flat().every(Number.isInteger));
    await regressionPage.keyboard.press('ArrowUp');
    await regressionPage.evaluate(milliseconds => window.advanceTime(milliseconds), current.timer * 1000 + 1);
    const placed = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(placed.placed, turn + 1);
    assert.equal(placed.mode, 'playing');
    assert.ok(placed.settled.every(existing => existing.vertices.flat().every(Number.isInteger)));
  }
  await regressionPage.screenshot({ path: new URL('whole-grid-timeout-stack.png', output).pathname, fullPage: true });

  await regressionPage.reload({ waitUntil: 'networkidle' });
  await regressionPage.evaluate(async () => {
    const { Game } = await import('./engine.js');
    const originalStart = Game.prototype.start;
    Game.prototype.start = function () {
      originalStart.call(this);
      this.settled = [
        { id: 2, points: [[0, 10], [2, 10], [0, 12]] },
        { id: 0, points: [[5, 20], [4, 20], [4, 19]] },
      ];
      this.queue = [2, 0, 1];
      this.spawn();
    };
  });
  await regressionPage.locator('#start-button').click();
  await regressionPage.evaluate(() => window.advanceTime(0));
  const aboveStack = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(aboveStack.active.x, 4);
  assert.equal(Math.max(...aboveStack.active.vertices.map(vertex => vertex[1])), 9);
  await regressionPage.keyboard.press('c');
  const heldAboveStack = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(heldAboveStack.held, 2);
  assert.equal(heldAboveStack.active.family, 0);
  assert.equal(Math.max(...heldAboveStack.active.vertices.map(vertex => vertex[1])), 9);
  assert.equal(heldAboveStack.timer, aboveStack.timer);
  await regressionPage.screenshot({ path: new URL('spawn-above-global-stack.png', output).pathname, fullPage: true });

  await regressionPage.reload({ waitUntil: 'networkidle' });
  await regressionPage.evaluate(async () => {
    const { Game } = await import('./engine.js');
    const originalStart = Game.prototype.start;
    Game.prototype.start = function () {
      originalStart.call(this);
      this.settled = [
        { id: 0, points: [[0, 17], [1, 17], [0, 18]] },
        { id: 0, points: [[1, 17], [1, 18], [0, 18]] },
        { id: 2, points: [[1, 18], [3, 18], [1, 20]] },
        { id: 2, points: [[3, 18], [3, 20], [1, 20]] },
      ];
      this.active = { id: 1, points: [[1, 0], [0, 1], [1, 2]], x: 0, y: 17 };
    };
  });
  await regressionPage.locator('#start-button').click();
  await regressionPage.evaluate(() => window.advanceTime(0));
  const pocketBefore = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(pocketBefore.active.legal, false);
  await regressionPage.keyboard.press('ArrowDown');
  const pocketReady = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(pocketReady.active.x, 0);
  assert.equal(pocketReady.active.y, 18);
  assert.equal(pocketReady.active.legal, true);
  assert.ok(pocketReady.active.automaticY < pocketReady.active.y);
  await regressionPage.screenshot({ path: new URL('bottom-left-pocket-ready.png', output).pathname, fullPage: true });
  await regressionPage.keyboard.press('Space');
  const pocketPlaced = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(pocketPlaced.placed, 1);
  assert.equal(pocketPlaced.mode, 'playing');
  assert.deepEqual(pocketPlaced.settled[4].vertices, [[1, 18], [0, 19], [1, 20]]);
  assert.equal(Number.isInteger(pocketPlaced.active.y), true);
  await regressionPage.screenshot({ path: new URL('bottom-left-pocket-placed.png', output).pathname, fullPage: true });

  const supportedResults = [];
  for (const scenario of ['Space', 'timeout', 'floor', 'legal-side']) {
    await regressionPage.reload({ waitUntil: 'networkidle' });
    await regressionPage.evaluate(async scenario => {
      const { Game } = await import('./engine.js');
      const originalStart = Game.prototype.start;
      Game.prototype.start = function () {
        originalStart.call(this);
        const addSquare = (left, top) => {
          this.settled.push({ id: 2, points: [[left, top], [left + 2, top], [left, top + 2]] });
          this.settled.push({ id: 2, points: [[left + 2, top + 2], [left + 2, top], [left, top + 2]] });
        };
        for (let top = 6; top < 20; top += 2) addSquare(2, top);
        if (scenario !== 'floor') {
          addSquare(4, 16);
          addSquare(4, 18);
        }
        this.active = { id: 2, points: [[0, 0], [2, 0], [0, 2]], x: 4, y: scenario === 'legal-side' ? 7 : 2 };
      };
    }, scenario);
    await regressionPage.locator('#start-button').click();
    await regressionPage.evaluate(() => window.advanceTime(0));
    const before = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(before.active.legal, scenario === 'legal-side');
    assert.equal(before.active.automaticY, scenario === 'floor' ? 18 : 14);
    if (scenario === 'Space') await regressionPage.screenshot({ path: new URL('supported-fallback-preview.png', output).pathname, fullPage: true });
    if (scenario === 'timeout') await regressionPage.evaluate(milliseconds => window.advanceTime(milliseconds), before.timer * 1000 + 1);
    else await regressionPage.keyboard.press('Space');
    const after = await regressionPage.evaluate(() => JSON.parse(window.render_game_to_text()));
    const expectedY = scenario === 'legal-side' ? 7 : before.active.automaticY;
    assert.equal(after.mode, 'playing');
    assert.equal(after.placed, 1);
    assert.deepEqual(after.settled.at(-1).vertices, [[4, expectedY], [6, expectedY], [4, expectedY + 2]]);
    assert.equal(after.timeLimit, 9.95);
    supportedResults.push({ scenario, before, after });
    if (scenario === 'Space') await regressionPage.screenshot({ path: new URL('supported-fallback-placed.png', output).pathname, fullPage: true });
  }
  await writeFile(new URL('supported-fallback-state.json', output), JSON.stringify(supportedResults, null, 2));
  await regressionPage.close();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  assert.equal((await state()).mode, 'ready');
  assert.equal((await state()).timer, 10);
  assert.equal(await page.locator('#timer-value').textContent(), '10.0');
  assert.equal(await page.locator('#next-list li').count(), 3);
  const theme = await page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    panel: getComputedStyle(document.querySelector('.panel')).backgroundColor,
    dialog: getComputedStyle(document.querySelector('dialog')).backgroundColor,
    browserColor: document.querySelector('meta[name="theme-color"]').content,
  }));
  assert.deepEqual(theme, { scheme: 'dark', background: 'rgb(17, 26, 22)', text: 'rgb(237, 242, 232)', panel: 'rgb(27, 40, 33)', dialog: 'rgb(27, 40, 33)', browserColor: '#111a16' });
  await page.screenshot({ path: new URL('desktop-ready.png', output).pathname, fullPage: true });
  await page.keyboard.press('Enter');
  await advance(0);
  const initial = await state();
  assert.equal(initial.mode, 'playing');
  assert.equal(initial.active.legal, false);
  assert.equal(Math.max(...initial.active.vertices.map(vertex => vertex[1])), 19);
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state()).active.x, initial.active.x - 1);
  await page.keyboard.press('ArrowRight');
  assert.equal((await state()).active.x, initial.active.x);
  await page.keyboard.press('ArrowDown');
  assert.equal((await state()).active.y, initial.active.y + 1);
  assert.equal((await state()).active.legal, true);

  const beforeRotate = (await state()).active;
  await page.keyboard.press('w');
  const afterRotate = (await state()).active;
  assert.equal(afterRotate.family, beforeRotate.family);
  const expectedRotation = await page.evaluate(async vertices => {
    const { normalize, rotate } = await import('./engine.js');
    return rotate(normalize(vertices));
  }, beforeRotate.vertices);
  assert.deepEqual(afterRotate.vertices.map(([horizontal, vertical]) => [horizontal - afterRotate.x, vertical - afterRotate.y]), expectedRotation);
  await page.keyboard.press('ArrowUp');
  assert.deepEqual((await state()).active.vertices, beforeRotate.vertices);
  const beforeShift = (await state()).active;
  await page.keyboard.press('Shift');
  assert.deepEqual((await state()).active, beforeShift);

  await advance(1200);
  const beforeHold = await state();
  await page.keyboard.press('c');
  const held = await state();
  assert.equal(held.held, beforeHold.active.family);
  assert.equal(held.timer, beforeHold.timer);
  assert.equal(held.holdUsed, true);
  await page.keyboard.press('c');
  assert.equal((await state()).active.family, held.active.family);
  assert.equal(await page.locator('#hold-preview svg').count(), 1);
  assert.equal(held.active.family, 1);
  await page.keyboard.press('w');
  await page.keyboard.press('w');
  assert.equal((await state()).active.legal, false);
  const beforeSpace = await state();
  await page.keyboard.press('Space');
  const resolved = await state();
  assert.equal(resolved.placed, 1);
  assert.equal(resolved.timeLimit, 9.95);
  assert.equal(Math.min(...resolved.settled[0].vertices.map(vertex => vertex[0])), beforeSpace.active.x);
  assert.equal(Math.min(...resolved.settled[0].vertices.map(vertex => vertex[1])), beforeSpace.active.automaticY);
  assert.equal(resolved.holdUsed, false);

  await page.keyboard.press('p');
  const paused = await state();
  assert.equal(paused.mode, 'paused');
  await advance(8000);
  assert.equal((await state()).timer, paused.timer);
  await page.keyboard.press('p');
  assert.equal((await state()).mode, 'playing');
  await page.locator('#help-button').click();
  assert.equal(await page.locator('#help-dialog').evaluate(dialog => dialog.open), true);
  await page.screenshot({ path: new URL('desktop-help.png', output).pathname, fullPage: true });
  assert.equal((await state()).mode, 'paused');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  assert.equal((await state()).mode, 'playing');
  await page.locator('#pause-button').click();
  assert.equal((await state()).mode, 'paused');
  await page.locator('#start-button').click();
  assert.equal((await state()).mode, 'playing');

  for (let index = 0; index < 8; index += 1) {
    const current = await state();
    if (current.mode !== 'playing') break;
    const destination = await page.evaluate(async ({ current, preferred }) => {
      const { highestPlacement } = await import('./engine.js');
      const active = { id: current.active.family, x: current.active.x, y: current.active.y, points: current.active.vertices.map(([horizontal, vertical]) => [horizontal - current.active.x, vertical - current.active.y]) };
      const settled = current.settled.map(existing => ({ id: existing.family, points: existing.vertices }));
      for (const horizontal of [preferred, 0, 2, 4, 6, 8, 1, 3, 5, 7]) {
        const candidate = highestPlacement({ ...active, x: horizontal }, settled);
        if (candidate && candidate.y > 0) return horizontal;
      }
      return active.x;
    }, { current, preferred: [0, 2, 6, 8, 1, 7, 3, 5][index] });
    for (let steps = Math.abs(destination - current.active.x); steps > 0; steps -= 1) await page.keyboard.press(destination < current.active.x ? 'ArrowLeft' : 'ArrowRight');
    await advance(current.timer * 1000 + 1);
  }
  assert.equal((await state()).mode, 'playing');
  await page.screenshot({ path: new URL('desktop-gameplay.png', output).pathname, fullPage: true });
  await writeFile(new URL('gameplay-state.json', output), JSON.stringify(await state(), null, 2));
  for (let index = 0; index < 80 && (await state()).mode === 'playing'; index += 1) {
    const current = await state();
    await advance(current.timer * 1000 + 1);
  }
  assert.equal((await state()).mode, 'over');
  assert.match((await state()).endReason, /top|column/);
  await page.screenshot({ path: new URL('desktop-over.png', output).pathname, fullPage: true });
  const finalScore = (await state()).score;
  await page.keyboard.press('Enter');
  assert.equal((await state()).mode, 'playing');
  assert.equal((await state()).placed, 0);
  assert.equal((await state()).score, 0);
  assert.equal(Number(await page.locator('#best-value').textContent()), finalScore);

  await page.setViewportSize({ width: 1280, height: 800 });
  const boardBottom = await page.locator('#board').evaluate(board => board.getBoundingClientRect().bottom);
  assert.ok(boardBottom <= 800);
  await page.screenshot({ path: new URL('desktop-compact.png', output).pathname, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#start-button').click();
  await advance(0);
  const mobileStart = await state();
  const touchTheme = await page.evaluate(() => {
    const movement = getComputedStyle(document.querySelector('[data-action="left"]'));
    const place = getComputedStyle(document.querySelector('[data-action="place"]'));
    return { movement: movement.backgroundColor, movementText: movement.color, place: place.backgroundColor, placeText: place.color };
  });
  assert.deepEqual(touchTheme, { movement: 'rgb(36, 54, 43)', movementText: 'rgb(237, 242, 232)', place: 'rgb(212, 237, 135)', placeText: 'rgb(39, 60, 44)' });
  await page.locator('[data-action="left"]').click();
  assert.equal((await state()).active.x, mobileStart.active.x - 1);
  await page.locator('[data-action="right"]').click();
  await page.locator('[data-action="down"]').click();
  await page.locator('[data-action="rotate"]').click();
  await page.locator('[data-action="rotateCounterclockwise"]').click();
  await page.locator('[data-action="hold"]').click();
  assert.equal((await state()).holdUsed, true);
  const beforeTouchPlace = await state();
  assert.equal(beforeTouchPlace.active.legal, false);
  await page.locator('[data-action="place"]').click();
  const afterTouchPlace = await state();
  assert.equal(afterTouchPlace.placed, 1);
  assert.equal(Math.min(...afterTouchPlace.settled[0].vertices.map(vertex => vertex[0])), beforeTouchPlace.active.x);
  assert.equal(Math.min(...afterTouchPlace.settled[0].vertices.map(vertex => vertex[1])), beforeTouchPlace.active.automaticY);
  await page.screenshot({ path: new URL('mobile-gameplay.png', output).pathname, fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: three allowed triangle families, left/right/down movement, both rotation directions, inactive Shift, slower timer, bottom-left pocket placement, keyboard/touch controls, hold, legality, queue, pause, help, game over, restart, saved best, responsive layout.');
} finally {
  await writeFile(new URL('errors.json', output), JSON.stringify(errors, null, 2));
  await browser.close();
}
