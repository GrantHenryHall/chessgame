// BOOM CHESS — explosive chess with custom pieces + AI opponent
// Pawns and Kings move normally; every other piece is replaced with an explosive.

const SIZE = 8;

const PIECE_INFO = {
  king:   { symbol: '♚', name: 'King' },
  pawn:   { symbol: '♟', name: 'Pawn' },
  knight: { symbol: '♞', name: 'Knight' },
  bishop: { symbol: '♝', name: 'Bishop' },
  rook:   { symbol: '♜', name: 'Rook' },
  queen:  { symbol: '♛', name: 'Queen' },
};

const PIECE_VALUE = {
  king: 10000, queen: 9, rook: 5, bishop: 3.5, knight: 3.5, pawn: 1,
};

const BLAST_CAPABLE = new Set(['knight', 'bishop', 'rook', 'queen']);

let board, turn, selected, legalMoves, gameOver, winner, busy;
let aiEnabled = true;
const aiColor = 'black';

// ----- Setup -----

function initBoard() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  const backRank = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
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

function cloneBoard(b) {
  return b.map(row => row.map(cell => cell ? { ...cell } : null));
}

// ----- Movement (pure: takes board state) -----

function getMovesOn(b, r, c) {
  const piece = b[r][c];
  if (!piece) return [];
  const moves = [];
  const { type, color } = piece;

  const slide = (dirs) => {
    for (const [dr, dc] of dirs) {
      for (let i = 1; i < SIZE; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBounds(nr, nc)) break;
        const t = b[nr][nc];
        if (!t) moves.push({ r: nr, c: nc, capture: false });
        else { if (t.color !== color) moves.push({ r: nr, c: nc, capture: true }); break; }
      }
    }
  };

  if (type === 'king') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const t = b[nr][nc];
      if (!t || t.color !== color) moves.push({ r: nr, c: nc, capture: !!t });
    }
  } else if (type === 'pawn') {
    const dir = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    const fr1 = r + dir;
    if (inBounds(fr1, c) && !b[fr1][c]) {
      moves.push({ r: fr1, c, capture: false });
      const fr2 = r + 2 * dir;
      if (r === startRow && inBounds(fr2, c) && !b[fr2][c]) {
        moves.push({ r: fr2, c, capture: false });
      }
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (inBounds(nr, nc) && b[nr][nc] && b[nr][nc].color !== color) {
        moves.push({ r: nr, c: nc, capture: true });
      }
    }
  } else if (type === 'knight') {
    const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of jumps) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const t = b[nr][nc];
      if (!t || t.color !== color) moves.push({ r: nr, c: nc, capture: !!t });
    }
  } else if (type === 'bishop') {
    slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
  } else if (type === 'rook') {
    slide([[-1,0],[1,0],[0,-1],[0,1]]);
  } else if (type === 'queen') {
    slide([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]);
  }

  return moves;
}

function getMoves(r, c) { return getMovesOn(board, r, c); }

// ----- Explosions -----

function getBlast(piece, fromR, fromC, toR, toC) {
  // Spent pieces have already used their one blast — capture is silent.
  if (piece.spent) {
    return { squares: [], css: 'none', shake: null, destructive: false };
  }

  const set = new Set();
  const add = (r, c) => { if (inBounds(r, c)) set.add(r * SIZE + c); };

  let css = 'normal';
  let shake = 'small';
  let destructive = true;

  switch (piece.type) {
    case 'knight':
      // Lateral blast: left + right of landing
      add(toR, toC - 1); add(toR, toC + 1);
      css = 'normal'; break;
    case 'bishop':
      // Vertical blast: above + below landing
      add(toR - 1, toC); add(toR + 1, toC);
      css = 'normal'; break;
    case 'rook': {
      // Three of the four orthogonal neighbors — skip the one in front
      // (the direction the rook moved toward the target)
      const fdr = Math.sign(toR - fromR);
      const fdc = Math.sign(toC - fromC);
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (dr === fdr && dc === fdc) continue; // skip the forward square
        add(toR + dr, toC + dc);
      }
      css = 'normal'; shake = 'small'; break;
    }
    case 'queen':
      // X blast: 4 diagonal neighbors of landing
      add(toR - 1, toC - 1); add(toR - 1, toC + 1);
      add(toR + 1, toC - 1); add(toR + 1, toC + 1);
      css = 'nuke'; shake = 'big'; break;
    default:
      // pawn, king, anything else — no blast
      shake = null;
  }

  const squares = [...set].map(n => ({ r: Math.floor(n / SIZE), c: n % SIZE }));
  return { squares, css, shake, destructive };
}

