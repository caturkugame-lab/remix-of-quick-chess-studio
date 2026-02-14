import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import ChessBoard from '@/components/ChessBoard';
import ReconnectOverlay from '@/components/ReconnectOverlay';
import MusicPlayer from '@/components/MusicPlayer';
import {
  GameState, Move, createInitialState, makeMove,
  isInCheck, PieceColor, Position, getLegalMoves,
} from '@/lib/chess-engine';
import { useConnectionStatus, useMoveRetry } from '@/hooks/use-game-stability';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Flag, ArrowLeft, Clock, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type GameRow = {
  id: string;
  white_player: string;
  black_player: string;
  moves: any;
  result: string | null;
  time_control: string;
  time_white: number;
  time_black: number;
  elo_change_white: number;
  elo_change_black: number;
  status: string;
  started_at: string;
  ended_at: string | null;
  last_move_at: string | null;
};

// Debug logger
function logSync(action: string, detail?: any) {
  console.log(`[ChessSync] ${action}`, detail ?? '');
}

function replayMoves(movesData: any[]): GameState {
  let state = createInitialState();
  for (const m of movesData) {
    const from: Position = { row: m.from.row, col: m.from.col };
    const legal = getLegalMoves(state, from);
    const lm = legal.find(l =>
      l.to.row === m.to.row && l.to.col === m.to.col &&
      (!m.promotion || l.promotion === m.promotion)
    );
    if (lm) state = makeMove(state, lm);
  }
  return state;
}

function applyRowToState(row: GameRow): GameState {
  let state = replayMoves((row.moves as any[]) || []);
  if (row.status === 'completed') {
    state.status = row.result === 'draw' ? 'draw' : 'checkmate';
    state.winner = row.result === 'white' ? 'w' : row.result === 'black' ? 'b' : null;
  }
  return state;
}

