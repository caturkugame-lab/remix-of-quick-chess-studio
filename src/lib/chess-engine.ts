// Lightweight chess engine - full legal move validation

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';
export type Piece = { type: PieceType; color: PieceColor };
export type Square = Piece | null;
export type Board = Square[][];
export type Position = { row: number; col: number };
export type Move = {
  from: Position;
  to: Position;
  piece: Piece;
  captured?: Piece;
  promotion?: PieceType;
  castling?: 'kingside' | 'queenside';
  enPassant?: boolean;
};

export type GameState = {
  board: Board;
  turn: PieceColor;
  castling: { w: { k: boolean; q: boolean }; b: { k: boolean; q: boolean } };
  enPassantTarget: Position | null;
  halfMoveClock: number;
  fullMoveNumber: number;
  moveHistory: Move[];
  status: 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned';
  winner: PieceColor | null;
};

export function createInitialBoard(): Board {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));
  const backRow: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRow[c], color: 'b' };
    board[1][c] = { type: 'p', color: 'b' };
    board[6][c] = { type: 'p', color: 'w' };
    board[7][c] = { type: backRow[c], color: 'w' };
  }
  return board;
}

export function createInitialState(): GameState {
  return {
    board: createInitialBoard(),
    turn: 'w',
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    moveHistory: [],
    status: 'active',
    winner: null,
  };
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.map(sq => sq ? { ...sq } : null));
}

function findKing(board: Board, color: PieceColor): Position {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.type === 'k' && board[r][c]?.color === color)
        return { row: r, col: c };
  return { row: -1, col: -1 };
}

function isSquareAttacked(board: Board, pos: Position, byColor: PieceColor): boolean {
  const { row, col } = pos;
  // Pawn attacks
  const pawnDir = byColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const r = row + pawnDir, c = col + dc;
    if (inBounds(r, c) && board[r][c]?.type === 'p' && board[r][c]?.color === byColor) return true;
  }
  // Knight attacks
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = row + dr, c = col + dc;
    if (inBounds(r, c) && board[r][c]?.type === 'n' && board[r][c]?.color === byColor) return true;
  }
  // King attacks
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (inBounds(r, c) && board[r][c]?.type === 'k' && board[r][c]?.color === byColor) return true;
    }
  // Sliding pieces (bishop/rook/queen)
  const directions = [
    { dr: -1, dc: 0, types: ['r', 'q'] as PieceType[] },
    { dr: 1, dc: 0, types: ['r', 'q'] as PieceType[] },
    { dr: 0, dc: -1, types: ['r', 'q'] as PieceType[] },
    { dr: 0, dc: 1, types: ['r', 'q'] as PieceType[] },
    { dr: -1, dc: -1, types: ['b', 'q'] as PieceType[] },
    { dr: -1, dc: 1, types: ['b', 'q'] as PieceType[] },
    { dr: 1, dc: -1, types: ['b', 'q'] as PieceType[] },
    { dr: 1, dc: 1, types: ['b', 'q'] as PieceType[] },
  ];
  for (const { dr, dc, types } of directions) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      const sq = board[r][c];
      if (sq) {
        if (sq.color === byColor && types.includes(sq.type)) return true;
        break;
      }
      r += dr; c += dc;
    }
  }
  return false;
}

export function isInCheck(board: Board, color: PieceColor): boolean {
  const king = findKing(board, color);
  return isSquareAttacked(board, king, color === 'w' ? 'b' : 'w');
}

function getRawMoves(state: GameState, from: Position): Move[] {
  const { board, turn, castling, enPassantTarget } = state;
  const piece = board[from.row][from.col];
  if (!piece || piece.color !== turn) return [];
  const moves: Move[] = [];
  const { row, col } = from;
  const addMove = (to: Position, extra?: Partial<Move>) => {
    moves.push({ from, to, piece, captured: board[to.row][to.col] || undefined, ...extra });
  };

  if (piece.type === 'p') {
    const dir = piece.color === 'w' ? -1 : 1;
    const startRow = piece.color === 'w' ? 6 : 1;
    const promoRow = piece.color === 'w' ? 0 : 7;
    // Forward
    if (inBounds(row + dir, col) && !board[row + dir][col]) {
      if (row + dir === promoRow) {
        for (const pr of ['q', 'r', 'b', 'n'] as PieceType[])
          addMove({ row: row + dir, col }, { promotion: pr });
      } else {
        addMove({ row: row + dir, col });
      }
      // Double push
      if (row === startRow && !board[row + 2 * dir][col])
        addMove({ row: row + 2 * dir, col });
    }
    // Captures
    for (const dc of [-1, 1]) {
      const nr = row + dir, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      if (board[nr][nc] && board[nr][nc]!.color !== piece.color) {
        if (nr === promoRow) {
          for (const pr of ['q', 'r', 'b', 'n'] as PieceType[])
            addMove({ row: nr, col: nc }, { promotion: pr });
        } else {
          addMove({ row: nr, col: nc });
        }
      }
      // En passant
      if (enPassantTarget && enPassantTarget.row === nr && enPassantTarget.col === nc) {
        addMove({ row: nr, col: nc }, { enPassant: true, captured: board[row][nc]! });
      }
    }
  } else if (piece.type === 'n') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const r = row + dr, c = col + dc;
      if (inBounds(r, c) && (!board[r][c] || board[r][c]!.color !== piece.color))
        addMove({ row: r, col: c });
    }
  } else if (piece.type === 'k') {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr, c = col + dc;
        if (inBounds(r, c) && (!board[r][c] || board[r][c]!.color !== piece.color))
          addMove({ row: r, col: c });
      }
    // Castling
    const cr = castling[turn];
    const enemy = turn === 'w' ? 'b' : 'w';
    if (cr.k && !board[row][5] && !board[row][6] &&
        !isSquareAttacked(board, { row, col: 4 }, enemy) &&
        !isSquareAttacked(board, { row, col: 5 }, enemy) &&
        !isSquareAttacked(board, { row, col: 6 }, enemy))
      addMove({ row, col: 6 }, { castling: 'kingside' });
    if (cr.q && !board[row][3] && !board[row][2] && !board[row][1] &&
        !isSquareAttacked(board, { row, col: 4 }, enemy) &&
        !isSquareAttacked(board, { row, col: 3 }, enemy) &&
        !isSquareAttacked(board, { row, col: 2 }, enemy))
      addMove({ row, col: 2 }, { castling: 'queenside' });
  } else {
    // Sliding pieces
    const dirs: number[][] = piece.type === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]] :
      piece.type === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
      [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of dirs) {
      let r = row + dr, c = col + dc;
      while (inBounds(r, c)) {
        if (board[r][c]) {
          if (board[r][c]!.color !== piece.color) addMove({ row: r, col: c });
          break;
        }
        addMove({ row: r, col: c });
        r += dr; c += dc;
      }
    }
  }
  return moves;
}

