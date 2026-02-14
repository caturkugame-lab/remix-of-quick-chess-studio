import { Music, Volume2, VolumeX } from 'lucide-react';
import { useMusicPlayer } from '@/hooks/use-game-stability';

export default function MusicPlayer() {
  const { isPlaying, volume, toggleMusic, updateVolume } = useMusicPlayer();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMusic}
        className="p-2 rounded-lg hover:bg-secondary transition-colors relative"
        title={isPlaying ? 'Mute music' : 'Play music'}
      >
        {isPlaying ? (
          <Volume2 className="h-5 w-5 text-primary" />
        ) : (
          <VolumeX className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      {isPlaying && (
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => updateVolume(parseFloat(e.target.value))}
          className="w-16 h-1 accent-primary cursor-pointer"
        />
      )}
    </div>
  );
}