export default function Game() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { status: connStatus, offlineSince } = useConnectionStatus();
  const { submitMove, pendingCount } = useMoveRetry();

  const [gameRow, setGameRow] = useState<GameRow | null>(null);
  const [gameState, setGameState] = useState<GameState>(createInitialState());
  const [playerColor, setPlayerColor] = useState<PieceColor>('w');
  const [timeWhite, setTimeWhite] = useState(600);
  const [timeBlack, setTimeBlack] = useState(600);
  const [opponentProfile, setOpponentProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submittingMove, setSubmittingMove] = useState(false);

  // Refs for latest values (avoid stale closures)
  const gameRowRef = useRef<GameRow | null>(null);
  const moveCountRef = useRef(0);

  // Sync refs
  useEffect(() => {
    gameRowRef.current = gameRow;
    moveCountRef.current = ((gameRow?.moves as any[]) || []).length;
  }, [gameRow]);

  // Apply a game row update, deduplicating by move count
  const syncFromRow = useCallback((data: GameRow, source: string) => {
    const incomingMoveCount = ((data.moves as any[]) || []).length;
    const currentMoveCount = moveCountRef.current;

    // Skip if we already have this state or newer (prevents duplicate/stale updates)
    if (incomingMoveCount < currentMoveCount) {
      logSync(`SKIP ${source} (incoming=${incomingMoveCount} < current=${currentMoveCount})`);
      return;
    }
    if (incomingMoveCount === currentMoveCount && data.status === gameRowRef.current?.status) {
      logSync(`SKIP ${source} (same move count and status)`);
      return;
    }

    logSync(`APPLY ${source}`, { moveCount: incomingMoveCount, status: data.status });

    setGameRow(data);
    setTimeWhite(data.time_white);
    setTimeBlack(data.time_black);
    const state = applyRowToState(data);
    setGameState(state);

    if (data.status === 'completed') {
      logSync('GAME ENDED', { result: data.result });
    }
  }, []);

  // Fetch game from DB (used for initial load, reconnect, and polling fallback)
  const fetchGameState = useCallback(async (source: string) => {
    if (!id) return;
    logSync(`FETCH from DB (${source})`);
    const { data, error } = await supabase.from('games').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      logSync('FETCH failed', error);
      return;
    }
    syncFromRow(data as GameRow, source);
  }, [id, syncFromRow]);

  // --- Initial load ---
  useEffect(() => {
    if (!id || !profile) return;
    const fetchGame = async () => {
      const { data } = await supabase.from('games').select('*').eq('id', id).maybeSingle();
      if (!data) { navigate('/'); return; }
      const row = data as GameRow;
      setGameRow(row);
      setPlayerColor(row.white_player === profile.user_id ? 'w' : 'b');
      setTimeWhite(row.time_white);
      setTimeBlack(row.time_black);
      moveCountRef.current = ((row.moves as any[]) || []).length;
      gameRowRef.current = row;
      setGameState(applyRowToState(row));

      const oppId = row.white_player === profile.user_id ? row.black_player : row.white_player;
      const { data: opp } = await supabase.from('profiles').select('*').eq('user_id', oppId).maybeSingle();
      setOpponentProfile(opp);
      setLoading(false);
      logSync('INITIAL LOAD complete', { moveCount: ((row.moves as any[]) || []).length });
    };
    fetchGame();
  }, [id, profile, navigate]);

  // --- Realtime subscription ---
  useEffect(() => {
    if (!id) return;
    logSync('SUBSCRIBE realtime', { gameId: id });

    const channel = supabase
      .channel(`game-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${id}`,
      }, (payload) => {
        logSync('REALTIME event received', { moveCount: ((payload.new.moves as any[]) || []).length });
        syncFromRow(payload.new as GameRow, 'realtime');
      })
      .subscribe((status) => {
        logSync('CHANNEL status', status);
      });

    return () => {
      logSync('UNSUBSCRIBE realtime');
      supabase.removeChannel(channel);
    };
  }, [id, syncFromRow]);

  // --- Polling fallback: every 5s, fetch latest state ---
  useEffect(() => {
    if (!id || loading) return;
    const interval = setInterval(() => {
      // Only poll if game is still active
      if (gameRowRef.current?.status === 'active') {
        fetchGameState('poll-fallback');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [id, loading, fetchGameState]);

  // --- Reconnect: re-fetch when coming back online ---
  useEffect(() => {
    if (connStatus === 'connected' && id && !loading) {
      logSync('RECONNECT detected, fetching latest state');
      fetchGameState('reconnect');
    }
  }, [connStatus, id, loading, fetchGameState]);

  // Timer countdown
  useEffect(() => {
    if (!gameRow || gameRow.status !== 'active') return;
    const interval = setInterval(() => {
      if (gameState.turn === 'w') setTimeWhite(t => Math.max(0, t - 1));
      else setTimeBlack(t => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameRow, gameState.turn]);

  // Handle timeout
  useEffect(() => {
    if (timeWhite <= 0 && gameRow?.status === 'active') endGame('black');
    if (timeBlack <= 0 && gameRow?.status === 'active') endGame('white');
  }, [timeWhite, timeBlack]);

  // Auto-forfeit on disconnect timeout
  useEffect(() => {
    if (connStatus === 'disconnected' && gameRow?.status === 'active') {
      const result = playerColor === 'w' ? 'black' : 'white';
      endGame(result);
    }
  }, [connStatus]);

  const endGame = async (result: string) => {
    if (!gameRow) return;
    const K = 32;
    const scoreW = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
    const change = Math.round(K * (scoreW - 0.5));

    logSync('END GAME', { result, eloChange: change });

    await submitMove(`end-${gameRow.id}`, async () => {
      const resp = await supabase.functions.invoke('validate-move', {
        body: {
          gameId: gameRow.id,
          move: { from: { row: 0, col: 0 }, to: { row: 0, col: 0 } },
          gameEnd: {
            result,
            eloChangeWhite: change,
            eloChangeBlack: -change,
          },
        },
      });
      if (resp.error) throw resp.error;
    });
  };

  const handleMove = useCallback(async (move: Move) => {
    if (!gameRow || gameRow.status !== 'active' || submittingMove) return;
    setSubmittingMove(true);

    logSync('MOVE sent', {
      from: `${move.from.row},${move.from.col}`,
      to: `${move.to.row},${move.to.col}`,
      promotion: move.promotion,
    });

    // Optimistic update
    const newState = makeMove(gameState, move);
    setGameState(newState);

    const moveData = {
      from: { row: move.from.row, col: move.from.col },
      to: { row: move.to.row, col: move.to.col },
      promotion: move.promotion || null,
    };

    const isWhitePlayer = gameRow.white_player === profile?.user_id;
    const myTime = isWhitePlayer ? timeWhite : timeBlack;

    let gameEnd: any = undefined;
    if (newState.status === 'checkmate') {
      const scoreW = newState.winner === 'w' ? 1 : 0;
      const change = Math.round(32 * (scoreW - 0.5));
      gameEnd = {
        result: newState.winner === 'w' ? 'white' : 'black',
        eloChangeWhite: change,
        eloChangeBlack: -change,
      };
    } else if (newState.status === 'stalemate' || newState.status === 'draw') {
      gameEnd = { result: 'draw', eloChangeWhite: 0, eloChangeBlack: 0 };
    }

    const moveId = `move-${Date.now()}`;
    const success = await submitMove(moveId, async () => {
      logSync('MOVE submitting to server');
      const resp = await supabase.functions.invoke('validate-move', {
        body: {
          gameId: gameRow.id,
          move: moveData,
          timeRemaining: myTime,
          gameEnd,
        },
      });
      if (resp.error) throw resp.error;
      logSync('MOVE validated by server');
    });

    if (!success) {
      logSync('MOVE FAILED, using direct DB fallback');
      toast({ title: 'Move failed to sync. Retrying...', variant: 'destructive' });
      const currentMoves = (gameRow.moves as any[]) || [];
      const updateData: any = {
        moves: [...currentMoves, moveData],
        last_move_at: new Date().toISOString(),
      };
      if (isWhitePlayer) updateData.time_white = myTime;
      else updateData.time_black = myTime;

      if (gameEnd) {
        updateData.result = gameEnd.result;
        updateData.status = 'completed';
        updateData.ended_at = new Date().toISOString();
        updateData.elo_change_white = gameEnd.eloChangeWhite;
        updateData.elo_change_black = gameEnd.eloChangeBlack;
      }
      await supabase.from('games').update(updateData).eq('id', gameRow.id);
    }

    // After move is saved, force-fetch to ensure we have server state
    setTimeout(() => fetchGameState('post-move-verify'), 500);

    setSubmittingMove(false);
  }, [gameRow, gameState, timeWhite, timeBlack, profile, submitMove, submittingMove, toast, fetchGameState]);

  const handleResign = async () => {
    const result = playerColor === 'w' ? 'black' : 'white';
    await endGame(result);
    toast({ title: 'You resigned' });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return <div className="min-h-screen bg-background p-4"><Skeleton className="h-96 rounded-xl" /></div>;
  }

  const isMyTurn = gameState.turn === playerColor;
  const gameOver = gameRow?.status === 'completed';
  const isWhite = gameRow?.white_player === profile?.user_id;
  const myEloChange = isWhite ? gameRow?.elo_change_white : gameRow?.elo_change_black;
  const won = (gameRow?.result === 'white' && isWhite) || (gameRow?.result === 'black' && !isWhite);
  const drew = gameRow?.result === 'draw';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ReconnectOverlay
        status={connStatus}
        offlineSince={offlineSince}
        onForfeit={() => navigate('/')}
      />

      <header className="flex items-center justify-between p-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Badge variant="outline" className="text-xs">{gameRow?.time_control}</Badge>
          {gameOver && (
            <Badge className={`text-xs ${won ? 'bg-green-500/20 text-green-400' : drew ? 'bg-yellow-500/20 text-yellow-400' : 'bg-destructive/20 text-destructive'}`}>
              {won ? 'Victory' : drew ? 'Draw' : 'Defeat'}
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30">
              Syncing...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <MusicPlayer />
          {connStatus === 'connected' ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-destructive" />
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-3 gap-3 max-w-lg mx-auto w-full">
        {/* Opponent info */}
        <div className="w-full flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-secondary">
                {opponentProfile?.username?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{opponentProfile?.username || 'Opponent'}</span>
            <span className="text-xs text-muted-foreground">{opponentProfile?.elo_rating}</span>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1 rounded-lg font-mono text-sm font-bold ${
            gameState.turn !== playerColor && !gameOver ? 'bg-primary text-primary-foreground' : 'bg-secondary'
          }`}>
            <Clock className="h-3.5 w-3.5" />
            {formatTime(playerColor === 'w' ? timeBlack : timeWhite)}
          </div>
        </div>

        <ChessBoard
          gameState={gameState}
          playerColor={playerColor}
          onMove={handleMove}
          interactive={isMyTurn && !gameOver && !submittingMove}
        />

        {/* Player info */}
        <div className="w-full flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 border border-primary/30">
              <AvatarFallback className="text-xs bg-primary/10">
                {profile?.username?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{profile?.username}</span>
            <span className="text-xs text-muted-foreground">{profile?.elo_rating}</span>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1 rounded-lg font-mono text-sm font-bold ${
            isMyTurn && !gameOver ? 'bg-primary text-primary-foreground' : 'bg-secondary'
          }`}>
            <Clock className="h-3.5 w-3.5" />
            {formatTime(playerColor === 'w' ? timeWhite : timeBlack)}
          </div>
        </div>

        {!gameOver ? (
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={handleResign} className="flex-1 gap-2">
              <Flag className="h-4 w-4" /> Resign
            </Button>
          </div>
        ) : (
          <Card className="w-full border-border/50">
            <CardContent className="p-4 text-center space-y-3">
              <h3 className="text-lg font-bold">
                {won ? '🎉 Victory!' : drew ? '🤝 Draw' : '😔 Defeat'}
              </h3>
              <p className={`text-2xl font-bold ${(myEloChange || 0) > 0 ? 'text-green-500' : (myEloChange || 0) < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {(myEloChange || 0) > 0 ? '+' : ''}{myEloChange || 0} ELO
              </p>
              <div className="flex gap-2">
                <Button onClick={() => navigate('/play')} className="flex-1 chess-gradient">
                  New Game
                </Button>
                <Button variant="outline" onClick={() => navigate('/')} className="flex-1">
                  Lobby
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
