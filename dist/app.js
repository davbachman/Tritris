import { Game, SHAPES, WIDTH, HEIGHT, bounds, rotate, rotateCounterclockwise, worldPoints, legalPlacement, highestPlacement } from './engine.js';

const game = new Game();
const canvas = document.querySelector('#board');
const context = canvas.getContext('2d');
const unit = canvas.width / WIDTH;
const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
let best = 0;
try { best = Number(localStorage.getItem('tritris-best') || 0); } catch {}
let previousTime = performance.now();
let manualTime = false;
let previewSignature = '';
let previousMode = '';
let pausedForHelp = false;
const heldMoves = new Map();
const movementActions = new Set(['left', 'right', 'down']);
const moveRepeatSeconds = .1;

const demo = new Game(() => 0.37);
demo.start();
for (let index = 0; index < 17; index += 1) {
  demo.active.x = [0, 2, 4, 6, 8, 1, 3, 5, 7][index % 9];
  demo.active = highestPlacement(demo.active, demo.settled) || demo.active;
  demo.place();
}

function preview(id, label) {
  const shape = SHAPES[id];
  const box = bounds(shape.points);
  const scale = 25;
  const offsetX = (100 - box.right * scale) / 2;
  const offsetY = (80 - box.bottom * scale) / 2;
  const points = shape.points.map(([horizontal, vertical]) => `${offsetX + horizontal * scale},${offsetY + vertical * scale}`).join(' ');
  return `<svg class="piece-preview" viewBox="0 0 100 80" role="img" aria-label="${label}: ${shape.name}"><polygon points="${points}" fill="${shape.color}" stroke="#374b3b" stroke-opacity=".14" stroke-width="1" stroke-linejoin="round"/></svg>`;
}

function polygon(points, color, options = {}) {
  context.save();
  context.globalAlpha = options.alpha ?? 1;
  context.beginPath();
  points.forEach(([horizontal, vertical], index) => {
    if (index === 0) context.moveTo(horizontal * unit, vertical * unit);
    else context.lineTo(horizontal * unit, vertical * unit);
  });
  context.closePath();
  if (!options.outlineOnly) {
    context.fillStyle = color;
    context.fill();
  }
  context.strokeStyle = options.stroke || '#1a302b';
  context.lineWidth = options.lineWidth || 2.5;
  if (options.dashed) context.setLineDash([8, 6]);
  context.lineJoin = 'round';
  context.stroke();
  context.restore();
}

function renderBoard() {
  context.fillStyle = '#1d302d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 1;
  context.strokeStyle = '#a5bca00e';
  context.beginPath();
  for (let horizontal = 1; horizontal < WIDTH; horizontal += 1) {
    context.moveTo(horizontal * unit, 0);
    context.lineTo(horizontal * unit, canvas.height);
  }
  for (let vertical = 1; vertical < HEIGHT; vertical += 1) {
    context.moveTo(0, vertical * unit);
    context.lineTo(canvas.width, vertical * unit);
  }
  context.stroke();
  context.fillStyle = '#9cb39a28';
  for (let horizontal = 1; horizontal < WIDTH; horizontal += 1) {
    for (let vertical = 1; vertical < HEIGHT; vertical += 1) {
      context.beginPath();
      context.arc(horizontal * unit, vertical * unit, 1.45, 0, Math.PI * 2);
      context.fill();
    }
  }
  const settled = game.mode === 'ready' ? demo.settled : game.settled;
  for (const piece of settled) polygon(piece.points, SHAPES[piece.id].color, { alpha: .96 });
  if (game.active && game.mode !== 'over') {
    const legal = legalPlacement(game.active, game.settled);
    if (!legal) {
      const fallback = highestPlacement(game.active, game.settled);
      if (fallback && fallback.y !== game.active.y) polygon(worldPoints(fallback), '#a4baa3', { outlineOnly: true, stroke: '#92aa8b', dashed: true, alpha: .35, lineWidth: 2 });
    }
    const points = worldPoints(game.active);
    polygon(points, SHAPES[game.active.id].color, { alpha: .63, stroke: legal ? '#ebf9db' : '#ef9b83', dashed: true, lineWidth: 2.6 });
    for (const [horizontal, vertical] of points) {
      context.fillStyle = legal ? '#e8f7da' : '#f0ac96';
      context.beginPath();
      context.arc(horizontal * unit, vertical * unit, 3.8, 0, Math.PI * 2);
      context.fill();
    }
  }
  if (game.mode === 'playing') {
    context.strokeStyle = '#d89f8144';
    context.setLineDash([5, 7]);
    context.lineWidth = 1.8;
    context.beginPath();
    context.moveTo(0, unit);
    context.lineTo(canvas.width, unit);
    context.stroke();
    context.setLineDash([]);
  }
}