// ----- Pure move application (for AI simulation) -----

function applyMoveOn(b, fromR, fromC, toR, toC) {
  const nb = cloneBoard(b);
  const piece = nb[fromR][fromC];
  const isCapture = !!nb[toR][toC];
  nb[fromR][fromC] = null;
  nb[toR][toC] = piece;
  if (piece.type === 'pawn') {
    if ((piece.color === 'white' && toR === 0) || (piece.color === 'black' && toR === SIZE - 1)) {
      piece.type = 'queen';
      piece.spent = false;
    }
  }
  if (isCapture) {
    const blast = getBlast(piece, fromR, fromC, toR, toC);
    if (blast.destructive) {
      for (const { r, c } of blast.squares) nb[r][c] = null;
    }
    if (BLAST_CAPABLE.has(piece.type)) piece.spent = true;
  }
  return nb;
}

function allMovesFor(b, color) {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = b[r][c];
    if (!p || p.color !== color) continue;
    for (const m of getMovesOn(b, r, c)) {
      out.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, capture: m.capture });
    }
  }
  return out;
}

function findKings(b) {
  let w = false, k = false;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = b[r][c];
    if (p && p.type === 'king') {
      if (p.color === 'white') w = true; else k = true;
    }
  }
  return { white: w, black: k };
}

// ----- AI -----

function evaluate(b, perspective) {
  const kings = findKings(b);
  const myKing = kings[perspective];
  const oppColor = perspective === 'white' ? 'black' : 'white';
  const oppKing = kings[oppColor];
  if (!myKing && !oppKing) return 0;
  if (!myKing) return -1e8;
  if (!oppKing) return  1e8;

  let myScore = 0, oppScore = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const p = b[r][c];
    if (!p) continue;
    let v = PIECE_VALUE[p.type];
    if (p.spent) v *= 0.7; // a spent piece is worth less — its charge is gone
    if (p.color === perspective) myScore += v; else oppScore += v;
  }
  return myScore - oppScore;
}

