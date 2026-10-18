export const WIDTH = 10;
export const HEIGHT = 20;
const STARTING_TIME = 10;
const EPSILON = 1e-8;

export function normalize(points) {
  const minimumX = Math.min(...points.map(point => point[0]));
  const minimumY = Math.min(...points.map(point => point[1]));
  return points.map(([horizontal, vertical]) => [horizontal - minimumX, vertical - minimumY]);
}

export function rotate(points) {
  return normalize(points.map(([horizontal, vertical]) => [-vertical, horizontal]));
}

export function rotateCounterclockwise(points) {
  return normalize(points.map(([horizontal, vertical]) => [vertical, -horizontal]));
}

export function flip(points) {
  return normalize(points.map(([horizontal, vertical]) => [-horizontal, vertical]));
}

export function shapeKey(points) {
  const forms = [];
  for (const reflected of [false, true]) {
    let current = reflected ? flip(points) : normalize(points);
    for (let turn = 0; turn < 4; turn += 1) {
      forms.push(JSON.stringify([...current].sort((first, second) => first[0] - second[0] || first[1] - second[1])));
      current = rotate(current);
    }
  }
  return forms.sort()[0];
}

export function area(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

function makeShapes() {
  const boundary = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  const families = new Map();
  for (let first = 0; first < boundary.length - 2; first += 1) {
    for (let second = first + 1; second < boundary.length - 1; second += 1) {
      for (let third = second + 1; third < boundary.length; third += 1) {
        const points = [boundary[first], boundary[second], boundary[third]];
        const allowedEdges = points.every((point, index) => {
          const next = points[(index + 1) % points.length];
          const horizontal = Math.abs(next[0] - point[0]);
          const vertical = Math.abs(next[1] - point[1]);
          return horizontal === 0 || vertical === 0 || horizontal === vertical;
        });
        if (area(points) > EPSILON && allowedEdges) families.set(shapeKey(points), normalize(points));
      }
    }
  }
  const colors = ['#e8c76c', '#9ac68b', '#dba4be'];
  const names = ['Corner', 'Slant', 'Arrow'];
  return [...families.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([key, points], index) => ({ id: index, key, points, color: colors[index], name: names[index] }));
}

export const SHAPES = makeShapes();

export function bounds(points) {
  return {
    left: Math.min(...points.map(point => point[0])),
    right: Math.max(...points.map(point => point[0])),
    top: Math.min(...points.map(point => point[1])),
    bottom: Math.max(...points.map(point => point[1])),
  };
}

export function worldPoints(piece) {
  return piece.points.map(([horizontal, vertical]) => [horizontal + piece.x, vertical + piece.y]);
}

export function polygonsOverlap(first, second, includeTouch = false) {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const point = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const axis = [next[1] - point[1], point[0] - next[0]];
      const length = Math.hypot(...axis);
      if (length < EPSILON) continue;
      const project = target => target.map(vertex => (vertex[0] * axis[0] + vertex[1] * axis[1]) / length);
      const firstProjection = project(first);
      const secondProjection = project(second);
      const intersection = Math.min(Math.max(...firstProjection), Math.max(...secondProjection)) - Math.max(Math.min(...firstProjection), Math.min(...secondProjection));
      if (includeTouch ? intersection < -EPSILON : intersection <= EPSILON) return false;
    }
  }
  return true;
}

export function legalPlacement(piece, settled) {
  const points = worldPoints(piece);
  const box = bounds(points);
  if (box.left < -EPSILON || box.right > WIDTH + EPSILON || box.top < -EPSILON || box.bottom > HEIGHT + EPSILON) return false;
  if (settled.some(existing => polygonsOverlap(points, existing.points))) return false;
  return Math.abs(box.bottom - HEIGHT) < EPSILON || settled.some(existing => polygonsOverlap(points, existing.points, true));
}

function blocksDownwardMotion(first, second) {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const point = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const length = Math.hypot(next[1] - point[1], point[0] - next[0]);
      if (length < EPSILON) continue;
      const horizontal = (next[1] - point[1]) / length;
      const vertical = (point[0] - next[0]) / length;
      const project = target => target.map(vertex => vertex[0] * horizontal + vertex[1] * vertical);
      const firstProjection = project(first);
      const secondProjection = project(second);
      const firstMinimum = Math.min(...firstProjection);
      const firstMaximum = Math.max(...firstProjection);
      const secondMinimum = Math.min(...secondProjection);
      const secondMaximum = Math.max(...secondProjection);
      if (firstMaximum < secondMinimum - EPSILON || secondMaximum < firstMinimum - EPSILON) return false;
      if (firstMaximum <= secondMinimum + EPSILON && vertical <= EPSILON) return false;
      if (secondMaximum <= firstMinimum + EPSILON && vertical >= -EPSILON) return false;
    }
  }
  return true;
}

export function supportedPlacement(piece, settled) {
  if (!legalPlacement(piece, settled)) return false;
  const points = worldPoints(piece);
  return Math.abs(bounds(points).bottom - HEIGHT) < EPSILON || settled.some(existing => blocksDownwardMotion(points, existing.points));
}

export function highestPlacement(piece, settled) {
  const box = bounds(piece.points);
  const minimumY = Math.ceil(-box.top);
  const maximumY = Math.floor(HEIGHT - box.bottom);
  for (let vertical = minimumY; vertical <= maximumY; vertical += 1) {
    const candidate = { ...piece, y: vertical };
    if (supportedPlacement(candidate, settled)) return candidate;
  }
  return null;
}

