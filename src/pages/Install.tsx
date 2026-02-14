import { useNavigate } from 'react-router-dom';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Download, Check, Smartphone, Globe, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Install() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canInstall, isInstalled, install } = usePwaInstall();

  const handleInstall = async () => {
    const accepted = await install();
    if (accepted) {
      toast({ title: '✅ App installed successfully!' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 p-4 border-b border-border/50">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold">Install App</h1>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-6">
        <div className="text-center space-y-2 pt-4">
          <img src="/pwa-icon-192.png" alt="ChessMate" className="w-20 h-20 rounded-2xl mx-auto shadow-lg" />
          <h2 className="text-2xl font-bold">ChessMate</h2>
          <p className="text-sm text-muted-foreground">Install for the best experience</p>
        </div>

        <div className="space-y-3">
          {[
            { icon: Zap, title: 'Instant Launch', desc: 'Open directly from your home screen' },
            { icon: Globe, title: 'Works Offline', desc: 'Play even without an internet connection' },
            { icon: Smartphone, title: 'Native Feel', desc: 'Full-screen, no browser UI' },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border-border/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {isInstalled ? (
          <div className="text-center p-6 space-y-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="font-semibold">Already Installed</p>
            <p className="text-sm text-muted-foreground">You're running ChessMate as an app.</p>
          </div>
        ) : canInstall ? (
          <Button onClick={handleInstall} className="w-full h-14 text-base font-semibold chess-gradient rounded-xl gap-2">
            <Download className="h-5 w-5" /> Install ChessMate
          </Button>
        ) : (
          <Card className="border-border/30">
            <CardContent className="p-6 text-center text-sm text-muted-foreground space-y-2">
              <p className="font-medium">Manual Installation</p>
              <p>On <strong>iPhone</strong>: Tap Share → Add to Home Screen</p>
              <p>On <strong>Android</strong>: Tap Menu → Install App</p>
              <p>On <strong>Desktop</strong>: Click the install icon in the address bar</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
