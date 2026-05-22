// BOOM CHESS — explosive chess with custom pieces
// Pawns and Kings are standard; every other piece is replaced with an explosive.

const SIZE = 8;

const PIECE_INFO = {
  king:   { symbol: '👑', name: 'King' },
  pawn:   { symbol: '🪖', name: 'Pawn' },
  bomber: { symbol: '💣', name: 'Bomber' },  // replaces knight
  sapper: { symbol: '🧨', name: 'Sapper' },  // replaces bishop
  rocket: { symbol: '🚀', name: 'Rocket' },  // replaces rook
  nuker:  { symbol: '☢️', name: 'Nuker'  },  // replaces queen
};

let board;        // 2D array of {type, color} | null
let turn;         // 'white' | 'black'
let selected;     // {r, c} | null
let legalMoves;   // [{r, c, capture}]
let gameOver;
let winner;
let busy;         // true while an animation is playing

function initBoard() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  const backRank = ['rocket','bomber','sapper','nuker','king','sapper','bomber','rocket'];
  for (let c = 0; c < SIZE; c++) {
    board[0][c] = { type: backRank[c], color: 'black' };
    board[1][c] = { type: 'pawn',      color: 'black' };
    board[6][c] = { type: 'pawn',      color: 'white' };
    board[7][c] = { type: backRank[c], color: 'white' };
  }

  turn = 'white';
  selected = null;
  legalMoves = [];
  gameOver = false;
  winner = null;
  busy = false;
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

// ----- Movement -----

function getMoves(r, c) {
  const piece = board[r][c];
  if (!piece) return [];

  const moves = [];
  const { type, color } = piece;

  const slide = (dirs) => {
    for (const [dr, dc] of dirs) {
      for (let i = 1; i < SIZE; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        const t = board[nr][nc];
        if (!t) {
          moves.push({ r: nr, c: nc, capture: false });
        } else {
          if (t.color !== color) moves.push({ r: nr, c: nc, capture: true });
          break;
        }
      }
    }
  };

  if (type === 'king') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const t = board[nr][nc];
      if (!t || t.color !== color) moves.push({ r: nr, c: nc, capture: !!t });
    }
  } else if (type === 'pawn') {
    const dir = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    const fr1 = r + dir;
    if (inBounds(fr1, c) && !board[fr1][c]) {
      moves.push({ r: fr1, c, capture: false });
      const fr2 = r + 2 * dir;
      if (r === startRow && inBounds(fr2, c) && !board[fr2][c]) {
        moves.push({ r: fr2, c, capture: false });
      }
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] && board[nr][nc].color !== color) {
        moves.push({ r: nr, c: nc, capture: true });
      }
    }
  } else if (type === 'bomber') {
    const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of jumps) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const t = board[nr][nc];
      if (!t || t.color !== color) moves.push({ r: nr, c: nc, capture: !!t });
    }
  } else if (type === 'sapper') {
    slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
  } else if (type === 'rocket') {
    slide([[-1,0],[1,0],[0,-1],[0,1]]);
  } else if (type === 'nuker') {
    slide([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
  }

  return moves;
}

// ----- Explosions -----
// Returns { squares: [{r,c}], css: 'normal'|'nuke'|'line'|'x'|'plus', shake: 'small'|'big'|null }
function getBlast(piece, fromR, fromC, toR, toC) {
  const set = new Set();
  const add = (r, c) => { if (inBounds(r, c)) set.add(r * SIZE + c); };

  let css = 'normal';
  let shake = 'small';

  switch (piece.type) {
    case 'pawn': {
      // small + around landing (target dies from move itself)
      add(toR - 1, toC); add(toR + 1, toC);
      add(toR, toC - 1); add(toR, toC + 1);
      css = 'plus';
      shake = 'small';
      break;
    }
    case 'bomber': {
      // 3x3 around landing — bomber goes with it
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(toR + dr, toC + dc);
      css = 'normal';
      shake = 'small';
      break;
    }
    case 'sapper': {
      // X-pattern: 4 diagonal neighbors
      add(toR - 1, toC - 1); add(toR - 1, toC + 1);
      add(toR + 1, toC - 1); add(toR + 1, toC + 1);
      css = 'x';
      shake = 'small';
      break;
    }
    case 'rocket': {
      // Two squares past impact, in direction of travel
      const dr = Math.sign(toR - fromR);
      const dc = Math.sign(toC - fromC);
      add(toR + dr, toC + dc);
      add(toR + dr * 2, toC + dc * 2);
      css = 'line';
      shake = 'small';
      break;
    }
    case 'nuker': {
      // 5x5 around landing — nuker dies in it
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(toR + dr, toC + dc);
      css = 'nuke';
      shake = 'big';
      break;
    }
    default:
      shake = null;
  }

  const squares = [...set].map(n => ({ r: Math.floor(n / SIZE), c: n % SIZE }));
  return { squares, css, shake };
}

// ----- Move execution -----

async function makeMove(toR, toC) {
  if (busy || gameOver) return;
  busy = true;

  const { r: fromR, c: fromC } = selected;
  const piece = board[fromR][fromC];
  const isCapture = !!board[toR][toC];

  // Execute move
  board[fromR][fromC] = null;
  board[toR][toC] = piece;

  // Pawn promotion → Nuker
  if (piece.type === 'pawn') {
    if ((piece.color === 'white' && toR === 0) || (piece.color === 'black' && toR === SIZE - 1)) {
      piece.type = 'nuker';
    }
  }

  selected = null;
  legalMoves = [];
  render();

  if (isCapture) {
    const blast = getBlast(piece, fromR, fromC, toR, toC);
    await playExplosion(blast);

    // Detonate: clear every square in blast radius
    for (const { r, c } of blast.squares) {
      board[r][c] = null;
    }
  }

  // Check kings
  let whiteKing = false, blackKing = false;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = board[r][c];
    if (p && p.type === 'king') {
      if (p.color === 'white') whiteKing = true; else blackKing = true;
    }
  }

  if (!whiteKing || !blackKing) {
    gameOver = true;
    if (!whiteKing && !blackKing) winner = 'draw';
    else if (!whiteKing) winner = 'black';
    else winner = 'white';
  } else {
    turn = turn === 'white' ? 'black' : 'white';
  }

  render();
  busy = false;
}