function updateOverlay() {
  if (game.mode === previousMode) return;
  previousMode = game.mode;
  const isPaused = game.mode === 'paused';
  const isOver = game.mode === 'over';
  elements['board-overlay'].hidden = game.mode === 'playing';
  elements['pause-button'].disabled = game.mode === 'ready' || isOver;
  elements['pause-label'].textContent = isPaused ? 'Resume' : 'Pause';
  elements['pause-icon'].textContent = isPaused ? '▷' : 'Ⅱ';
  elements['pause-button'].setAttribute('aria-label', isPaused ? 'Resume game' : 'Pause game');
  elements['board-state'].textContent = isPaused ? 'TAKE A BREATHER' : isOver ? 'ONE MORE ANGLE?' : game.mode === 'playing' ? 'THE CLOCK IS TICKING' : 'READY WHEN YOU ARE';
  if (isPaused) {
    elements['overlay-eyebrow'].textContent = 'A MOMENT TO REFRAME';
    elements['overlay-title'].innerHTML = 'Take a<br>breather.';
    elements['overlay-description'].innerHTML = 'Your angles will be right here.<br>Ready when you are.';
    elements['start-button'].innerHTML = 'Keep going <span>↗</span>';
    elements['overlay-hint'].textContent = 'or press P';
  } else if (isOver) {
    elements['overlay-eyebrow'].textContent = 'EVERY ANGLE IS A NEW START';
    elements['overlay-title'].innerHTML = 'Nice<br>perspective.';
    elements['overlay-description'].textContent = `${game.endReason} ${game.placed} pieces. ${game.score} points.`;
    elements['start-button'].innerHTML = 'Try another angle <span>↗</span>';
    elements['overlay-hint'].textContent = 'or press enter';
  }
}

function render() {
  renderBoard();
  updateOverlay();
  elements['timer-value'].textContent = Math.max(0, game.remaining).toFixed(1);
  elements['timer-fill'].style.width = `${Math.max(0, game.remaining / game.limit) * 100}%`;
  elements['timer-value'].closest('.timer-panel').classList.toggle('urgent', game.mode === 'playing' && game.remaining <= 1.5);
  elements['timer-caption'].textContent = game.mode === 'ready' ? 'A fresh start. Take your time.' : game.mode === 'paused' ? 'Good angles are worth the wait.' : game.remaining <= 1.5 ? 'Find your angle. Make it count.' : `${game.limit.toFixed(2)} seconds for this piece`;
  elements['score-value'].textContent = String(game.score).padStart(4, '0');
  elements['pieces-value'].textContent = game.placed;
  elements['lines-value'].textContent = game.lines;
  if (game.score > best) {
    best = game.score;
    try { localStorage.setItem('tritris-best', String(best)); } catch {}
  }
  elements['best-value'].textContent = best;
  if (game.mode === 'playing') elements['placement-status'].textContent = legalPlacement(game.active, game.settled) ? 'Supported. Space to make it stick.' : 'Space to place at the highest supported spot.';
  else if (game.mode === 'paused') elements['placement-status'].textContent = 'Clock stopped. Take a breath.';
  else if (game.mode === 'over') elements['placement-status'].textContent = 'There’s always another angle.';
  const signature = `${game.queue.join(',')}/${game.held}/${game.holdUsed}`;
  if (signature !== previewSignature) {
    previewSignature = signature;
    elements['next-list'].innerHTML = game.queue.map((id, index) => `<li><span class="next-number">0${index + 1}</span>${preview(id, `Next piece ${index + 1}`)}</li>`).join('');
    elements['hold-preview'].innerHTML = game.held === null ? '<span class="empty-hold">Room for a<br>second thought.</span>' : preview(game.held, 'Held piece');
    elements['hold-preview'].style.opacity = game.holdUsed ? '.5' : '1';
    elements['hold-caption'].textContent = game.holdUsed ? 'Available after you place' : game.held === null ? 'Save a shape for later' : 'Press C to swap';
  }
  elements['board-toast'].textContent = game.message;
  elements['board-toast'].classList.toggle('visible', game.messageTime > 0);
}

function startOrResume() {
  heldMoves.clear();
  if (game.mode === 'paused') game.pause();
  else if (game.mode === 'ready' || game.mode === 'over') game.start();
  previousTime = performance.now();
  canvas.focus({ preventScroll: true });
  render();
}