function applyMoveToBoard(board: Board, move: Move): Board {
  const newBoard = cloneBoard(board);
  const { from, to } = move;
  newBoard[to.row][to.col] = move.promotion
    ? { type: move.promotion, color: move.piece.color }
    : newBoard[from.row][from.col];
  newBoard[from.row][from.col] = null;
  if (move.enPassant) newBoard[from.row][to.col] = null;
  if (move.castling === 'kingside') {
    newBoard[from.row][5] = newBoard[from.row][7];
    newBoard[from.row][7] = null;
  }
  if (move.castling === 'queenside') {
    newBoard[from.row][3] = newBoard[from.row][0];
    newBoard[from.row][0] = null;
  }
  return newBoard;
}

export function getLegalMoves(state: GameState, from: Position): Move[] {
  return getRawMoves(state, from).filter(move => {
    const newBoard = applyMoveToBoard(state.board, move);
    return !isInCheck(newBoard, state.turn);
  });
}

export function getAllLegalMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (state.board[r][c]?.color === state.turn)
        moves.push(...getLegalMoves(state, { row: r, col: c }));
  return moves;
}

export function makeMove(state: GameState, move: Move): GameState {
  const newBoard = applyMoveToBoard(state.board, move);
  const newCastling = JSON.parse(JSON.stringify(state.castling));
  // Update castling rights
  if (move.piece.type === 'k') {
    newCastling[move.piece.color] = { k: false, q: false };
  }
  if (move.piece.type === 'r') {
    if (move.from.col === 0) newCastling[move.piece.color].q = false;
    if (move.from.col === 7) newCastling[move.piece.color].k = false;
  }
  // Rook captured
  if (move.captured?.type === 'r') {
    if (move.to.row === 0 && move.to.col === 0) newCastling.b.q = false;
    if (move.to.row === 0 && move.to.col === 7) newCastling.b.k = false;
    if (move.to.row === 7 && move.to.col === 0) newCastling.w.q = false;
    if (move.to.row === 7 && move.to.col === 7) newCastling.w.k = false;
  }

  const nextTurn: PieceColor = state.turn === 'w' ? 'b' : 'w';
  // En passant target
  let newEnPassant: Position | null = null;
  if (move.piece.type === 'p' && Math.abs(move.to.row - move.from.row) === 2) {
    newEnPassant = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
  }

  const newState: GameState = {
    board: newBoard,
    turn: nextTurn,
    castling: newCastling,
    enPassantTarget: newEnPassant,
    halfMoveClock: move.piece.type === 'p' || move.captured ? 0 : state.halfMoveClock + 1,
    fullMoveNumber: state.turn === 'b' ? state.fullMoveNumber + 1 : state.fullMoveNumber,
    moveHistory: [...state.moveHistory, move],
    status: 'active',
    winner: null,
  };

  // Check game end
  const legalMoves = getAllLegalMoves(newState);
  if (legalMoves.length === 0) {
    if (isInCheck(newBoard, nextTurn)) {
      newState.status = 'checkmate';
      newState.winner = state.turn;
    } else {
      newState.status = 'stalemate';
    }
  } else if (newState.halfMoveClock >= 100) {
    newState.status = 'draw';
  }

  return newState;
}

// Utility: position to algebraic notation
export function posToAlgebraic(pos: Position): string {
  return String.fromCharCode(97 + pos.col) + (8 - pos.row);
}

export function moveToAlgebraic(move: Move): string {
  const from = posToAlgebraic(move.from);
  const to = posToAlgebraic(move.to);
  const promo = move.promotion ? move.promotion.toUpperCase() : '';
  return from + to + promo;
}

export function getRankTier(elo: number): { name: string; color: string } {
  if (elo >= 1800) return { name: 'Master', color: 'var(--rank-master)' };
  if (elo >= 1600) return { name: 'Diamond', color: 'var(--rank-diamond)' };
  if (elo >= 1400) return { name: 'Platinum', color: 'var(--rank-platinum)' };
  if (elo >= 1200) return { name: 'Gold', color: 'var(--rank-gold)' };
  if (elo >= 1000) return { name: 'Silver', color: 'var(--rank-silver)' };
  return { name: 'Bronze', color: 'var(--rank-bronze)' };
}

export const PIECE_UNICODE: Record<string, string> = {
  'wk': '♔', 'wq': '♕', 'wr': '♖', 'wb': '♗', 'wn': '♘', 'wp': '♙',
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟',
};