function minimax(b, depth, color, alpha, beta, perspective) {
  const kings = findKings(b);
  if (!kings.white || !kings.black || depth === 0) return evaluate(b, perspective);

  const moves = allMovesFor(b, color);
  if (moves.length === 0) return evaluate(b, perspective);

  const next = color === 'white' ? 'black' : 'white';
  const isMax = color === perspective;

  if (isMax) {
    let best = -Infinity;
    for (const m of moves) {
      const nb = applyMoveOn(b, m.fromR, m.fromC, m.toR, m.toC);
      const s = minimax(nb, depth - 1, next, alpha, beta, perspective);
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const nb = applyMoveOn(b, m.fromR, m.fromC, m.toR, m.toC);
      const s = minimax(nb, depth - 1, next, alpha, beta, perspective);
      if (s < best) best = s;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

function pickAIMove() {
  const moves = allMovesFor(board, aiColor);
  if (moves.length === 0) return null;

  const depth = 2;
  const next = aiColor === 'white' ? 'black' : 'white';
  let bestScore = -Infinity;
  let bestMoves = [];

  // Shuffle for tiebreak variety
  const shuffled = [...moves].sort(() => Math.random() - 0.5);

  for (const m of shuffled) {
    const nb = applyMoveOn(board, m.fromR, m.fromC, m.toR, m.toC);
    let s = minimax(nb, depth - 1, next, -Infinity, Infinity, aiColor);
    // Aggression bonus — favour explosions when otherwise equal
    if (m.capture) s += 0.4;
    s += Math.random() * 0.05;
    if (s > bestScore) { bestScore = s; bestMoves = [m]; }
    else if (s === bestScore) bestMoves.push(m);
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

async function aiTurn() {
  if (gameOver || !aiEnabled || turn !== aiColor || busy) return;
  busy = true;
  render();

  // Brief "thinking" pause so it doesn't feel instant
  await new Promise(r => setTimeout(r, 350));

  const move = pickAIMove();
  if (!move) {
    gameOver = true;
    winner = aiColor === 'white' ? 'black' : 'white';
    busy = false;
    render();
    return;
  }

  // Flash the chosen piece + target square briefly
  selected = { r: move.fromR, c: move.fromC };
  legalMoves = [{ r: move.toR, c: move.toC, capture: !!board[move.toR][move.toC] }];
  render();
  await new Promise(r => setTimeout(r, 350));

  busy = false; // makeMove sets its own
  await makeMove(move.fromR, move.fromC, move.toR, move.toC);
}

// ----- Move execution (mutates live board, animates) -----

async function makeMove(fromR, fromC, toR, toC) {
  if (busy || gameOver) return;
  busy = true;

  const piece = board[fromR][fromC];
  const isCapture = !!board[toR][toC];

  board[fromR][fromC] = null;
  board[toR][toC] = piece;

  if (piece.type === 'pawn') {
    if ((piece.color === 'white' && toR === 0) || (piece.color === 'black' && toR === SIZE - 1)) {
      piece.type = 'queen';
      piece.spent = false;
    }
  }

  selected = null;
  legalMoves = [];
  render();

  if (isCapture) {
    const blast = getBlast(piece, fromR, fromC, toR, toC);
    await playExplosion(blast);
    if (blast.destructive) {
      for (const { r, c } of blast.squares) board[r][c] = null;
    }
    if (BLAST_CAPABLE.has(piece.type)) piece.spent = true;
  }

  const kings = findKings(board);
  if (!kings.white || !kings.black) {
    gameOver = true;
    if (!kings.white && !kings.black) winner = 'draw';
    else if (!kings.white) winner = 'black';
    else winner = 'white';
  } else {
    turn = turn === 'white' ? 'black' : 'white';
  }

  busy = false;
  render();

  // Hand off to AI if its turn
  if (!gameOver && aiEnabled && turn === aiColor) {
    aiTurn();
  }
}

// ----- Animation -----

function playExplosion(blast) {
  if (!blast.squares.length) return Promise.resolve();
  return new Promise(resolve => {
    const boardEl = document.getElementById('board');
    const wrap = document.getElementById('shake');

    const overlays = [];
    for (const { r, c } of blast.squares) {
      const sq = boardEl.children[r * SIZE + c];
      if (!sq) continue;
      const el = document.createElement('div');
      el.className = 'explosion ' + blast.css;
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
        if (BLAST_CAPABLE.has(p.type) && !p.spent) pe.classList.add('charged');
        pe.textContent = PIECE_INFO[p.type].symbol;
        const state = (BLAST_CAPABLE.has(p.type) && p.spent) ? ' (spent)' : '';
        pe.title = `${p.color} ${PIECE_INFO[p.type].name}${state}`;
        sq.appendChild(pe);
      }

      sq.addEventListener('click', () => onSquareClick(r, c));
      boardEl.appendChild(sq);
    }
  }

  const status = document.getElementById('status');
  status.classList.remove('winner', 'thinking');
  if (gameOver) {
    status.classList.add('winner');
    if (winner === 'draw') status.textContent = '💥 DOUBLE KO — DRAW! 💥';
    else status.textContent = `🏆 ${winner.toUpperCase()} WINS! 🏆`;
  } else if (aiEnabled && turn === aiColor && busy) {
    status.classList.add('thinking');
    status.textContent = '🤖 AI is thinking…';
  } else {
    const t = turn === 'white' ? 'White' : 'Black';
    const tag = (aiEnabled && turn === aiColor) ? ' (AI)' : '';
    status.textContent = `${t}'s turn${tag}`;
  }
}

function onSquareClick(r, c) {
  if (busy || gameOver) return;
  if (aiEnabled && turn === aiColor) return; // not your turn

  const piece = board[r][c];

  if (selected) {
    const move = legalMoves.find(m => m.r === r && m.c === c);
    if (move) {
      const from = selected;
      selected = null;
      legalMoves = [];
      makeMove(from.r, from.c, r, c);
      return;
    }
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
  if (aiEnabled && turn === aiColor) aiTurn();
});

document.getElementById('ai-toggle').addEventListener('change', (e) => {
  aiEnabled = e.target.checked;
  render();
  if (aiEnabled && !gameOver && turn === aiColor && !busy) aiTurn();
});

initBoard();
render();