function action(name) {
  if (elements['help-dialog'].open) return;
  if (name === 'pause') {
    game.pause();
    heldMoves.clear();
  }
  else if (name === 'left') game.move(-1, 0);
  else if (name === 'right') game.move(1, 0);
  else if (name === 'down') game.move(0, 1);
  else if (name === 'rotate') game.transform(rotate);
  else if (name === 'rotateCounterclockwise') game.transform(rotateCounterclockwise);
  else if (name === 'hold') game.hold();
  else if (name === 'place') game.place();
  render();
}

function beginMove(identifier, name) {
  if (game.mode !== 'playing' || elements['help-dialog'].open || heldMoves.has(identifier)) return;
  heldMoves.set(identifier, { name, remaining: moveRepeatSeconds });
  action(name);
}

function update(seconds) {
  if (game.mode !== 'playing' || elements['help-dialog'].open) heldMoves.clear();
  for (const movement of heldMoves.values()) {
    movement.remaining -= seconds;
    while (movement.remaining <= 1e-8) {
      action(movement.name);
      movement.remaining += moveRepeatSeconds;
    }
  }
  game.tick(seconds);
}

elements['start-button'].addEventListener('click', startOrResume);
elements['pause-button'].addEventListener('click', () => action('pause'));
const keyActions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotateCounterclockwise', ArrowDown: 'down', KeyW: 'rotate', Space: 'place', KeyC: 'hold', KeyP: 'pause' };
window.addEventListener('keydown', event => {
  if (elements['help-dialog'].open) return;
  if (event.code === 'Enter' && game.mode !== 'playing') {
    event.preventDefault();
    startOrResume();
  } else if (event.code === 'KeyF' && !event.repeat) {
    event.preventDefault();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (keyActions[event.code]) {
    event.preventDefault();
    if (event.repeat) return;
    const name = keyActions[event.code];
    if (movementActions.has(name)) beginMove(`key:${event.code}`, name);
    else action(name);
  }
});
window.addEventListener('keyup', event => heldMoves.delete(`key:${event.code}`));
window.addEventListener('blur', () => heldMoves.clear());

for (const button of document.querySelectorAll('[data-action]')) {
  const name = button.dataset.action;
  if (!movementActions.has(name)) {
    button.addEventListener('click', () => action(name));
    continue;
  }
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    beginMove(`pointer:${event.pointerId}`, name);
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(eventName, event => heldMoves.delete(`pointer:${event.pointerId}`));
  }
  button.addEventListener('click', event => {
    if (event.detail === 0) action(name);
  });
}

elements['help-button'].addEventListener('click', () => {
  heldMoves.clear();
  pausedForHelp = game.mode === 'playing';
  if (pausedForHelp) game.pause();
  elements['help-dialog'].showModal();
  render();
});
function closeHelp() { elements['help-dialog'].close(); }
elements['close-help'].addEventListener('click', closeHelp);
elements['got-it'].addEventListener('click', closeHelp);
elements['help-dialog'].addEventListener('close', () => {
  if (pausedForHelp && game.mode === 'paused') game.pause();
  pausedForHelp = false;
  previousTime = performance.now();
  render();
});
document.addEventListener('visibilitychange', () => {
  heldMoves.clear();
  if (document.hidden && game.mode === 'playing') {
    game.pause();
    render();
  }
  previousTime = performance.now();
});

window.render_game_to_text = () => JSON.stringify({
  coordinates: 'Whole grid points, origin at top-left; x increases right, y increases down. Board: 10 by 20. Left/right/down move one unit and repeat every 100ms while held. Up rotates counterclockwise; W rotates clockwise. No upward movement.',
  mode: game.mode,
  active: game.active ? { family: game.active.id, name: SHAPES[game.active.id].name, x: game.active.x, y: game.active.y, vertices: worldPoints(game.active), legal: legalPlacement(game.active, game.settled), automaticY: highestPlacement(game.active, game.settled)?.y ?? null } : null,
  settled: game.settled.map(piece => ({ family: piece.id, vertices: piece.points })),
  next: game.queue,
  held: game.held,
  holdUsed: game.holdUsed,
  score: game.score,
  placed: game.placed,
  lines: game.lines,
  timer: Number(game.remaining.toFixed(3)),
  timeLimit: Number(game.limit.toFixed(3)),
  endReason: game.endReason,
});
window.advanceTime = milliseconds => {
  manualTime = true;
  let remaining = milliseconds / 1000;
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 60);
    update(step);
    remaining -= step;
  }
  render();
};

function frame(now) {
  const elapsed = Math.min((now - previousTime) / 1000, .1);
  previousTime = now;
  if (!manualTime) update(elapsed);
  render();
  requestAnimationFrame(frame);
}

render();
requestAnimationFrame(frame);
