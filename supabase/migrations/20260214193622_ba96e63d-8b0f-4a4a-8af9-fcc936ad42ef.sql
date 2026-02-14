
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  elo_rating INTEGER NOT NULL DEFAULT 800,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Games table
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  white_player UUID NOT NULL REFERENCES public.profiles(user_id),
  black_player UUID NOT NULL REFERENCES public.profiles(user_id),
  moves JSONB NOT NULL DEFAULT '[]'::jsonb,
  result TEXT, -- 'white', 'black', 'draw', null if ongoing
  time_control TEXT NOT NULL DEFAULT 'rapid', -- 'blitz', 'rapid', 'classic'
  time_white INTEGER NOT NULL DEFAULT 600, -- seconds remaining
  time_black INTEGER NOT NULL DEFAULT 600,
  elo_change_white INTEGER DEFAULT 0,
  elo_change_black INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed', 'aborted'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  last_move_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Games are viewable by everyone"
  ON public.games FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create games"
  ON public.games FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = white_player OR auth.uid() = black_player
  );

CREATE POLICY "Players can update their own games"
  ON public.games FOR UPDATE TO authenticated USING (
    auth.uid() = white_player OR auth.uid() = black_player
  );

-- Matchmaking queue
CREATE TABLE public.matchmaking_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE UNIQUE,
  elo_rating INTEGER NOT NULL,
  time_control TEXT NOT NULL DEFAULT 'rapid',
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'matched'
  queued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view queue"
  ON public.matchmaking_queue FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can join queue"
  ON public.matchmaking_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave queue"
  ON public.matchmaking_queue FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update their queue entry"
  ON public.matchmaking_queue FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Enable realtime for games and matchmaking
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Avatar storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
