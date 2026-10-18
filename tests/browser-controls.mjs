import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = new URL('../output/controls/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = milliseconds => page.evaluate(value => window.advanceTime(value), milliseconds);

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { Game, SHAPES } = await import('./engine.js');
    const originalStart = Game.prototype.start;
    Game.prototype.start = function () {
      originalStart.call(this);
      this.active = { id: 1, points: SHAPES[1].points.map(point => [...point]), x: 4, y: 8 };
    };
  });
  await page.locator('#start-button').click();
  await advance(0);
  assert.equal((await state()).active.y, 8);

  await page.keyboard.down('ArrowLeft');
  assert.equal((await state()).active.x, 3);
  await advance(99);
  assert.equal((await state()).active.x, 3);
  await advance(1);
  assert.equal((await state()).active.x, 2);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', repeat: true })));
  assert.equal((await state()).active.x, 2);
  await page.keyboard.up('ArrowLeft');
  await advance(300);
  assert.equal((await state()).active.x, 2);

  await page.keyboard.down('ArrowRight');
  assert.equal((await state()).active.x, 3);
  await advance(100);
  assert.equal((await state()).active.x, 4);
  await advance(100);
  assert.equal((await state()).active.x, 5);
  await page.keyboard.up('ArrowRight');

  await page.keyboard.down('ArrowDown');
  assert.equal((await state()).active.y, 9);
  await advance(100);
  assert.equal((await state()).active.y, 10);
  await advance(100);
  assert.equal((await state()).active.y, 11);
  await page.keyboard.up('ArrowDown');

  const beforeRotation = (await state()).active;
  await page.keyboard.down('ArrowUp');
  const rotated = (await state()).active;
  assert.equal(rotated.y, beforeRotation.y);
  assert.equal(rotated.x, beforeRotation.x);
  const expected = await page.evaluate(async vertices => {
    const { normalize, rotateCounterclockwise } = await import('./engine.js');
    return rotateCounterclockwise(normalize(vertices));
  }, beforeRotation.vertices);
  assert.deepEqual(rotated.vertices.map(([horizontal, vertical]) => [horizontal - rotated.x, vertical - rotated.y]), expected);
  await advance(400);
  assert.deepEqual((await state()).active.vertices, rotated.vertices);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('w');
  assert.deepEqual((await state()).active.vertices, beforeRotation.vertices);
  await page.keyboard.press('ShiftLeft');
  await page.keyboard.press('ShiftRight');
  assert.deepEqual((await state()).active.vertices, beforeRotation.vertices);
  assert.equal(await page.locator('[data-action="flip"], [data-action="up"]').count(), 0);

  await page.keyboard.down('ArrowLeft');
  await page.keyboard.press('p');
  const paused = await state();
  await advance(1000);
  assert.deepEqual((await state()).active, paused.active);
  assert.equal((await state()).timer, paused.timer);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('p');
  await advance(200);
  assert.deepEqual((await state()).active.vertices, paused.active.vertices);

  await page.keyboard.down('ArrowRight');
  const beforeBlur = (await state()).active;
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await advance(300);
  assert.deepEqual((await state()).active, beforeBlur);
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: new URL('desktop-controls.png', output).pathname, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const downButton = page.locator('[data-action="down"]');
  await downButton.scrollIntoViewIfNeeded();
  const downBox = await downButton.boundingBox();
  const beforeTouch = (await state()).active.y;
  await page.mouse.move(downBox.x + downBox.width / 2, downBox.y + downBox.height / 2);
  await page.mouse.down();
  assert.equal((await state()).active.y, beforeTouch + 1);
  await advance(100);
  assert.equal((await state()).active.y, beforeTouch + 2);
  await page.mouse.up();
  await advance(200);
  assert.equal((await state()).active.y, beforeTouch + 2);
  await page.screenshot({ path: new URL('mobile-controls.png', output).pathname, fullPage: true });

  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { Game } = await import('./engine.js');
    const originalStart = Game.prototype.start;
    Game.prototype.start = function () {
      originalStart.call(this);
      this.settled = [
        { id: 0, points: [[0, 19], [9, 19], [9, 20], [0, 20]] },
        { id: 0, points: [[9, 19], [10, 19], [9, 20]] },
      ];
      this.active = { id: 0, x: 9, y: 19, points: [[1, 1], [1, 0], [0, 1]] };
    };
  });
  await page.locator('#start-button').click();
  await advance(0);
  await page.keyboard.press('Space');
  assert.equal((await state()).lines, 1);
  assert.equal((await state()).score, 105);
  assert.equal((await state()).timeLimit, 9.95);
  assert.equal(await page.locator('#board-toast').evaluate(toast => toast.classList.contains('visible')), false);
  assert.equal(await page.locator('#board-toast').textContent(), '');
  await page.screenshot({ path: new URL('quiet-row-clear.png', output).pathname, fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Control regressions passed: immediate movement, uniform 100ms repeats without native-key repeats, release/blur/pause cleanup, both rotations, inactive Shift, touch hold, slower timer, and quiet row clears.');
} finally {
  await writeFile(new URL('errors.json', output), JSON.stringify(errors, null, 2));
  await browser.close();
}
