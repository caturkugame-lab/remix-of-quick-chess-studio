import { WifiOff, Wifi, Loader2 } from 'lucide-react';

type Props = {
  status: 'connected' | 'reconnecting' | 'disconnected';
  offlineSince: number | null;
  onForfeit?: () => void;
};

export default function ReconnectOverlay({ status, offlineSince, onForfeit }: Props) {
  if (status === 'connected') return null;

  const elapsed = offlineSince ? Math.floor((Date.now() - offlineSince) / 1000) : 0;
  const remaining = Math.max(0, 30 - elapsed);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md">
      <div className="text-center space-y-4 p-8 max-w-sm">
        {status === 'reconnecting' ? (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <h2 className="text-xl font-bold">Reconnecting...</h2>
            <p className="text-muted-foreground text-sm">
              Connection lost. Attempting to reconnect.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm">
              <WifiOff className="h-4 w-4 text-destructive" />
              <span className="font-mono font-bold text-lg">{remaining}s</span>
              <span className="text-muted-foreground">remaining</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{ width: `${(remaining / 30) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <WifiOff className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold">Disconnected</h2>
            <p className="text-muted-foreground text-sm">
              You were disconnected for too long. The game may be forfeited.
            </p>
            {onForfeit && (
              <button
                onClick={onForfeit}
                className="px-6 py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Return to Lobby
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
