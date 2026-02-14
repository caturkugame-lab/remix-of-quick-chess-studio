import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Zap, Timer, X, Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TIME_CONTROLS = [
  { id: 'blitz', label: 'Blitz', time: '5 min', icon: Zap, seconds: 300 },
  { id: 'rapid', label: 'Rapid', time: '10 min', icon: Clock, seconds: 600 },
  { id: 'classic', label: 'Classic', time: '30 min', icon: Timer, seconds: 1800 },
];

const QUEUE_TIMEOUT = 120; // 2 minutes

export default function Play() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const isRanked = searchParams.get('mode') === 'ranked';
  const [selectedTC, setSelectedTC] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  // Search timer + queue timeout
  useEffect(() => {
    if (!searching) return;
    const interval = setInterval(() => {
      setSearchTime(t => {
        if (t + 1 >= QUEUE_TIMEOUT) {
          cancelSearch();
          toast({ title: 'Queue timed out. Try again.', variant: 'destructive' });
          return 0;
        }
        return t + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [searching]);

  // Poll for matches (backup to realtime)
  useEffect(() => {
    if (!searching || !profile || !selectedTC) return;

    const poll = async () => {
      const tc = TIME_CONTROLS.find(t => t.id === selectedTC);
      const { data: opponents } = await supabase
        .from('matchmaking_queue')
        .select('*')
        .eq('time_control', selectedTC)
        .eq('status', 'waiting')
        .neq('user_id', profile.user_id)
        .gte('elo_rating', profile.elo_rating - 200)
        .lte('elo_rating', profile.elo_rating + 200)
        .order('queued_at', { ascending: true })
        .limit(1);

      if (opponents && opponents.length > 0) {
        const opponent = opponents[0];
        const whitePlayer = Math.random() > 0.5 ? profile.user_id : opponent.user_id;
        const blackPlayer = whitePlayer === profile.user_id ? opponent.user_id : profile.user_id;

        const { data: game } = await supabase.from('games').insert({
          white_player: whitePlayer,
          black_player: blackPlayer,
          time_control: selectedTC,
          time_white: tc?.seconds || 600,
          time_black: tc?.seconds || 600,
          status: 'active',
        }).select().single();

        await supabase.from('matchmaking_queue').delete().in('user_id', [profile.user_id, opponent.user_id]);
        if (game) {
          setSearching(false);
          navigate(`/game/${game.id}`);
        }
      }
    };

    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [searching, profile, selectedTC, navigate]);

  // Realtime listener for being matched by another player
  useEffect(() => {
    if (!searching || !profile) return;
    const channel = supabase
      .channel('matchmaking')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'games',
        filter: `white_player=eq.${profile.user_id}`,
      }, (payload) => { navigate(`/game/${payload.new.id}`); })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'games',
        filter: `black_player=eq.${profile.user_id}`,
      }, (payload) => { navigate(`/game/${payload.new.id}`); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [searching, profile, navigate]);

  const startSearch = async () => {
    if (!profile || !selectedTC) return;
    setSearching(true);
    setSearchTime(0);

    // Clean up any stale queue entries first
    await supabase.from('matchmaking_queue').delete().eq('user_id', profile.user_id);

    await supabase.from('matchmaking_queue').insert({
      user_id: profile.user_id,
      elo_rating: profile.elo_rating,
      time_control: selectedTC,
      status: 'waiting',
      queued_at: new Date().toISOString(),
    });
  };

  const cancelSearch = async () => {
    if (profile) {
      await supabase.from('matchmaking_queue').delete().eq('user_id', profile.user_id);
    }
    setSearching(false);
    setSearchTime(0);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (profile && searching) {
        supabase.from('matchmaking_queue').delete().eq('user_id', profile.user_id);
      }
    };
  }, [profile, searching]);

  if (loading || !profile) {
    return <div className="min-h-screen bg-background p-4"><Skeleton className="h-60 rounded-xl" /></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="flex items-center gap-3 p-4 border-b border-border/50">
        <button onClick={() => { cancelSearch(); navigate('/'); }} className="p-2 rounded-lg hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold">{isRanked ? 'Ranked Match' : 'Quick Play'}</h1>
        {isRanked && <Badge className="chess-gradient text-primary-foreground text-xs">Ranked</Badge>}
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-5">
        {!searching ? (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Select Time Control
            </h2>
            <div className="grid gap-3">
              {TIME_CONTROLS.map(tc => {
                const Icon = tc.icon;
                return (
                  <Card
                    key={tc.id}
                    className={`cursor-pointer transition-all border-2 ${
                      selectedTC === tc.id ? 'border-primary shadow-lg' : 'border-transparent hover:border-border'
                    }`}
                    onClick={() => setSelectedTC(tc.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${selectedTC === tc.id ? 'chess-gradient' : 'bg-secondary'}`}>
                        <Icon className={`h-6 w-6 ${selectedTC === tc.id ? 'text-primary-foreground' : 'text-foreground'}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base">{tc.label}</h3>
                        <p className="text-sm text-muted-foreground">{tc.time} per side</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Button
              onClick={startSearch}
              disabled={!selectedTC}
              className="w-full h-14 text-base font-semibold chess-gradient rounded-xl shadow-md"
            >
              Find Opponent
            </Button>
          </>
        ) : (
          <Card className="border-border/50">
            <CardContent className="p-8 flex flex-col items-center gap-5">
              <div className="relative">
                <Loader2 className="h-16 w-16 text-primary animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold">{searchTime}s</span>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold">Finding Opponent...</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedTC && TIME_CONTROLS.find(t => t.id === selectedTC)?.label} •{' '}
                  ELO {profile.elo_rating} ±200
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Timeout in {QUEUE_TIMEOUT - searchTime}s
                </p>
              </div>
              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-1000"
                  style={{ width: `${((QUEUE_TIMEOUT - searchTime) / QUEUE_TIMEOUT) * 100}%` }}
                />
              </div>
              <Button variant="outline" onClick={cancelSearch} className="gap-2">
                <X className="h-4 w-4" /> Cancel
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