// ----- Animation -----

function playExplosion(blast) {
  return new Promise(resolve => {
    const boardEl = document.getElementById('board');
    const wrap = document.getElementById('shake');

    const overlays = [];
    for (const { r, c } of blast.squares) {
      const sq = boardEl.children[r * SIZE + c];
      if (!sq) continue;
      const el = document.createElement('div');
      el.className = 'explosion ' + blast.css;
      // Slight stagger for organic feel
      el.style.animationDelay = `${Math.random() * 80}ms`;
      sq.appendChild(el);
      overlays.push(el);
    }

    if (blast.shake === 'big') wrap.classList.add('shaking-big');
    else if (blast.shake === 'small') wrap.classList.add('shaking-small');

    const duration = blast.css === 'nuke' ? 950 : 600;
    setTimeout(() => {
      wrap.classList.remove('shaking-small', 'shaking-big');
      for (const el of overlays) el.remove();
      resolve();
    }, duration);
  });
}

// ----- Rendering -----

function render() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.r = r;
      sq.dataset.c = c;

      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');

      const move = legalMoves.find(m => m.r === r && m.c === c);
      if (move) sq.classList.add(move.capture ? 'move-capture' : 'move-empty');

      const p = board[r][c];
      if (p) {
        const pe = document.createElement('div');
        pe.className = 'piece ' + p.color;
        pe.textContent = PIECE_INFO[p.type].symbol;
        pe.title = `${p.color} ${PIECE_INFO[p.type].name}`;
        sq.appendChild(pe);
      }

      sq.addEventListener('click', () => onSquareClick(r, c));
      boardEl.appendChild(sq);
    }
  }

  const status = document.getElementById('status');
  status.classList.remove('winner');
  if (gameOver) {
    status.classList.add('winner');
    if (winner === 'draw') status.textContent = '💥 DOUBLE KO — DRAW! 💥';
    else status.textContent = `🏆 ${winner.toUpperCase()} WINS! 🏆`;
  } else {
    const t = turn === 'white' ? 'White' : 'Black';
    status.textContent = `${t}'s turn`;
  }
}

function onSquareClick(r, c) {
  if (busy || gameOver) return;
  const piece = board[r][c];

  if (selected) {
    const move = legalMoves.find(m => m.r === r && m.c === c);
    if (move) { makeMove(r, c); return; }

    if (piece && piece.color === turn) {
      selected = { r, c };
      legalMoves = getMoves(r, c);
    } else {
      selected = null;
      legalMoves = [];
    }
    render();
  } else if (piece && piece.color === turn) {
    selected = { r, c };
    legalMoves = getMoves(r, c);
    render();
  }
}

document.getElementById('reset').addEventListener('click', () => {
  if (busy) return;
  initBoard();
  render();
});

initBoard();
render();
