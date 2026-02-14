import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // moves per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Minimal chess validation (check if move is structurally valid)
function validateMoveStructure(move: any): boolean {
  if (!move || typeof move !== "object") return false;
  const { from, to } = move;
  if (!from || !to) return false;
  if (typeof from.row !== "number" || typeof from.col !== "number") return false;
  if (typeof to.row !== "number" || typeof to.col !== "number") return false;
  if (from.row < 0 || from.row > 7 || from.col < 0 || from.col > 7) return false;
  if (to.row < 0 || to.row > 7 || to.col < 0 || to.col > 7) return false;
  if (move.promotion && !["q", "r", "b", "n"].includes(move.promotion)) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { gameId, move, timeRemaining } = body;

    if (!gameId || !move) {
      return new Response(JSON.stringify({ error: "Missing gameId or move" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate move structure
    if (!validateMoveStructure(move)) {
      return new Response(JSON.stringify({ error: "Invalid move structure" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      return new Response(JSON.stringify({ error: "Game not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify player is in this game
    if (game.white_player !== user.id && game.black_player !== user.id) {
      return new Response(JSON.stringify({ error: "Not your game" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify it's player's turn
    const moveCount = (game.moves as any[])?.length || 0;
    const isWhiteTurn = moveCount % 2 === 0;
    const isWhitePlayer = game.white_player === user.id;
    if (isWhiteTurn !== isWhitePlayer) {
      return new Response(JSON.stringify({ error: "Not your turn" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify game is active
    if (game.status !== "active") {
      return new Response(JSON.stringify({ error: "Game is not active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply move
    const currentMoves = (game.moves as any[]) || [];
    const updatedMoves = [...currentMoves, {
      from: { row: move.from.row, col: move.from.col },
      to: { row: move.to.row, col: move.to.col },
      promotion: move.promotion || null,
      timestamp: Date.now(),
    }];

    const updateData: any = {
      moves: updatedMoves,
      last_move_at: new Date().toISOString(),
    };

    // Update time if provided
    if (typeof timeRemaining === "number") {
      if (isWhitePlayer) {
        updateData.time_white = Math.max(0, Math.floor(timeRemaining));
      } else {
        updateData.time_black = Math.max(0, Math.floor(timeRemaining));
      }
    }

    // Check for game end conditions from client
    if (body.gameEnd) {
      updateData.result = body.gameEnd.result;
      updateData.status = "completed";
      updateData.ended_at = new Date().toISOString();
      updateData.elo_change_white = body.gameEnd.eloChangeWhite || 0;
      updateData.elo_change_black = body.gameEnd.eloChangeBlack || 0;
    }

    const { error: updateError } = await supabase
      .from("games")
      .update(updateData)
      .eq("id", gameId);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to update game" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If game ended, update profiles
    if (body.gameEnd) {
      const { result } = body.gameEnd;
      for (const playerId of [game.white_player, game.black_player]) {
        const isW = playerId === game.white_player;
        const eloChange = isW ? (body.gameEnd.eloChangeWhite || 0) : (body.gameEnd.eloChangeBlack || 0);
        const won = (result === "white" && isW) || (result === "black" && !isW);
        const drew = result === "draw";

        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", playerId)
          .single();

        if (prof) {
          await supabase.from("profiles").update({
            elo_rating: prof.elo_rating + eloChange,
            games_played: prof.games_played + 1,
            wins: prof.wins + (won ? 1 : 0),
            losses: prof.losses + (!won && !drew ? 1 : 0),
            draws: prof.draws + (drew ? 1 : 0),
          }).eq("user_id", playerId);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, moveNumber: updatedMoves.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
