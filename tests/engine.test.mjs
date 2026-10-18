import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SHAPES, WIDTH, HEIGHT, area, bounds, rotate, rotateCounterclockwise, flip, shapeKey, worldPoints, polygonsOverlap, legalPlacement, highestPlacement, clearRows } from '../dist/engine.js';

const triangle = [[0, 0], [2, 0], [0, 2]];
const piece = (x = 0, y = 18, points = triangle) => ({ id: 0, points, x, y });
const rectangle = (left, top, right, bottom) => ({ id: 0, points: [[left, top], [right, top], [right, bottom], [left, bottom]] });

test('horizontal, vertical, and 45-degree edges produce exactly three uniquely colored families', () => {
  const boundary = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  const keys = new Set();
  let count = 0;
  for (let first = 0; first < 6; first += 1) {
    for (let second = first + 1; second < 7; second += 1) {
      for (let third = second + 1; third < 8; third += 1) {
        const points = [boundary[first], boundary[second], boundary[third]];
        if (area(points) === 0) continue;
        count += 1;
        const allowed = points.every((point, index) => {
          const next = points[(index + 1) % points.length];
          const horizontal = next[0] - point[0];
          const vertical = next[1] - point[1];
          return horizontal === 0 || vertical === 0 || Math.abs(horizontal) === Math.abs(vertical);
        });
        if (allowed) keys.add(shapeKey(points));
      }
    }
  }
  assert.equal(count, 52);
  assert.equal(keys.size, 3);
  assert.equal(SHAPES.length, 3);
  assert.equal(new Set(SHAPES.map(shape => shape.color)).size, 3);
  assert.deepEqual(new Set(SHAPES.map(shape => shape.key)), keys);
  for (const shape of SHAPES) {
    let rotated = shape.points;
    for (let turn = 0; turn < 4; turn += 1) {
      assert.equal(shapeKey(rotated), shape.key);
      assert.equal(shapeKey(flip(rotated)), shape.key);
      rotated = rotate(rotated);
    }
    assert.deepEqual(rotated, shape.points);
    assert.deepEqual(flip(flip(shape.points)), shape.points);
  }
});

test('clockwise rotation and reflection across the vertical axis preserve grid geometry', () => {
  assert.deepEqual(rotate([[0, 0], [2, 0], [0, 1]]), [[1, 0], [1, 2], [0, 0]]);
  assert.deepEqual(flip([[0, 0], [2, 0], [0, 1]]), [[2, 0], [0, 0], [2, 1]]);
});

test('counterclockwise rotation is the inverse of clockwise for every piece', () => {
  assert.deepEqual(rotateCounterclockwise([[0, 0], [2, 0], [0, 1]]), [[0, 2], [0, 0], [1, 2]]);
  for (const shape of SHAPES) {
    assert.deepEqual(rotateCounterclockwise(rotate(shape.points)), shape.points);
    assert.deepEqual(rotate(rotateCounterclockwise(shape.points)), shape.points);
    assert.deepEqual(rotateCounterclockwise(shape.points), rotate(rotate(rotate(shape.points))));
  }
});

test('polygon collisions allow edge and point contact but reject interior overlap', () => {
  const complement = [[2, 2], [2, 0], [0, 2]];
  assert.equal(polygonsOverlap(triangle, complement), false);
  assert.equal(polygonsOverlap(triangle, complement, true), true);
  const vertexContact = triangle.map(([horizontal, vertical]) => [horizontal + 2, vertical]);
  assert.equal(polygonsOverlap(triangle, vertexContact), false);
  assert.equal(polygonsOverlap(triangle, vertexContact, true), true);
  assert.equal(polygonsOverlap(triangle, triangle), true);
  assert.equal(polygonsOverlap(triangle, triangle.map(([horizontal, vertical]) => [horizontal + .5, vertical + .5])), true);
  assert.equal(polygonsOverlap(triangle, triangle.map(([horizontal, vertical]) => [horizontal + 4, vertical]), true), false);
});

test('placement requires support below, no interior overlap, and board bounds', () => {
  assert.equal(legalPlacement(piece(), []), true);
  assert.equal(legalPlacement(piece(0, 17), []), false);
  assert.equal(legalPlacement(piece(-1), []), false);
  assert.equal(legalPlacement(piece(9), []), false);
  assert.equal(legalPlacement(piece(0, 19), []), false);
  const settled = [{ id: 0, points: worldPoints(piece()) }];
  assert.equal(legalPlacement(piece(0, 18), settled), false);
  assert.equal(legalPlacement(piece(2, 18), settled), true);
  assert.equal(legalPlacement(piece(0, 16), settled), true);
  assert.equal(legalPlacement(piece(0, 15), settled), false);
});