export function clipHorizontal(points, line, keepBelow) {
  const output = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentInside = keepBelow ? current[1] >= line - EPSILON : current[1] <= line + EPSILON;
    const nextInside = keepBelow ? next[1] >= line - EPSILON : next[1] <= line + EPSILON;
    if (currentInside) output.push([...current]);
    if (currentInside !== nextInside) {
      const fraction = (line - current[1]) / (next[1] - current[1]);
      output.push([current[0] + fraction * (next[0] - current[0]), line]);
    }
  }
  return output;
}

export function clearRows(settled) {
  const cleared = [];
  for (let row = 0; row < HEIGHT; row += 1) {
    const covered = settled.reduce((sum, piece) => sum + area(clipHorizontal(clipHorizontal(piece.points, row, true), row + 1, false)), 0);
    if (covered >= WIDTH - EPSILON) cleared.push(row);
  }
  if (!cleared.length) return { settled, cleared };
  const bands = [];
  let start = 0;
  for (const row of cleared) {
    if (row > start) bands.push([start, row]);
    start = row + 1;
  }
  if (start < HEIGHT) bands.push([start, HEIGHT]);
  const fragments = [];
  for (const piece of settled) {
    for (const [top, bottom] of bands) {
      const clipped = clipHorizontal(clipHorizontal(piece.points, top, true), bottom, false);
      if (clipped.length < 3 || area(clipped) < EPSILON) continue;
      const shift = cleared.filter(row => row >= bottom).length;
      fragments.push({ ...piece, points: clipped.map(([horizontal, vertical]) => [horizontal, vertical + shift]) });
    }
  }
  return { settled: fragments, cleared };
}

export class Game {
  constructor(random = Math.random) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.mode = 'ready';
    this.settled = [];
    this.queue = [];
    this.bag = [];
    this.held = null;
    this.holdUsed = false;
    this.active = null;
    this.score = 0;
    this.placed = 0;
    this.lines = 0;
    this.remaining = STARTING_TIME;
    this.limit = STARTING_TIME;
    this.message = '';
    this.messageTime = 0;
    this.endReason = '';
    this.lastCleared = [];
    this.fillQueue();
  }

  drawId() {
    if (!this.bag.length) {
      this.bag = SHAPES.map(shape => shape.id);
      for (let index = this.bag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(this.random() * (index + 1));
        [this.bag[index], this.bag[swapIndex]] = [this.bag[swapIndex], this.bag[index]];
      }
    }
    return this.bag.pop();
  }

  fillQueue() {
    while (this.queue.length < 3) this.queue.push(this.drawId());
  }

  makePiece(id) {
    const points = SHAPES[id].points.map(point => [...point]);
    const stackTop = this.settled.reduce((highest, piece) => Math.min(highest, bounds(piece.points).top), HEIGHT);
    return { id, points, x: 4, y: Math.max(0, stackTop - bounds(points).bottom - 1) };
  }

  spawn() {
    this.active = this.makePiece(this.queue.shift());
    this.fillQueue();
  }

  start() {
    this.reset();
    this.mode = 'playing';
    this.spawn();
  }

  tell(message) {
    this.message = message;
    this.messageTime = 1.8;
  }

  move(horizontal, vertical) {
    if (this.mode !== 'playing' || vertical < 0) return;
    const box = bounds(this.active.points);
    this.active = {
      ...this.active,
      x: Math.max(0, Math.min(WIDTH - box.right, this.active.x + horizontal)),
      y: Math.max(0, Math.min(HEIGHT - box.bottom, this.active.y + vertical)),
    };
  }

  transform(operation) {
    if (this.mode !== 'playing') return;
    const points = operation(this.active.points);
    const box = bounds(points);
    this.active = { ...this.active, points, x: Math.min(this.active.x, WIDTH - box.right), y: Math.min(this.active.y, HEIGHT - box.bottom) };
  }

  hold() {
    if (this.mode !== 'playing') return;
    if (this.holdUsed) {
      this.tell('One hold per piece. Make this one count.');
      return;
    }
    const previous = this.held;
    this.held = this.active.id;
    if (previous === null) this.spawn();
    else this.active = this.makePiece(previous);
    this.holdUsed = true;
  }

  finish(reason) {
    this.mode = 'over';
    this.endReason = reason;
    this.remaining = 0;
  }

  place() {
    if (this.mode !== 'playing') return false;
    if (!legalPlacement(this.active, this.settled)) {
      const fallback = highestPlacement(this.active, this.settled);
      if (!fallback) {
        this.finish('No supported position in this column.');
        return false;
      }
      this.active = fallback;
    }
    const points = worldPoints(this.active);
    this.settled.push({ id: this.active.id, points });
    this.score += Math.round(area(points) * 10);
    this.placed += 1;
    if (bounds(points).top <= EPSILON) {
      this.finish('Your triangle reached the top.');
      return true;
    }
    const result = clearRows(this.settled);
    this.settled = result.settled;
    this.lastCleared = result.cleared;
    this.lines += result.cleared.length;
    this.score += result.cleared.length * result.cleared.length * 100;
    this.limit = Math.max(1, STARTING_TIME * 0.995 ** this.placed);
    this.remaining = this.limit;
    this.holdUsed = false;
    this.spawn();
    return true;
  }

  tick(seconds) {
    if (this.mode !== 'playing') return;
    this.messageTime = Math.max(0, this.messageTime - seconds);
    let elapsed = seconds;
    while (elapsed > 0 && this.mode === 'playing') {
      if (elapsed + EPSILON < this.remaining) {
        this.remaining -= elapsed;
        break;
      }
      elapsed = Math.max(0, elapsed - this.remaining);
      this.remaining = 0;
      this.place();
    }
  }

  pause() {
    if (this.mode === 'playing') this.mode = 'paused';
    else if (this.mode === 'paused') this.mode = 'playing';
  }
}
