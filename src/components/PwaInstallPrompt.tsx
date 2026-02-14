import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Props = {
  show: boolean;
  onInstall: () => void;
  onDismiss: () => void;
};

export default function PwaInstallPrompt({ show, onInstall, onDismiss }: Props) {
  if (!show) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[90] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <Card className="max-w-lg mx-auto border-primary/30 shadow-xl bg-card/95 backdrop-blur-md">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl chess-gradient shrink-0">
              <Smartphone className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm">Install ChessMate</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add to your home screen for faster access and an app-like experience.
                  </p>
                </div>
                <button
                  onClick={onDismiss}
                  className="p-1 rounded-md hover:bg-secondary shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  onClick={onInstall}
                  size="sm"
                  className="chess-gradient text-primary-foreground gap-1.5 text-xs font-semibold"
                >
                  <Download className="h-3.5 w-3.5" />
                  Install
                </Button>
                <Button
                  onClick={onDismiss}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                >
                  Later
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