test('automatic position is the topmost supported contact and preserves x', () => {
  const settled = [rectangle(4, 10, 6, 11)];
  const automatic = highestPlacement(piece(4, 2), settled);
  assert.equal(automatic.x, 4);
  assert.equal(automatic.y, 8);
  assert.equal(highestPlacement(piece(8), []).y, 18);
  assert.equal(highestPlacement(piece(4), [rectangle(4, 0, 6, 20)]), null);
});

test('automatic placement skips sideways contact and lands on support below', () => {
  const wall = rectangle(2, 4, 4, 20);
  const active = piece(4, 1);
  assert.equal(legalPlacement({ ...active, y: 2 }, [wall]), false);
  assert.equal(highestPlacement(active, [wall]).y, 18);
  const platform = rectangle(4, 15, 6, 20);
  const supported = highestPlacement(active, [wall, platform]);
  assert.equal(supported.x, active.x);
  assert.deepEqual(supported.points, active.points);
  assert.equal(supported.y, 13);
});

test('automatic placement slides past a sideways vertex contact', () => {
  const settled = [{ id: 2, points: [[2, 8], [0, 6], [2, 6]] }];
  const active = piece(2, 1, [[0, 0], [2, 2], [0, 2]]);
  assert.equal(legalPlacement({ ...active, y: 4 }, settled), false);
  assert.equal(highestPlacement(active, settled).y, 18);
});

test('automatic placement accepts diagonal and point support that blocks downward motion', () => {
  const diagonal = [{ id: 2, points: [[6, 12], [6, 10], [4, 12]] }];
  assert.equal(highestPlacement(piece(4, 1), diagonal).y, 10);
  const ledge = [rectangle(3, 12, 7, 13)];
  assert.equal(highestPlacement(piece(4, 1), ledge).y, 10);
  const underCeiling = piece(4, 13);
  assert.equal(legalPlacement(underCeiling, ledge), false);
  assert.equal(polygonsOverlap(worldPoints({ ...underCeiling, y: 13.001 }), ledge[0].points), false);
});

test('automatic placement stays on full grid rows for all allowed orientations and column offsets', () => {
  const orientations = new Map();
  for (const shape of SHAPES) {
    for (const reflected of [shape.points, flip(shape.points)]) {
      let points = reflected;
      for (let turn = 0; turn < 4; turn += 1) {
        const key = JSON.stringify([...points].sort((first, second) => first[0] - second[0] || first[1] - second[1]));
        orientations.set(key, points);
        points = rotate(points);
      }
    }
  }
  for (const lower of orientations.values()) {
    for (const upper of orientations.values()) {
      for (const offset of [-1, 0, 1]) {
        const settled = [{ id: 0, points: worldPoints(piece(4, 20 - bounds(lower).bottom, lower)) }];
        const active = piece(4 + offset, 3, upper);
        const fallback = highestPlacement(active, settled);
        assert.ok(fallback, JSON.stringify({ lower, upper, offset }));
        assert.equal(fallback.x, active.x);
        assert.deepEqual(fallback.points, upper);
        assert.equal(Number.isInteger(fallback.y), true);
        assert.equal(legalPlacement(fallback, settled), true);
        const lowered = worldPoints({ ...fallback, y: fallback.y + .001 });
        assert.ok(bounds(lowered).bottom > HEIGHT || settled.some(existing => polygonsOverlap(lowered, existing.points)));
        for (let height = 0; height < fallback.y; height += 1) {
          assert.equal(legalPlacement({ ...active, y: height }, settled), false);
        }
      }
    }
  }
});

test('movement uses full grid units left, right, and down and rejects upward translation', () => {
  const game = new Game(() => .3);
  game.start();
  game.active = piece(4, 18, SHAPES[1].points);
  game.move(0, -1);
  assert.equal(game.active.y, 18);
  game.move(-1, 0);
  assert.equal(game.active.x, 3);
  game.move(1, 0);
  assert.equal(game.active.x, 4);
  game.move(0, 1);
  assert.equal(game.active.y, 19);
});

