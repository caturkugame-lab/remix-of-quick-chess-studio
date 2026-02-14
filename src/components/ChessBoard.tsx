import { useRef, useEffect, useState, useCallback } from 'react';
import {
  GameState, Position, Move, getLegalMoves, makeMove,
  PIECE_UNICODE, isInCheck, createInitialState,
} from '@/lib/chess-engine';

type Props = {
  gameState: GameState;
  playerColor: 'w' | 'b';
  onMove: (move: Move) => void;
  interactive?: boolean;
};

const BOARD_PADDING = 0;

export default function ChessBoard({ gameState, playerColor, onMove, interactive = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [boardSize, setBoardSize] = useState(360);
  const [promotionMove, setPromotionMove] = useState<{ from: Position; to: Position } | null>(null);

  const squareSize = boardSize / 8;
  const flipped = playerColor === 'b';

  // Responsive sizing
  useEffect(() => {
    const resize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const maxSize = Math.min(w, window.innerHeight - 200);
        setBoardSize(Math.floor(maxSize / 8) * 8);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const toBoard = useCallback((row: number, col: number): { row: number; col: number } => {
    return flipped ? { row: 7 - row, col: 7 - col } : { row, col };
  }, [flipped]);

  // Draw board
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = boardSize * dpr;
    canvas.height = boardSize * dpr;
    canvas.style.width = `${boardSize}px`;
    canvas.style.height = `${boardSize}px`;
    ctx.scale(dpr, dpr);

    const style = getComputedStyle(document.documentElement);
    const lightColor = `hsl(${style.getPropertyValue('--board-light').trim()})`;
    const darkColor = `hsl(${style.getPropertyValue('--board-dark').trim()})`;
    const highlightColor = `hsl(${style.getPropertyValue('--board-highlight').trim()})`;
    const dotColor = `hsl(${style.getPropertyValue('--board-move-dot').trim()})`;
    const checkColor = `hsl(${style.getPropertyValue('--board-check').trim()})`;

    const lastMove = gameState.moveHistory[gameState.moveHistory.length - 1];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const displayPos = flipped ? { row: 7 - r, col: 7 - c } : { row: r, col: c };
        const x = displayPos.col * squareSize;
        const y = displayPos.row * squareSize;
        const isLight = (r + c) % 2 === 0;

        // Base color
        ctx.fillStyle = isLight ? lightColor : darkColor;
        ctx.fillRect(x, y, squareSize, squareSize);

        // Last move highlight
        if (lastMove) {
          if ((lastMove.from.row === r && lastMove.from.col === c) ||
              (lastMove.to.row === r && lastMove.to.col === c)) {
            ctx.fillStyle = highlightColor + '80';
            ctx.fillRect(x, y, squareSize, squareSize);
          }
        }

        // Selected square
        if (selectedSquare?.row === r && selectedSquare?.col === c) {
          ctx.fillStyle = highlightColor + 'B0';
          ctx.fillRect(x, y, squareSize, squareSize);
        }

        // Check highlight
        const piece = gameState.board[r][c];
        if (piece?.type === 'k' && isInCheck(gameState.board, piece.color) && piece.color === gameState.turn) {
          ctx.fillStyle = checkColor + '90';
          ctx.fillRect(x, y, squareSize, squareSize);
        }

        // Draw piece
        if (piece) {
          const key = piece.color + piece.type;
          ctx.font = `${squareSize * 0.75}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = piece.color === 'w' ? '#FFFFFF' : '#1a1a2e';
          ctx.strokeStyle = piece.color === 'w' ? '#333' : '#888';
          ctx.lineWidth = 1;
          ctx.strokeText(PIECE_UNICODE[key], x + squareSize / 2, y + squareSize / 2 + 2);
          ctx.fillText(PIECE_UNICODE[key], x + squareSize / 2, y + squareSize / 2 + 2);
        }
      }
    }

    // Draw legal move dots
    for (const move of legalMoves) {
      const dp = flipped
        ? { row: 7 - move.to.row, col: 7 - move.to.col }
        : { row: move.to.row, col: move.to.col };
      const cx = dp.col * squareSize + squareSize / 2;
      const cy = dp.row * squareSize + squareSize / 2;
      ctx.beginPath();
      if (gameState.board[move.to.row][move.to.col]) {
        // Capture indicator - ring
        ctx.arc(cx, cy, squareSize * 0.42, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = dotColor + 'A0';
        ctx.stroke();
      } else {
        // Move dot
        ctx.arc(cx, cy, squareSize * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = dotColor + '80';
        ctx.fill();
      }
    }

    // File/Rank labels
    ctx.font = `bold ${squareSize * 0.18}px 'Space Grotesk', sans-serif`;
    const labelColor = style.getPropertyValue('--muted-foreground').trim();
    ctx.fillStyle = `hsl(${labelColor})`;
    for (let i = 0; i < 8; i++) {
      const file = flipped ? String.fromCharCode(104 - i) : String.fromCharCode(97 + i);
      const rank = flipped ? String(i + 1) : String(8 - i);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(rank, 3, i * squareSize + 3);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(file, (i + 1) * squareSize - 3, boardSize - 3);
    }
  }, [gameState, selectedSquare, legalMoves, boardSize, squareSize, flipped]);

  const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!interactive || gameState.turn !== playerColor || gameState.status !== 'active') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const displayCol = Math.floor(x / squareSize);
    const displayRow = Math.floor(y / squareSize);
    const pos = toBoard(displayRow, displayCol);

    if (selectedSquare) {
      // Try to make move
      const move = legalMoves.find(m => m.to.row === pos.row && m.to.col === pos.col);
      if (move) {
        // Check if promotion
        const promoMoves = legalMoves.filter(m => m.to.row === pos.row && m.to.col === pos.col && m.promotion);
        if (promoMoves.length > 0) {
          setPromotionMove({ from: selectedSquare, to: pos });
          setSelectedSquare(null);
          setLegalMoves([]);
          return;
        }
        onMove(move);
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
      // Select new piece
      const piece = gameState.board[pos.row][pos.col];
      if (piece && piece.color === playerColor) {
        setSelectedSquare(pos);
        setLegalMoves(getLegalMoves(gameState, pos));
        return;
      }
      setSelectedSquare(null);
      setLegalMoves([]);
    } else {
      const piece = gameState.board[pos.row][pos.col];
      if (piece && piece.color === playerColor) {
        setSelectedSquare(pos);
        setLegalMoves(getLegalMoves(gameState, pos));
      }
    }
  }, [interactive, gameState, playerColor, selectedSquare, legalMoves, squareSize, toBoard, onMove]);

  const handlePromotion = (pieceType: 'q' | 'r' | 'b' | 'n') => {
    if (!promotionMove) return;
    const moves = getLegalMoves(gameState, promotionMove.from);
    const move = moves.find(m =>
      m.to.row === promotionMove.to.row &&
      m.to.col === promotionMove.to.col &&
      m.promotion === pieceType
    );
    if (move) onMove(move);
    setPromotionMove(null);
  };

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center">
      <div className="relative">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onTouchStart={handleClick}
          className="rounded-lg shadow-lg cursor-pointer touch-none"
          style={{ width: boardSize, height: boardSize }}
        />
        {promotionMove && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg backdrop-blur-sm">
            <div className="flex gap-3 p-4 bg-card rounded-xl shadow-xl border border-border">
              {(['q', 'r', 'b', 'n'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => handlePromotion(t)}
                  className="w-14 h-14 text-3xl flex items-center justify-center rounded-lg bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {PIECE_UNICODE[playerColor + t]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
