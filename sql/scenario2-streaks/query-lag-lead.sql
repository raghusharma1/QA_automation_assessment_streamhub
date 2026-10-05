-- Scenario 2, alternative technique: LAG/LEAD look-around (same interpretation as query.sql).
-- A row is a streak START when it is 30+, the next two innings are 30+, and the previous innings
-- is not 30+ (or doesn't exist). The last condition stops a 5-match streak producing 3 start rows.
-- Returns exactly what the brief asks for: player name and streak start date.
-- Trade-off vs gaps and islands: the "3" is hard-coded as two LEADs, and the length isn't returned.
WITH season_innings AS (
    SELECT b.player_id, m.match_id, m.match_date, b.runs
    FROM batting_scores b
    JOIN matches m ON m.match_id = b.match_id
    WHERE m.season = 2024
),
look_around AS (
    SELECT si.*,
           LAG(runs)     OVER w AS prev_runs,
           LEAD(runs, 1) OVER w AS next1_runs,
           LEAD(runs, 2) OVER w AS next2_runs
    FROM season_innings si
    WINDOW w AS (PARTITION BY player_id ORDER BY match_date, match_id)
)
SELECT p.player_name,
       la.match_date AS streak_start
FROM look_around la
JOIN players p ON p.player_id = la.player_id
WHERE la.runs       >= 30
  AND la.next1_runs >= 30
  AND la.next2_runs >= 30
  AND (la.prev_runs IS NULL OR la.prev_runs < 30)
ORDER BY p.player_name, la.match_date;