test('an allowed one-by-two triangle fits a bottom-left hole using a full-grid move', () => {
  const game = new Game(() => .3);
  game.start();
  game.settled = [rectangle(0, 17, 1, 18), rectangle(1, 18, 2, 20)];
  game.active = piece(0, 17, [[1, 0], [0, 1], [1, 2]]);
  assert.equal(legalPlacement(game.active, game.settled), false);
  assert.equal(legalPlacement({ ...game.active, y: 18 }, game.settled), true);
  game.move(0, 1);
  assert.equal(game.active.x, 0);
  assert.equal(game.active.y, 18);
  assert.equal(bounds(worldPoints(game.active)).bottom, HEIGHT);
  assert.equal(legalPlacement(game.active, game.settled), true);
  assert.equal(game.place(), true);
  assert.equal(game.placed, 1);
  assert.deepEqual(game.settled[2].points, [[1, 18], [0, 19], [1, 20]]);
});

test('floating-point drift cannot prevent a final move to the floor', () => {
  const game = new Game(() => .3);
  game.start();
  game.active = piece(0, 17.000000000000004, [[1, 0], [0, 1], [1, 2]]);
  game.move(0, 1);
  assert.equal(game.active.y, 18);
  assert.equal(bounds(worldPoints(game.active)).bottom, HEIGHT);
  assert.equal(legalPlacement(game.active, []), true);
});

test('fractional offsets stop exactly at horizontal and floor boundaries', () => {
  const game = new Game(() => .3);
  game.start();
  game.active = piece(.5, 17.5, [[1, 0], [0, 1], [1, 2]]);
  game.move(-1, 0);
  game.move(0, 1);
  assert.equal(game.active.x, 0);
  assert.equal(game.active.y, 18);
  game.active.x = 8.5;
  game.move(1, 0);
  assert.equal(game.active.x, 9);
  assert.equal(bounds(worldPoints(game.active)).right, WIDTH);
});

test('new and held pieces start on whole grid rows above allowed triangles', () => {
  const game = new Game(() => .3);
  game.start();
  game.settled = [{ id: 1, points: [[6, 19], [5, 20], [4, 19]] }];
  game.queue = [2, 0, 1];
  game.spawn();
  assert.equal(game.active.id, 2);
  assert.equal(game.active.y, 16);
  assert.equal(highestPlacement(game.active, game.settled).y, 17);
  game.held = 2;
  game.hold();
  assert.equal(game.active.y, 16);
  for (const shape of SHAPES) {
    const incoming = game.makePiece(shape.id);
    assert.equal(Number.isInteger(incoming.x), true);
    assert.equal(Number.isInteger(incoming.y), true);
  }
});

test('every piece spawns above the globally highest triangle even outside the spawn column', () => {
  const game = new Game(() => .3);
  game.start();
  game.settled = [
    { id: 2, points: [[0, 10], [2, 10], [0, 12]] },
    { id: 0, points: [[5, 20], [4, 20], [4, 19]] },
  ];
  for (const shape of SHAPES) {
    const incoming = game.makePiece(shape.id);
    assert.equal(incoming.x, 4);
    assert.equal(bounds(worldPoints(incoming)).bottom, 9);
    assert.equal(Number.isInteger(incoming.y), true);
    assert.ok(game.settled.every(existing => !polygonsOverlap(worldPoints(incoming), existing.points)));
  }
});

test('an empty board spawns pieces one grid row above the floor', () => {
  const game = new Game(() => .3);
  game.start();
  for (const shape of SHAPES) {
    const incoming = game.makePiece(shape.id);
    assert.equal(bounds(worldPoints(incoming)).bottom, HEIGHT - 1);
    assert.equal(legalPlacement(incoming, []), false);
  }
});

test('spawning near the top keeps the entire piece visible without ending the turn', () => {
  const game = new Game(() => .3);
  game.start();
  game.settled = [{ id: 2, points: [[0, 1], [2, 1], [0, 3]] }];
  game.queue = [2, 0, 1];
  game.spawn();
  assert.equal(game.active.y, 0);
  assert.ok(bounds(worldPoints(game.active)).bottom <= HEIGHT);
  assert.equal(game.mode, 'playing');
});

test('spawn height is recalculated from the stack after a row clear', () => {
  const game = new Game(() => .3);
  game.start();
  game.settled = [
    rectangle(0, 19, 10, 20),
    { id: 0, points: [[0, 9], [1, 9], [0, 10]] },
  ];
  game.active = piece(4, 17);
  game.queue = [2, 0, 1];
  assert.equal(game.place(), true);
  assert.equal(game.lines, 1);
  const stackTop = Math.min(...game.settled.map(existing => bounds(existing.points).top));
  assert.equal(stackTop, 10);
  assert.equal(bounds(worldPoints(game.active)).bottom, stackTop - 1);
});

