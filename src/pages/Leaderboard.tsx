import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Crown, ArrowLeft, Trophy, Clock, Medal } from 'lucide-react';
import { getRankTier } from '@/lib/chess-engine';

type LeaderboardPlayer = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  elo_rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
};

const RANK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'master', label: 'Master', min: 1800 },
  { value: 'diamond', label: 'Diamond', min: 1600, max: 1799 },
  { value: 'platinum', label: 'Platinum', min: 1400, max: 1599 },
  { value: 'gold', label: 'Gold', min: 1200, max: 1399 },
  { value: 'silver', label: 'Silver', min: 1000, max: 1199 },
  { value: 'bronze', label: 'Bronze', max: 999 },
];

export default function Leaderboard() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [rankFilter, setRankFilter] = useState('all');

  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  useEffect(() => {
    const fetchPlayers = async () => {
      setPlayersLoading(true);
      let query = supabase
        .from('profiles')
        .select('user_id, username, avatar_url, elo_rating, games_played, wins, losses, draws')
        .order('elo_rating', { ascending: false })
        .limit(100);

      const filter = RANK_FILTERS.find(f => f.value === rankFilter);
      if (filter && filter.value !== 'all') {
        if (filter.min != null) query = query.gte('elo_rating', filter.min);
        if (filter.max != null) query = query.lte('elo_rating', filter.max);
      }

      const { data } = await query;
      setPlayers((data || []) as LeaderboardPlayer[]);
      setPlayersLoading(false);
    };
    fetchPlayers();
  }, [rankFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  const podiumIcons = [
    { bg: 'bg-yellow-500/15', text: 'text-yellow-500', icon: '🥇' },
    { bg: 'bg-gray-400/15', text: 'text-gray-400', icon: '🥈' },
    { bg: 'bg-amber-700/15', text: 'text-amber-700', icon: '🥉' },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="flex items-center gap-3 p-4 border-b border-border/50">
        <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Trophy className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">Leaderboard</h1>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Rank Filter */}
        <Tabs value={rankFilter} onValueChange={setRankFilter}>
          <TabsList className="w-full flex overflow-x-auto">
            {RANK_FILTERS.map(f => (
              <TabsTrigger key={f.value} value={f.value} className="text-xs flex-shrink-0">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Your rank */}
        {profile && rankFilter === 'all' && (
          <Card className="border-primary/30 chess-gradient text-primary-foreground">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-primary-foreground/30">
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground font-bold">
                    {profile.username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{profile.username}</p>
                  <p className="text-xs opacity-80">
                    {profile.wins}W / {profile.losses}L / {profile.draws}D
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">{profile.elo_rating}</p>
                <Badge className="bg-primary-foreground/20 text-primary-foreground text-xs border-0">
                  {getRankTier(profile.elo_rating).name}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Player List */}
        {playersLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : players.length === 0 ? (
          <Card className="border-border/30">
            <CardContent className="p-8 text-center text-muted-foreground">
              No players in this tier yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {players.map((player, idx) => {
              const rank = getRankTier(player.elo_rating);
              const isMe = player.user_id === profile?.user_id;
              const podium = idx < 3 && rankFilter === 'all' ? podiumIcons[idx] : null;
              const winRate = player.games_played > 0
                ? Math.round((player.wins / player.games_played) * 100)
                : 0;

              return (
                <Card
                  key={player.user_id}
                  className={`border-border/30 transition-colors ${isMe ? 'border-primary/40 bg-primary/5' : ''}`}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    {/* Rank number */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      podium ? `${podium.bg} ${podium.text}` : 'bg-secondary text-muted-foreground'
                    }`}>
                      {podium ? podium.icon : `#${idx + 1}`}
                    </div>

                    <Avatar className="h-9 w-9 flex-shrink-0">
                      <AvatarImage src={player.avatar_url || ''} />
                      <AvatarFallback className="bg-secondary text-xs font-bold">
                        {player.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{player.username}</p>
                        {isMe && <Badge variant="outline" className="text-[10px] px-1 py-0">You</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 font-semibold"
                          style={{ borderColor: rank.color, color: rank.color }}
                        >
                          {rank.name}
                        </Badge>
                        <span>{player.games_played} games</span>
                        <span>·</span>
                        <span>{winRate}% WR</span>
                      </div>
                    </div>

                    <span className="text-lg font-bold text-primary flex-shrink-0">
                      {player.elo_rating}
                    </span>
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
