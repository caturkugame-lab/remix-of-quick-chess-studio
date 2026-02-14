
# ♟️ Lightweight Online Multiplayer Chess Platform — MVP

## Overview
A fast, mobile-first online chess platform with real-time multiplayer gameplay, ELO rating, and matchmaking. Built with React + Canvas 2D rendering + Lovable Cloud (Supabase) for auth, database, and realtime channels.

---

## Phase 1: Auth & User Setup

### Registration & Login
- Email + password signup/login via Supabase Auth
- Email verification flow
- Unique username selection during onboarding
- Avatar upload (Supabase Storage)
- Auto-assign default ELO of 800

### User Profile (Database)
- Profiles table: username, avatar_url, elo_rating, created_at
- Linked to auth.users with RLS policies

---

## Phase 2: Dashboard / Lobby

### Main Screen
- Player card showing username, avatar, ELO rating, and rank tier badge (Bronze/Silver/Gold/Platinum/Diamond/Master based on ELO ranges)
- Quick action buttons: **Play Now**, **Ranked Match**
- Recent match history list (last 5 games with result + ELO change)
- Dark/light mode toggle

### Navigation
- Bottom nav bar (mobile) / sidebar (desktop): Home, Play, History, Leaderboard, Settings

---

## Phase 3: Chess Board (Canvas 2D Engine)

### Rendering
- HTML5 Canvas 2D board with crisp piece rendering
- Touch-friendly drag & drop for mobile (large touch targets)
- Tap-to-select + tap-to-move as alternative input
- Highlighted legal moves (dots on valid squares)
- Last move highlight
- Check indicator (king square highlight)
- Smooth, lightweight piece movement animation
- Board flips based on player color

### Game Logic (Client-side validation + server authority)
- Full legal move validation (castling, en passant, promotion, check/checkmate/stalemate)
- Pawn promotion popup (Queen/Rook/Bishop/Knight)
- Move clock/timer per player with visual countdown
- Resign button and draw offer system

---

## Phase 4: Matchmaking & Realtime Play

### Matchmaking Queue
- Player selects time control: Blitz (5 min), Rapid (10 min), Classic (30 min)
- Enters queue → matched with opponent within ±100 ELO (widens over time)
- Searching animation with cancel option
- On match found: auto-create game room, random color assignment

### Realtime Gameplay
- Supabase Realtime channels for move synchronization
- Each move sent as a channel message with board state validation
- Edge function validates moves server-side to prevent cheating
- Game state stored in database (moves array, timestamps, result)

### Game End
- Detect checkmate, stalemate, timeout, resignation, draw agreement
- Edge function calculates ELO change using standard formula
- Result screen: Win/Lose/Draw, rating change (+/-), new ELO
- Buttons: Rematch, Find New Opponent, Back to Lobby

---

## Phase 5: Rating, History & Leaderboard

### ELO System
- Standard ELO calculation (K-factor based on games played)
- Rating stored per player, updated after each game

### Rank Tiers
- Bronze (0-999), Silver (1000-1199), Gold (1200-1399), Platinum (1400-1599), Diamond (1600-1799), Master (1800+)
- Visual badge on profile and in-game

### Match History
- Full list of past games with opponent, result, ELO change, date
- Tap to view move-by-move replay

### Leaderboard
- Top players ranked by ELO
- Filter by time control

---

## Phase 6: Reconnection & Robustness

### Reconnect System
- Detect disconnect, show reconnecting overlay
- 30-second grace period to rejoin
- Restore full game state from database on reconnect
- Auto-forfeit if timeout expires

---

## Database Structure (Supabase)
- **profiles**: user_id, username, avatar_url, elo_rating, games_played, rank_tier
- **games**: id, white_player, black_player, moves (jsonb), result, time_control, elo_change_white, elo_change_black, started_at, ended_at
- **matchmaking_queue**: user_id, elo_rating, time_control, queued_at, status

## Edge Functions
- **validate-move**: Server-side move validation
- **calculate-elo**: Post-game ELO computation
- **matchmaking**: Queue management and pairing logic

---

## Design
- **Mobile-first**: Bottom navigation, full-screen board, large touch targets
- **Dark/Light mode**: System preference auto-detection with manual toggle
- **Minimal UI**: Clean typography, muted colors, board as hero element
- **Performance**: Canvas rendering, no heavy libraries, skeleton loading states
- **Target**: < 2s load time, smooth 60fps board interactions