test('timer starts at ten seconds, locks legal position, and accelerates', () => {
  const game = new Game(() => .4);
  game.start();
  assert.equal(game.remaining, 10);
  assert.equal(game.queue.length, 3);
  const original = worldPoints(highestPlacement(game.active, game.settled));
  game.tick(5);
  assert.equal(game.placed, 0);
  assert.equal(game.remaining, 5);
  game.tick(5);
  assert.equal(game.placed, 1);
  assert.deepEqual(game.settled[0].points, original);
  assert.equal(game.limit, 9.95);
  assert.equal(game.remaining, game.limit);
  game.mode = 'paused';
  game.tick(10);
  assert.equal(game.placed, 1);
});

test('Space immediately resolves an illegal position using the fixed-column fallback', () => {
  const game = new Game(() => .3);
  game.start();
  game.active = piece(7, 3);
  assert.equal(game.place(), true);
  assert.equal(game.placed, 1);
  assert.equal(bounds(game.settled[0].points).left, 7);
  assert.equal(bounds(game.settled[0].points).bottom, 20);
  assert.equal(game.remaining, game.limit);
});

test('the photographed green triangle cannot lock onto the neighboring pink corner', () => {
  for (const mirrored of [false, true]) {
    const reflect = points => points.map(([horizontal, vertical]) => [mirrored ? WIDTH - horizontal : horizontal, vertical]);
    for (const trigger of ['Space', 'timeout']) {
      const game = new Game(() => .3);
      game.start();
      game.settled = [
        { id: 2, points: reflect([[2, 17], [4, 17], [2, 19]]) },
        { id: 2, points: reflect([[4, 19], [4, 17], [2, 19]]) },
        { id: 1, points: reflect([[1, 18], [2, 19], [1, 20]]) },
      ];
      game.active = { ...piece(mirrored ? 8 : 1, 15, mirrored ? [[0, 0], [1, 1], [0, 2]] : [[1, 0], [0, 1], [1, 2]]), id: 1 };
      assert.equal(legalPlacement(game.active, game.settled), false);
      assert.equal(highestPlacement(game.active, game.settled).y, 17);
      if (trigger === 'Space') game.place();
      else game.tick(game.remaining);
      assert.equal(game.mode, 'playing');
      assert.equal(game.placed, 1);
      assert.deepEqual(game.settled.at(-1).points, reflect([[2, 17], [1, 18], [2, 19]]));
      assert.equal(game.limit, 9.95);
    }
  }
});

test('a legal current position stays put even when a higher legal position exists', () => {
  for (const trigger of ['Space', 'timeout']) {
    const game = new Game(() => .3);
    game.start();
    game.settled = [rectangle(4, 10, 6, 11)];
    game.active = piece(4, 18);
    const original = worldPoints(game.active);
    assert.equal(legalPlacement(game.active, game.settled), true);
    assert.equal(highestPlacement(game.active, game.settled).y, 8);
    if (trigger === 'Space') game.place();
    else game.tick(game.remaining);
    assert.deepEqual(game.settled[1].points, original, trigger);
    assert.equal(game.placed, 1);
  }
});

test('Space and timeout drop floating and sideways-only positions onto support below', () => {
  for (const trigger of ['Space', 'timeout']) {
    for (const currentY of [1, 6]) {
      const game = new Game(() => .3);
      game.start();
      game.settled = [rectangle(2, 4, 4, 20), rectangle(4, 15, 6, 20)];
      game.active = piece(4, currentY);
      assert.equal(legalPlacement(game.active, game.settled), false);
      if (trigger === 'Space') game.place();
      else game.tick(game.remaining);
      assert.equal(game.mode, 'playing', trigger);
      assert.equal(game.placed, 1, trigger);
      assert.deepEqual(game.settled[2].points, worldPoints(piece(4, 13)), trigger);
    }
  }
});

