-- Scenario 2, ALTERNATIVE interpretation: "consecutive matches" = consecutive matches PLAYED by
-- the player's team. A match the team played without this player batting BREAKS the streak.
-- A fixture abandoned without play is not a match played, so it breaks nothing.
-- Same gaps-and-islands technique; the first counter is the team's match number instead of the
-- player's appearance number.
WITH team_matches AS (              -- each team's 2024 matches actually played, numbered 1..n
    SELECT t.team_id,
           m.match_id,
           m.match_date,
           ROW_NUMBER() OVER (PARTITION BY t.team_id
                              ORDER BY m.match_date, m.match_id) AS team_match_no
    FROM matches m
    JOIN (SELECT match_id, home_team AS team_id FROM matches
          UNION ALL
          SELECT match_id, away_team AS team_id FROM matches) t
      ON t.match_id = m.match_id
    WHERE m.season = 2024
      AND NOT m.abandoned
),
hits AS (                           -- 30+ innings, positioned on the TEAM's match list
    SELECT b.player_id,
           tm.match_date,
           b.runs,
           tm.team_match_no
             - ROW_NUMBER() OVER (PARTITION BY b.player_id
                                  ORDER BY tm.match_date, tm.match_id) AS island_id
    FROM batting_scores b
    JOIN players p       ON p.player_id = b.player_id
    JOIN team_matches tm ON tm.match_id = b.match_id
                        AND tm.team_id  = p.team_id
    WHERE b.runs >= 30
)
SELECT p.player_name,
       MIN(h.match_date) AS streak_start,
       COUNT(*)          AS streak_matches,
       MAX(h.match_date) AS streak_end
FROM hits h
JOIN players p ON p.player_id = h.player_id
GROUP BY p.player_name, h.player_id, h.island_id
HAVING COUNT(*) >= 3
ORDER BY p.player_name, streak_start;
