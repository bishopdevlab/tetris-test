const COLS = 10;
const ROWS = 20;
const SCORE_TABLE = [0, 100, 300, 500, 800];
const PIECES = {
  I: { color: 'cyan', cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { color: 'yellow', cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { color: 'purple', cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { color: 'green', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { color: 'red', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { color: 'blue', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { color: 'orange', cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }
};
const PIECE_KEYS = Object.keys(PIECES);

const boardElement = document.querySelector('#game-board');
const nextElement = document.querySelector('#next-piece');
const overlay = document.querySelector('#board-overlay');
const overlayTitle = document.querySelector('#overlay-title');
const overlayMessage = document.querySelector('#overlay-message');
const startButton = document.querySelector('#start-button');
const restartButton = document.querySelector('#restart-button');
const scoreElement = document.querySelector('#score');
const linesElement = document.querySelector('#lines');
const levelElement = document.querySelector('#level');
const levelLabel = document.querySelector('#level-label');
const highScoreElement = document.querySelector('#high-score');
const statusElement = document.querySelector('#header-status');

const cells = [];
for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLS; col += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('role', 'gridcell');
    cell.dataset.row = row;
    cell.dataset.col = col;
    boardElement.appendChild(cell);
    cells.push(cell);
  }
}

let board;
let activePiece;
let nextType;
let score = 0;
let lines = 0;
let level = 1;
let highScore = Number(localStorage.getItem('stackline-high-score') || 0);
let started = false;
let paused = false;
let gameOver = false;
let lastFrame = 0;
let dropTimer = 0;
let animationFrame;
let bag = [];

function resetBoard() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function refillBag() {
  bag = [...PIECE_KEYS];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function drawType() {
  if (!bag.length) refillBag();
  return bag.pop();
}

function createPiece(type = drawType()) {
  return { type, rotation: 0, x: 3, y: 0 };
}

function rotateCells(type, rotation) {
  let rotated = PIECES[type].cells.map(([x, y]) => [x, y]);
  for (let turn = 0; turn < rotation; turn += 1) {
    rotated = rotated.map(([x, y]) => [3 - y, x]);
  }
  const minX = Math.min(...rotated.map(([x]) => x));
  const minY = Math.min(...rotated.map(([, y]) => y));
  return rotated.map(([x, y]) => [x - minX, y - minY]);
}

function getCells(piece = activePiece, rotation = piece.rotation, x = piece.x, y = piece.y) {
  return rotateCells(piece.type, rotation).map(([cellX, cellY]) => [x + cellX, y + cellY]);
}

function collides(piece, rotation = piece.rotation, x = piece.x, y = piece.y) {
  return getCells(piece, rotation, x, y).some(([cellX, cellY]) => (
    cellX < 0 || cellX >= COLS || cellY >= ROWS || (cellY >= 0 && board[cellY][cellX])
  ));
}

function tryMove(dx, dy) {
  if (!started || paused || gameOver || collides(activePiece, activePiece.rotation, activePiece.x + dx, activePiece.y + dy)) return false;
  activePiece.x += dx;
  activePiece.y += dy;
  return true;
}

function tryRotate() {
  if (!started || paused || gameOver) return;
  const nextRotation = (activePiece.rotation + 1) % 4;
  for (const offset of [0, -1, 1, -2, 2]) {
    if (!collides(activePiece, nextRotation, activePiece.x + offset, activePiece.y)) {
      activePiece.rotation = nextRotation;
      activePiece.x += offset;
      return;
    }
  }
}

function getDropDistance() {
  let distance = 0;
  while (!collides(activePiece, activePiece.rotation, activePiece.x, activePiece.y + distance + 1)) distance += 1;
  return distance;
}

function lockPiece() {
  getCells().forEach(([cellX, cellY]) => {
    if (cellY >= 0) board[cellY][cellX] = activePiece.type;
  });
  const cleared = clearLines();
  if (cleared) {
    score += SCORE_TABLE[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
  }
  activePiece = createPiece(nextType);
  nextType = drawType();
  if (collides(activePiece)) endGame();
  updateStats();
}

function clearLines() {
  const remaining = board.filter(row => row.some(cell => !cell));
  const cleared = ROWS - remaining.length;
  while (remaining.length < ROWS) remaining.unshift(Array(COLS).fill(null));
  board = remaining;
  return cleared;
}

function hardDrop() {
  if (!started || paused || gameOver) return;
  const distance = getDropDistance();
  activePiece.y += distance;
  score += distance * 2;
  lockPiece();
  updateStats();
}

function softDrop() {
  if (!started || paused || gameOver) return;
  if (tryMove(0, 1)) score += 1;
  else lockPiece();
  updateStats();
}

function render() {
  cells.forEach(cell => {
    cell.className = 'cell';
    cell.style.removeProperty('--piece-color');
  });
  board.forEach((row, rowIndex) => row.forEach((type, colIndex) => {
    if (type) paintCell(rowIndex, colIndex, type, false);
  }));
  if (started && activePiece && !gameOver) {
    getCells(activePiece, activePiece.rotation, activePiece.x, activePiece.y + getDropDistance()).forEach(([x, y]) => {
      if (y >= 0) paintCell(y, x, activePiece.type, true);
    });
    getCells().forEach(([x, y]) => {
      if (y >= 0) paintCell(y, x, activePiece.type, false);
    });
  }
  renderNext();
}

function paintCell(row, col, type, ghost) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
  const cell = cells[row * COLS + col];
  cell.classList.add(ghost ? 'ghost' : 'filled');
  cell.style.setProperty('--piece-color', `var(--${PIECES[type].color})`);
}

function renderNext() {
  nextElement.innerHTML = '';
  if (!nextType) return;
  const nextCells = rotateCells(nextType, 0);
  const minX = Math.min(...nextCells.map(([x]) => x));
  const maxX = Math.max(...nextCells.map(([x]) => x));
  const minY = Math.min(...nextCells.map(([, y]) => y));
  const maxY = Math.max(...nextCells.map(([, y]) => y));
  nextElement.style.gridTemplateColumns = `repeat(${maxX - minX + 1}, 12px)`;
  nextCells.forEach(([x, y]) => {
    const cell = document.createElement('span');
    cell.className = 'next-cell';
    cell.style.gridColumn = x - minX + 1;
    cell.style.gridRow = y - minY + 1;
    cell.style.background = `var(--${PIECES[nextType].color})`;
    cell.style.boxShadow = 'inset 0 -2px 0 rgba(0,0,0,.15), inset 1px 1px 0 rgba(255,255,255,.16)';
    nextElement.appendChild(cell);
  });
}

function updateStats() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('stackline-high-score', String(highScore));
  }
  scoreElement.textContent = String(score).padStart(6, '0');
  linesElement.textContent = lines;
  levelElement.textContent = level;
  levelLabel.textContent = `LVL ${String(level).padStart(2, '0')}`;
  highScoreElement.textContent = String(highScore).padStart(6, '0');
}

function showOverlay(title, message, buttonText = '게임 시작') {
  overlayTitle.innerHTML = title;
  overlayMessage.textContent = message;
  startButton.innerHTML = `${buttonText} <span>↗</span>`;
  overlay.classList.add('visible');
}

function hideOverlay() {
  overlay.classList.remove('visible');
}

function startGame() {
  resetBoard();
  score = 0;
  lines = 0;
  level = 1;
  started = true;
  paused = false;
  gameOver = false;
  bag = [];
  nextType = drawType();
  activePiece = createPiece();
  nextType = drawType();
  dropTimer = 0;
  lastFrame = performance.now();
  hideOverlay();
  statusElement.textContent = 'IN PLAY';
  updateStats();
  render();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(gameLoop);
}

function endGame() {
  gameOver = true;
  started = false;
  statusElement.textContent = 'GAME OVER';
  showOverlay('Run <strong>complete.</strong>', `최종 점수 ${String(score).padStart(6, '0')}점 · ${lines}줄을 지웠습니다.`, '다시 시작');
  updateStats();
  render();
}

function togglePause() {
  if (!started || gameOver) return;
  paused = !paused;
  statusElement.textContent = paused ? 'PAUSED' : 'IN PLAY';
  if (paused) showOverlay('Take a <strong>breath.</strong>', 'P 키를 누르면 게임이 다시 시작됩니다.', '계속하기');
  else hideOverlay();
}

function gameLoop(timestamp) {
  if (!started && !paused) return;
  const elapsed = timestamp - lastFrame;
  lastFrame = timestamp;
  if (!paused && started) {
    dropTimer += elapsed;
    const interval = Math.max(105, 850 - (level - 1) * 65);
    if (dropTimer >= interval) {
      dropTimer = 0;
      if (!tryMove(0, 1)) lockPiece();
    }
    render();
  }
  animationFrame = requestAnimationFrame(gameLoop);
}

function handleAction(action) {
  if (action === 'left') tryMove(-1, 0);
  if (action === 'right') tryMove(1, 0);
  if (action === 'rotate') tryRotate();
  if (action === 'down') softDrop();
  if (action === 'drop') hardDrop();
  render();
}

document.addEventListener('keydown', event => {
  const keyActions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', ' ': 'drop' };
  if (event.key === 'p' || event.key === 'P') {
    event.preventDefault();
    if (gameOver) return;
    togglePause();
    render();
    return;
  }
  if (event.key === 'r' || event.key === 'R') {
    event.preventDefault();
    startGame();
    return;
  }
  if (keyActions[event.key]) {
    event.preventDefault();
    handleAction(keyActions[event.key]);
  }
});

startButton.addEventListener('click', () => {
  if (paused) togglePause();
  else startGame();
});
restartButton.addEventListener('click', startGame);
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => handleAction(button.dataset.action));
});

resetBoard();
highScoreElement.textContent = String(highScore).padStart(6, '0');
render();