test('Space and timeout produce identical results for floating, overlapping, blocked, and top-out positions', () => {
  for (const scenario of ['floating', 'overlapping', 'blocked', 'top-out']) {
    const createScenario = () => {
      const game = new Game(() => .3);
      game.start();
      game.active = piece(7, 3);
      if (scenario === 'overlapping') {
        game.settled = [{ id: 0, points: worldPoints(piece(7, 18)) }];
        game.active.y = 18;
      } else if (scenario === 'blocked') game.settled = [rectangle(7, 0, 9, 20)];
      else if (scenario === 'top-out') game.settled = [rectangle(7, 2, 9, 20)];
      return game;
    };
    const manual = createScenario();
    const timed = createScenario();
    manual.place();
    timed.tick(timed.remaining);
    assert.deepEqual(JSON.parse(JSON.stringify(manual)), JSON.parse(JSON.stringify(timed)), scenario);
    if (scenario === 'floating' || scenario === 'overlapping') {
      assert.equal(manual.mode, 'playing');
      assert.equal(manual.placed, 1);
      const placed = manual.settled.at(-1);
      assert.equal(bounds(placed.points).left, 7);
      assert.deepEqual(placed.points.map(([horizontal, vertical]) => [horizontal - 7, vertical - bounds(placed.points).top]), triangle);
      assert.equal(manual.message, '');
    } else assert.equal(manual.mode, 'over');
  }
});

test('hold is once per placement and never resets time', () => {
  const game = new Game(() => .5);
  game.start();
  const original = game.active.id;
  game.tick(1.5);
  game.hold();
  assert.equal(game.held, original);
  assert.equal(game.holdUsed, true);
  assert.equal(game.remaining, 8.5);
  const replacement = game.active.id;
  game.hold();
  assert.equal(game.active.id, replacement);
  assert.equal(game.held, original);
  game.move(0, 1);
  game.place();
  assert.equal(game.holdUsed, false);
  const next = game.active.id;
  game.hold();
  assert.equal(game.active.id, original);
  assert.equal(game.held, next);
});

test('top contact ends immediately; blocked column ends on timeout', () => {
  const game = new Game(() => .2);
  game.start();
  game.settled = [rectangle(0, 2, 2, 20)];
  game.active = piece(0, 0);
  game.place();
  assert.equal(game.mode, 'over');
  assert.equal(game.placed, 1);
  assert.match(game.endReason, /top/);
  game.start();
  game.settled = [rectangle(4, 0, 6, 20)];
  game.active = piece(4, 3);
  game.tick(game.remaining);
  assert.equal(game.mode, 'over');
  assert.match(game.endReason, /column/);
});

test('row clearing uses exact polygon area, removes strips, and moves upper fragments', () => {
  const tiledBottom = [];
  for (let horizontal = 0; horizontal < 10; horizontal += 2) {
    tiledBottom.push({ id: 0, points: [[horizontal, 18], [horizontal + 2, 18], [horizontal, 20]] });
    tiledBottom.push({ id: 1, points: [[horizontal + 2, 20], [horizontal + 2, 18], [horizontal, 20]] });
  }
  const above = { id: 2, points: [[0, 16], [2, 16], [0, 18]] };
  const result = clearRows([...tiledBottom, above]);
  assert.deepEqual(result.cleared, [18, 19]);
  assert.equal(result.settled.length, 1);
  assert.deepEqual(result.settled[0].points, [[0, 18], [2, 18], [0, 20]]);
  const partial = clearRows([rectangle(0, 19, 9, 20)]);
  assert.equal(partial.cleared.length, 0);
  const split = clearRows([rectangle(0, 18, 10, 19), { id: 1, points: [[0, 17], [2, 17], [0, 20]] }]);
  assert.ok(split.settled.every(fragment => fragment.points.every(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))));
});

test('row clears update game score and counters', () => {
  const game = new Game(() => .4);
  game.start();
  game.settled = [rectangle(0, 19, 9, 20), { id: 0, points: [[9, 19], [10, 19], [9, 20]] }];
  game.active = { id: 0, x: 9, y: 19, points: [[1, 1], [1, 0], [0, 1]] };
  assert.equal(game.place(), true);
  assert.equal(game.lines, 1);
  assert.equal(game.score, 105);
  assert.equal(game.settled.length, 0);
  assert.equal(game.message, '');
  assert.equal(game.messageTime, 0);
});

test('movement stays on grid and transforms keep pieces inside the board', () => {
  const game = new Game(() => .8);
  game.start();
  game.active = piece(8, 18);
  game.move(1, 0);
  assert.equal(game.active.x, 8);
  game.move(0, -1);
  assert.equal(game.active.y, 18);
  game.transform(rotate);
  game.transform(rotateCounterclockwise);
  const box = bounds(worldPoints(game.active));
  assert.ok(box.right <= 10 && box.bottom <= 20 && box.left >= 0 && box.top >= 0);
});
