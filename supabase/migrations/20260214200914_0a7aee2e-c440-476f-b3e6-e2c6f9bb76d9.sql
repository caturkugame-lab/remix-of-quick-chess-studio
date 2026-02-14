-- Enable realtime for the games table so postgres_changes events are broadcast
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;