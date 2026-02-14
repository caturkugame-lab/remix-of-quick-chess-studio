import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Crown, ArrowLeft, ChevronLeft, ChevronRight, SkipBack, SkipForward,
  Play, Pause, Trophy, Minus, X as XIcon, Clock
} from 'lucide-react';
import {
  createInitialState, makeMove, posToAlgebraic, PIECE_UNICODE,
  type GameState, type Move, type Board, type Piece
} from '@/lib/chess-engine';

type GameRecord = {
  id: string;
  white_player: string;
  black_player: string;
  moves: any;
  result: string | null;
  status: string;
  time_control: string;
  started_at: string;
  ended_at: string | null;
  elo_change_white: number | null;
  elo_change_black: number | null;
};

type ProfileMap = Record<string, { username: string; elo_rating: number }>;

function MiniBoard({ board, flipped }: { board: Board; flipped: boolean }) {
  const size = 160;
  const sq = size / 8;
  return (
    <div className="rounded-md overflow-hidden border border-border/50 flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {Array.from({ length: 64 }, (_, i) => {
          const r = Math.floor(i / 8);
          const c = i % 8;
          const dr = flipped ? 7 - r : r;
          const dc = flipped ? 7 - c : c;
          const isLight = (r + c) % 2 === 0;
          const piece = board[dr]?.[dc];
          return (
            <g key={i}>
              <rect
                x={c * sq} y={r * sq} width={sq} height={sq}
                fill={isLight ? 'hsl(var(--board-light))' : 'hsl(var(--board-dark))'}
              />
              {piece && (
                <text
                  x={c * sq + sq / 2} y={r * sq + sq * 0.78}
                  textAnchor="middle" fontSize={sq * 0.8}
                  fill={piece.color === 'w' ? 'hsl(var(--foreground))' : 'hsl(var(--foreground))'}
                >
                  {PIECE_UNICODE[piece.color + piece.type]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ReplayViewer({ game, profiles, onClose }: { game: GameRecord; profiles: ProfileMap; onClose: () => void }) {
  const { profile } = useAuth();
  const moves: Move[] = useMemo(() => {
    if (!Array.isArray(game.moves)) return [];
    return game.moves as unknown as Move[];
  }, [game.moves]);

  const states = useMemo(() => {
    const result: GameState[] = [createInitialState()];
    let state = result[0];
    for (const move of moves) {
      try {
        state = makeMove(state, move);
        result.push(state);
      } catch { break; }
    }
    return result;
  }, [moves]);

  const [currentMove, setCurrentMove] = useState(states.length - 1);
  const [autoPlaying, setAutoPlaying] = useState(false);

  useEffect(() => {
    if (!autoPlaying) return;
    if (currentMove >= states.length - 1) { setAutoPlaying(false); return; }
    const timer = setTimeout(() => setCurrentMove(m => m + 1), 800);
    return () => clearTimeout(timer);
  }, [autoPlaying, currentMove, states.length]);

  const isWhite = game.white_player === profile?.user_id;
  const whiteName = profiles[game.white_player]?.username || 'Unknown';
  const blackName = profiles[game.black_player]?.username || 'Unknown';

  const moveNotation = useCallback((move: Move, idx: number) => {
    const piece = move.piece.type !== 'p' ? PIECE_UNICODE[move.piece.color + move.piece.type] : '';
    const capture = move.captured ? 'x' : '';
    const from = move.piece.type === 'p' && move.captured ? posToAlgebraic(move.from)[0] : '';
    const to = posToAlgebraic(move.to);
    const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    if (move.castling === 'kingside') return 'O-O';
    if (move.castling === 'queenside') return 'O-O-O';
    return `${piece}${from}${capture}${to}${promo}`;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 p-4 border-b border-border/50">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold">Game Replay</h1>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Players */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-foreground border border-border" />
            <span className="font-semibold">{whiteName}</span>
          </div>
          <span className="text-muted-foreground">vs</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{blackName}</span>
            <div className="w-3 h-3 rounded-full bg-muted-foreground border border-border" />
          </div>
        </div>

        {/* Board */}
        <div className="flex justify-center">
          <MiniBoard board={states[currentMove].board} flipped={!isWhite} />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setAutoPlaying(false); setCurrentMove(0); }}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setAutoPlaying(false); setCurrentMove(m => Math.max(0, m - 1)); }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAutoPlaying(p => !p)}>
            {autoPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setAutoPlaying(false); setCurrentMove(m => Math.min(states.length - 1, m + 1)); }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setAutoPlaying(false); setCurrentMove(states.length - 1); }}>
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Move {currentMove} / {states.length - 1}
        </p>

        {/* Move List */}
        <Card className="border-border/30">
          <CardContent className="p-3">
            <ScrollArea className="h-48">
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm font-mono">
                {moves.map((move, i) => {
                  const moveNum = Math.floor(i / 2) + 1;
                  const isActive = i + 1 === currentMove;
                  return (
                    <button
                      key={i}
                      onClick={() => { setAutoPlaying(false); setCurrentMove(i + 1); }}
                      className={`text-left px-2 py-0.5 rounded transition-colors ${
                        isActive ? 'bg-primary/20 text-primary font-bold' : 'hover:bg-secondary'
                      } ${i % 2 === 0 ? 'col-start-1' : 'col-start-2'}`}
                    >
                      {i % 2 === 0 && <span className="text-muted-foreground mr-1">{moveNum}.</span>}
                      {moveNotation(move, i)}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Result */}
        <div className="text-center">
          <Badge variant="outline" className="text-sm font-semibold">
            {game.result === 'white' ? `${whiteName} wins` :
             game.result === 'black' ? `${blackName} wins` :
             game.result === 'draw' ? 'Draw' : game.status}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default function History() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [gamesLoading, setGamesLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses' | 'draws'>('all');
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!profile) return;
    const fetchGames = async () => {
      const { data } = await supabase
        .from('games')
        .select('*')
        .or(`white_player.eq.${profile.user_id},black_player.eq.${profile.user_id}`)
        .in('status', ['completed', 'checkmate', 'stalemate', 'draw', 'resigned'])
        .order('ended_at', { ascending: false })
        .limit(100);

      const gamesList = (data || []) as GameRecord[];
      setGames(gamesList);

      // Fetch profiles for all players
      const playerIds = new Set<string>();
      gamesList.forEach(g => { playerIds.add(g.white_player); playerIds.add(g.black_player); });
      if (playerIds.size > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_id, username, elo_rating')
          .in('user_id', Array.from(playerIds));
        const map: ProfileMap = {};
        (profileData || []).forEach(p => { map[p.user_id] = p; });
        setProfiles(map);
      }
      setGamesLoading(false);
    };
    fetchGames();
  }, [profile]);

  const filteredGames = useMemo(() => {
    if (!profile) return [];
    return games.filter(g => {
      const isWhite = g.white_player === profile.user_id;
      const won = (g.result === 'white' && isWhite) || (g.result === 'black' && !isWhite);
      const drew = g.result === 'draw';
      if (filter === 'wins') return won;
      if (filter === 'losses') return !won && !drew;
      if (filter === 'draws') return drew;
      return true;
    });
  }, [games, filter, profile]);

  if (selectedGame) {
    return <ReplayViewer game={selectedGame} profiles={profiles} onClose={() => setSelectedGame(null)} />;
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="flex items-center gap-3 p-4 border-b border-border/50">
        <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold">Match History</h1>
        <Badge variant="secondary" className="ml-auto">{games.length} games</Badge>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <Tabs value={filter} onValueChange={v => setFilter(v as any)}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="wins">Wins</TabsTrigger>
            <TabsTrigger value="losses">Losses</TabsTrigger>
            <TabsTrigger value="draws">Draws</TabsTrigger>
          </TabsList>
        </Tabs>

        {gamesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : filteredGames.length === 0 ? (
          <Card className="border-border/30">
            <CardContent className="p-8 text-center text-muted-foreground">
              No games found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredGames.map(game => {
              const isWhite = game.white_player === profile.user_id;
              const opponentId = isWhite ? game.black_player : game.white_player;
              const opponent = profiles[opponentId];
              const won = (game.result === 'white' && isWhite) || (game.result === 'black' && !isWhite);
              const drew = game.result === 'draw';
              const eloChange = isWhite ? game.elo_change_white : game.elo_change_black;
              const movesCount = Array.isArray(game.moves) ? game.moves.length : 0;
              const date = game.ended_at ? new Date(game.ended_at) : new Date(game.started_at);

              return (
                <Card
                  key={game.id}
                  className="border-border/30 cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => setSelectedGame(game)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          won ? 'bg-green-500/15 text-green-500' : drew ? 'bg-yellow-500/15 text-yellow-500' : 'bg-destructive/15 text-destructive'
                        }`}>
                          {won ? <Trophy className="h-4 w-4" /> : drew ? <Minus className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            vs {opponent?.username || 'Unknown'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="capitalize">{game.time_control}</span>
                            <span>·</span>
                            <span>{movesCount} moves</span>
                            <span>·</span>
                            <span>{date.toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`text-sm font-bold ${
                          (eloChange ?? 0) > 0 ? 'text-green-500' : (eloChange ?? 0) < 0 ? 'text-destructive' : 'text-muted-foreground'
                        }`}>
                          {(eloChange ?? 0) > 0 ? '+' : ''}{eloChange ?? 0}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {isWhite ? '⬜ White' : '⬛ Black'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border/50 px-2 py-2 z-50">
        <div className="max-w-lg mx-auto flex justify-around">
          {[
            { icon: Crown, label: 'Home', path: '/' },
            { icon: Clock, label: 'Play', path: '/play' },
            { icon: Clock, label: 'History', path: '/history' },
            { icon: Trophy, label: 'Ranks', path: '/leaderboard' },
          ].map(({ icon: Icon, label, path }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs transition-colors ${
                window.location.pathname === path
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
