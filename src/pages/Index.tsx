import { useAuth } from '@/lib/auth-context';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, Swords, Trophy, History, BarChart3, Settings, Sun, Moon, LogOut, Download } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';
import { getRankTier } from '@/lib/chess-engine';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import { useToast } from '@/hooks/use-toast';

export default function Index() {
  const { user, profile, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const { canInstall, isInstalled, showPrompt, install, dismiss } = usePwaInstall();

  const handleInstall = async () => {
    const accepted = await install();
    if (accepted) {
      toast({ title: '✅ App installed successfully!' });
    }
  };

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
        .eq('status', 'completed')
        .order('ended_at', { ascending: false })
        .limit(5);
      setRecentGames(data || []);
      setGamesLoading(false);
    };
    fetchGames();
  }, [profile]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  const rank = getRankTier(profile.elo_rating);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">ChessMate</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button onClick={signOut} className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-5">
        {/* Player Card */}
        <Card className="border-border/50 shadow-lg overflow-hidden">
          <div className="h-2 chess-gradient" />
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary/30">
                <AvatarImage src={profile.avatar_url || ''} />
                <AvatarFallback className="text-xl font-bold bg-secondary">
                  {profile.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold truncate">{profile.username}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-bold text-primary">{profile.elo_rating}</span>
                  <Badge variant="outline" className="text-xs font-semibold">
                    {rank.name}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {profile.wins}W / {profile.losses}L / {profile.draws}D
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => navigate('/play')}
            className="h-20 flex-col gap-1 chess-gradient text-primary-foreground font-semibold text-base rounded-xl shadow-md"
          >
            <Swords className="h-6 w-6" />
            Play Now
          </Button>
          <Button
            onClick={() => navigate('/play?mode=ranked')}
            variant="outline"
            className="h-20 flex-col gap-1 font-semibold text-base rounded-xl border-primary/30 hover:bg-primary/10"
          >
            <Trophy className="h-6 w-6 text-primary" />
            Ranked
          </Button>
        </div>

        {/* Install App Button */}
        {canInstall && !isInstalled && (
          <Button
            onClick={handleInstall}
            variant="outline"
            className="w-full gap-2 border-primary/30 hover:bg-primary/10"
          >
            <Download className="h-4 w-4 text-primary" />
            Install App
          </Button>
        )}

        {/* Recent Games */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Recent Games
          </h3>
          {gamesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : recentGames.length === 0 ? (
            <Card className="border-border/30">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No games yet. Start playing!
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentGames.map(game => {
                const isWhite = game.white_player === profile.user_id;
                const won = (game.result === 'white' && isWhite) || (game.result === 'black' && !isWhite);
                const drew = game.result === 'draw';
                const eloChange = isWhite ? game.elo_change_white : game.elo_change_black;
                return (
                  <Card key={game.id} className="border-border/30">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${won ? 'bg-green-500' : drew ? 'bg-yellow-500' : 'bg-destructive'}`} />
                        <span className="text-sm font-medium">
                          {won ? 'Victory' : drew ? 'Draw' : 'Defeat'}
                        </span>
                        <span className="text-xs text-muted-foreground">{game.time_control}</span>
                      </div>
                      <span className={`text-sm font-bold ${eloChange > 0 ? 'text-green-500' : eloChange < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {eloChange > 0 ? '+' : ''}{eloChange}
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border/50 px-2 py-2 z-50">
        <div className="max-w-lg mx-auto flex justify-around">
          {[
            { icon: Crown, label: 'Home', path: '/' },
            { icon: Swords, label: 'Play', path: '/play' },
            { icon: History, label: 'History', path: '/history' },
            { icon: BarChart3, label: 'Ranks', path: '/leaderboard' },
            { icon: Settings, label: 'Settings', path: '/settings' },
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

      <PwaInstallPrompt
        show={showPrompt}
        onInstall={handleInstall}
        onDismiss={dismiss}
      />
    </div>
  );
}
