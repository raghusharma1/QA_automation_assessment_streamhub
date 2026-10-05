-- Scenario 2: IPL player performance streaks. PostgreSQL 14+ (also runs on PGlite).
DROP TABLE IF EXISTS batting_scores;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS players;

CREATE TABLE players (
    player_id    INTEGER       PRIMARY KEY,
    player_name  VARCHAR(100)  NOT NULL,
    team_id      VARCHAR(5)    NOT NULL   -- franchise for the season (one team per player per season)
);

CREATE TABLE matches (
    match_id     INTEGER       PRIMARY KEY,
    season       INTEGER       NOT NULL,
    match_date   DATE          NOT NULL,
    stage        VARCHAR(12)   NOT NULL,
    venue        VARCHAR(60)   NOT NULL,
    home_team    VARCHAR(5)    NOT NULL,
    away_team    VARCHAR(5)    NOT NULL,
    winner_team  VARCHAR(5),               -- NULL = no result
    abandoned    BOOLEAN       NOT NULL DEFAULT FALSE,  -- washed out with no play: not a match played
    CHECK (home_team <> away_team)
);

-- One row per player who actually BATTED in a match. "Did not bat" = no row.
CREATE TABLE batting_scores (
    match_id     INTEGER  NOT NULL REFERENCES matches (match_id),
    player_id    INTEGER  NOT NULL REFERENCES players (player_id),
    runs         INTEGER  NOT NULL CHECK (runs >= 0),
    balls_faced  INTEGER  NOT NULL CHECK (balls_faced >= 0),
    is_not_out   BOOLEAN  NOT NULL DEFAULT FALSE,
    PRIMARY KEY (match_id, player_id)
);

CREATE INDEX ix_bat_player   ON batting_scores (player_id, match_id);
CREATE INDEX ix_match_season ON matches (season, match_date);
