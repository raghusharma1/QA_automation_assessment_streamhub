-- Scenario 2 (PRIMARY): players with 30+ runs in at least 3 consecutive matches in 2024,
-- with the date each streak started. "Consecutive matches" = consecutive APPEARANCES (innings).
-- Technique: gaps and islands with a ROW_NUMBER() difference (explained in sql/README.md).
WITH season_innings AS (            -- 1. every 2024 innings, numbered per player in date order
    SELECT b.player_id,
           m.match_id,
           m.match_date,
           b.runs,
           ROW_NUMBER() OVER (PARTITION BY b.player_id
                              ORDER BY m.match_date, m.match_id) AS appearance_no
    FROM batting_scores b
    JOIN matches m ON m.match_id = b.match_id
    WHERE m.season = 2024           -- filter BEFORE numbering: 2023 can't join a 2024 streak
),
hits AS (                           -- 2. keep only the 30+ innings and number them again
    SELECT si.*,
           appearance_no
             - ROW_NUMBER() OVER (PARTITION BY player_id
                                  ORDER BY match_date, match_id) AS island_id
    FROM season_innings si
    WHERE runs >= 30                -- must sit between the two ROW_NUMBER()s, or no gaps appear
),
streaks AS (                        -- 3. one row per island = one unbroken run of 30+ scores
    SELECT player_id,
           MIN(match_date) AS streak_start,
           MAX(match_date) AS streak_end,
           COUNT(*)        AS streak_matches,
           SUM(runs)       AS streak_runs
    FROM hits
    GROUP BY player_id, island_id
    HAVING COUNT(*) >= 3            -- 4. at least 3 in a row
)
SELECT p.player_name,
       s.streak_start,
       s.streak_matches,
       s.streak_end,
       s.streak_runs
FROM streaks s
JOIN players p ON p.player_id = s.player_id
ORDER BY p.player_name, s.streak_start;
