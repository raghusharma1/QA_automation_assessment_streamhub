@api
@players
Feature: Players endpoint
  GET /api/players supports filtering, search, sorting and pagination; GET /api/players/:id
  returns one player. Expected totals are hand-counted from api/data/players.json (36 players),
  and every returned row is also checked against the filter that produced it.

  Scenario: Default pagination
    When I request the players list
    Then the response status is 200
    And the response matches the "player list" contract
    And the page metadata is page 1 of 4 with limit 10 and 36 results in total
    And the response contains 10 items

  Scenario Outline: Filter and search: <case>
    When I request the players list with:
      | <param> | <value> |
    Then the response status is 200
    And the response matches the "player list" contract
    And the page metadata reports <total> results in total
    And every player satisfies <param> "<value>"

    # title-format: Filter <param>=<value> returns <total> players
    Examples:
      | case                  | param   | value  | total |
      | by team               | team    | MI     | 5     |
      | by role               | role    | BOWLER | 6     |
      | case-insensitive name | q       | sharma | 2     |
      | upper-case search     | q       | KOHLI  | 1     |
      | minimum runs          | minRuns | 500    | 7     |
      | maximum runs          | maxRuns | 100    | 5     |

  Scenario: Combined filters, sorting and a run range
    When I request the players list with:
      | team    | KKR         |
      | role    | ALL_ROUNDER |
      | minRuns | 200         |
      | sort    | -runs       |
    Then the response status is 200
    And the response matches the "player list" contract
    And the item ids are, in order: "14, 15"
    And every player satisfies team "KKR"
    And every player satisfies role "ALL_ROUNDER"

  Scenario Outline: Sorting by <sort>
    When I request the players list with:
      | sort  | <sort> |
      | limit | 100    |
    Then the response status is 200
    And the response matches the "player list" contract
    And the items are ordered by "<field>" <direction>
    And the first item has id <firstId>

    # title-format: sort=<sort>
    Examples:
      | sort        | field      | direction  | firstId |
      | -runs       | runs       | descending | 1       |
      | name        | name       | ascending  | 20      |
      | -wickets    | wickets    | descending | 36      |
      | -strikeRate | strikeRate | descending | 33      |

  Scenario: Second page and page size
    When I request the players list with:
      | page  | 2     |
      | limit | 5     |
      | sort  | -runs |
    Then the response status is 200
    And the page metadata is page 2 of 8 with limit 5 and 36 results in total
    And the item ids are, in order: "28, 30, 31, 14, 20"

  Scenario: A page past the end is valid and empty
    When I request the players list with:
      | page | 99 |
    Then the response status is 200
    And the response matches the "player list" contract
    And the response contains 0 items
    And the page metadata is page 99 of 4 with limit 10 and 36 results in total

  Scenario: Get one player by id
    When I request the player with id "1"
    Then the response status is 200
    And the response matches the "player" contract
    And the response field "name" is "Virat Kohli"

  Scenario Outline: Player id <id> returns <status>
    When I request the player with id "<id>"
    Then the response status is <status>
    And the response is a problem document with title "<title>"

    # title-format: GET api/players/<id> -> <status>
    Examples:
      | id  | status | title       |
      | 999 | 404    | Not Found   |
      | abc | 400    | Bad Request |
      | 0   | 400    | Bad Request |
      | -1  | 400    | Bad Request |

  Scenario Outline: Invalid query parameters are rejected: <query>
    When I send a GET request to "api/players?<query>"
    Then the response status is 400
    And the response is a problem document with title "Bad Request"
    And the problem lists an error for "<param>" with code "<code>" and message "<message>"

    # title-format: GET api/players?<query> -> 400 (<param> <code>)
    Examples:
      | query                   | param   | code              | message                                                                                                         |
      | limit=0                 | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=101               | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=abc               | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=1e2               | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=                  | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=1&limit=2         | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | page=0                  | page    | invalid           | page must be an integer between 1 and 10000                                                                     |
      | page=1.5                | page    | invalid           | page must be an integer between 1 and 10000                                                                     |
      | team=XYZ                | team    | invalid           | team must be one of: CSK, DC, GT, KKR, LSG, MI, PBKS, RR, RCB, SRH                                              |
      | role=CAPTAIN            | role    | invalid           | role must be one of: BATTER, BOWLER, ALL_ROUNDER, WICKET_KEEPER                                                 |
      | q=a                     | q       | invalid           | q must be a search term of 2 to 50 characters                                                                   |
      | minRuns=500&maxRuns=100 | minRuns | invalid           | minRuns must be less than or equal to maxRuns                                                                   |
      | minRuns=-5              | minRuns | invalid           | minRuns must be an integer between 0 and 100000                                                                 |
      | sort=age                | sort    | invalid           | sort must be a comma-separated list of: name, runs, wickets, matches, strikeRate (prefix with - for descending) |
      | foo=1                   | foo     | unknown_parameter | foo is not a supported parameter                                                                                |
      | tem=MI                  | tem     | unknown_parameter | tem is not a supported parameter                                                                                |

  Scenario: Every invalid parameter is reported at once
    When I send a GET request to "api/players?limit=0&team=XYZ&foo=1"
    Then the response status is 400
    And the problem lists exactly these errors:
      | param | code              |
      | foo   | unknown_parameter |
      | limit | invalid           |
      | team  | invalid           |
