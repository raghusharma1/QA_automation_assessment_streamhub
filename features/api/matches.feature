@api
@matches
Feature: Matches endpoint
  GET /api/matches lists the matches of one season. The season parameter is required.
  Expected totals are hand-counted from api/data/matches.json (24 matches in 2024).

  Scenario: The season parameter is required
    When I request the matches list
    Then the response status is 400
    And the response is a problem document with title "Bad Request"
    And the problem lists an error for "season" with code "missing" and message "season is required"

  Scenario: All matches of a season
    When I request the matches list with:
      | season | 2024 |
      | limit  | 100  |
    Then the response status is 200
    And the response matches the "match list" contract
    And the page metadata reports 24 results in total
    And every match satisfies season "2024"

  Scenario: A valid season without data returns an empty list
    When I request the matches list with:
      | season | 2023 |
    Then the response status is 200
    And the response matches the "match list" contract
    And the response contains 0 items
    And the page metadata reports 0 results in total

  Scenario Outline: Filter matches: <param>=<value>
    When I request the matches list with:
      | season  | 2024    |
      | limit   | 100     |
      | <param> | <value> |
    Then the response status is 200
    And the response matches the "match list" contract
    And the page metadata reports <total> results in total
    And every match satisfies <param> "<value>"

    # title-format: season=2024 & <param>=<value> returns <total> matches
    Examples:
      | param | value      | total |
      | team  | KKR        | 7     |
      | stage | LEAGUE     | 20    |
      | stage | FINAL      | 1     |
      | from  | 2024-05-01 | 9     |
      | to    | 2024-03-31 | 7     |

  Scenario: Paging through a season in date order
    When I request the matches list with:
      | season | 2024 |
      | sort   | date |
      | page   | 2    |
      | limit  | 5    |
    Then the response status is 200
    And the response matches the "match list" contract
    And the page metadata is page 2 of 5 with limit 5 and 24 results in total
    And the item ids are, in order: "6, 7, 8, 9, 10"
    And the items are ordered by "date" ascending

  Scenario: Sort by id, descending
    When I request the matches list with:
      | season | 2024 |
      | sort   | -id  |
      | limit  | 3    |
    Then the response status is 200
    And the item ids are, in order: "24, 23, 22"

  Scenario: Date window, team and sort combined
    When I request the matches list with:
      | season | 2024       |
      | team   | KKR        |
      | from   | 2024-05-01 |
      | to     | 2024-05-31 |
      | sort   | -date      |
    Then the response status is 200
    And the response matches the "match list" contract
    And the item ids are, in order: "24, 21, 19, 17"
    And the items are ordered by "date" descending

  Scenario Outline: Invalid match queries are rejected: <query>
    When I send a GET request to "api/matches?<query>"
    Then the response status is 400
    And the response is a problem document with title "Bad Request"
    And the problem lists an error for "<param>" with code "<code>" and message "<message>"

    # title-format: GET api/matches?<query> -> 400 (<param> <code>)
    Examples:
      | query                                     | param  | code              | message                                                                         |
      | limit=5                                   | season | missing           | season is required                                                              |
      | season=abc                                | season | invalid           | season must be an integer between 2008 and 2024                                 |
      | season=2007                               | season | invalid           | season must be an integer between 2008 and 2024                                 |
      | season=2030                               | season | invalid           | season must be an integer between 2008 and 2024                                 |
      | season=2024&stage=SEMI_FINAL              | stage  | invalid           | stage must be one of: LEAGUE, QUALIFIER_1, ELIMINATOR, QUALIFIER_2, FINAL       |
      | season=2024&from=2024-05-30&to=2024-05-01 | from   | invalid           | from must be on or before to                                                    |
      | season=2024&from=2024-02-30               | from   | invalid           | from must be a real calendar date                                               |
      | season=2024&to=26-05-2024                 | to     | invalid           | to must be a date in YYYY-MM-DD format                                          |
      | season=2024&sort=venue                    | sort   | invalid           | sort must be a comma-separated list of: date, id (prefix with - for descending) |
      | season=2024&year=2024                     | year   | unknown_parameter | year is not a supported parameter                                               |

  Scenario: A malformed date gets one error, not follow-on calendar and range errors
    When I send a GET request to "api/matches?season=2024&from=bad&to=2024-04-01"
    Then the response status is 400
    And the problem lists exactly these errors:
      | param | code    |
      | from  | invalid |
    And the problem lists an error for "from" with code "invalid" and message "from must be a date in YYYY-MM-DD format"
