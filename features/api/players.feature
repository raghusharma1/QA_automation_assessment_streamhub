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

  Scenario Outline: Filter and search: <param>=<value>
    When I request the players list with:
      | <param> | <value> |
    Then the response status is 200
    And the response matches the "player list" contract
    And the page metadata reports <total> results in total
    And the response contains <total> items
    And every player satisfies <param> "<value>"

    # title-format: Filter <param>=<value> returns <total> player(s)
    Examples:
      | param   | value  | total |
      | team    | MI     | 5     |
      | role    | BOWLER | 6     |
      | q       | sharma | 2     |
      | q       | KOHLI  | 1     |
      | minRuns | 500    | 7     |
      | maxRuns | 100    | 5     |

  # KKR has two all-rounders (488 and 222 runs): minRuns=300 must drop Andre Russell.
  Scenario: Combined filters, sorting and a run range
    When I request the players list with:
      | team    | KKR         |
      | role    | ALL_ROUNDER |
      | minRuns | 300         |
      | sort    | -runs       |
    Then the response status is 200
    And the response matches the "player list" contract
    And the item names are, in order: "Sunil Narine"
    And every player satisfies team "KKR"
    And every player satisfies role "ALL_ROUNDER"
    And every player satisfies minRuns "300"

  Scenario Outline: Sorting by <sort>
    When I request the players list with:
      | sort  | <sort> |
      | limit | 100    |
    Then the response status is 200
    And the response matches the "player list" contract
    And the items are ordered by "<field>" <direction>
    And the first item is "<first>"

    # title-format: sort=<sort> puts <first> first
    Examples:
      | sort        | field      | direction  | first              |
      | name        | name       | ascending  | Abhishek Sharma    |
      | -name       | name       | descending | Yuzvendra Chahal   |
      | runs        | runs       | ascending  | Varun Chakravarthy |
      | -runs       | runs       | descending | Virat Kohli        |
      | wickets     | wickets    | ascending  | Virat Kohli        |
      | -wickets    | wickets    | descending | Harshal Patel      |
      | matches     | matches    | ascending  | Jake Fraser-McGurk |
      | -matches    | matches    | descending | Abhishek Sharma    |
      | strikeRate  | strikeRate | ascending  | Varun Chakravarthy |
      | -strikeRate | strikeRate | descending | Jake Fraser-McGurk |

  Scenario Outline: Multi-key sort breaks ties on the second key (<sort>)
    Phil Salt and Yashasvi Jaiswal both have 435 runs, so only the second key orders them.

    When I request the players list with:
      | minRuns | 435    |
      | maxRuns | 435    |
      | sort    | <sort> |
    Then the response status is 200
    And the item names are, in order: "<names>"

    # title-format: sort=<sort> orders the 435-run tie as <names>
    Examples:
      | sort        | names                       |
      | -runs,name  | Phil Salt, Yashasvi Jaiswal |
      | -runs,-name | Yashasvi Jaiswal, Phil Salt |

  Scenario: Ties are broken by id
    23 players have 0 wickets; the API's final tie-break is the player id.

    When I request the players list with:
      | sort  | wickets |
      | limit | 5       |
    Then the response status is 200
    And the item ids are, in order: "1, 2, 3, 5, 6"

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
    And the response body is exactly:
      """
      {
        "id": 1,
        "name": "Virat Kohli",
        "teamId": "RCB",
        "role": "BATTER",
        "nationality": "India",
        "matches": 15,
        "runs": 741,
        "wickets": 0,
        "strikeRate": 154.7
      }
      """

  Scenario Outline: Player id <id> returns <status>
    When I request the player with id "<id>"
    Then the response status is <status>
    And the response is a problem document with title "<title>"

    # title-format: GET api/players/<id> -> <status>
    Examples:
      | id  | status | title     |
      | 999 | 404    | Not Found |

  Scenario Outline: A malformed player id is rejected: <id>
    When I request the player with id "<id>"
    Then the response status is 400
    And the response is a problem document with title "Bad Request"
    And the problem lists only an error for "id" with code "invalid" and message "id must be a positive integer of at most 9 digits, without leading zeros"

    # title-format: GET api/players/<id> -> 400 (id invalid)
    Examples:
      | id         |
      | abc        |
      | 0          |
      | -1         |
      | 0001       |
      | 1234567890 |

  Scenario Outline: Invalid query parameters are rejected: <query>
    When I send a GET request to "api/players?<query>"
    Then the response status is 400
    And the response is a problem document with title "Bad Request"
    And the problem lists only an error for "<param>" with code "<code>" and message "<message>"

    # title-format: GET api/players?<query> -> 400 (<param> <code>)
    Examples:
      | query                                                 | param   | code              | message                                                                                                         |
      | limit=0                                               | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=101                                             | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=abc                                             | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=1e2                                             | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=                                                | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | limit=1&limit=2                                       | limit   | invalid           | limit must be an integer between 1 and 100                                                                      |
      | page=0                                                | page    | invalid           | page must be an integer between 1 and 10000                                                                     |
      | page=1.5                                              | page    | invalid           | page must be an integer between 1 and 10000                                                                     |
      | team=XYZ                                              | team    | invalid           | team must be one of: CSK, DC, GT, KKR, LSG, MI, PBKS, RR, RCB, SRH                                              |
      | role=CAPTAIN                                          | role    | invalid           | role must be one of: BATTER, BOWLER, ALL_ROUNDER, WICKET_KEEPER                                                 |
      | q=a                                                   | q       | invalid           | q must be a search term of 2 to 50 characters                                                                   |
      | minRuns=500&maxRuns=100                               | minRuns | invalid           | minRuns must be less than or equal to maxRuns                                                                   |
      | minRuns=-5                                            | minRuns | invalid           | minRuns must be an integer between 0 and 100000                                                                 |
      | sort=age                                              | sort    | invalid           | sort must be a comma-separated list of: name, runs, wickets, matches, strikeRate (prefix with - for descending) |
      | foo=1                                                 | foo     | unknown_parameter | foo is not a supported parameter                                                                                |
      | tem=MI                                                | tem     | unknown_parameter | tem is not a supported parameter                                                                                |
      | team=mi                                               | team    | invalid           | team must be one of: CSK, DC, GT, KKR, LSG, MI, PBKS, RR, RCB, SRH                                              |
      | maxRuns=abc                                           | maxRuns | invalid           | maxRuns must be an integer between 0 and 100000                                                                 |
      | maxRuns=100001                                        | maxRuns | invalid           | maxRuns must be an integer between 0 and 100000                                                                 |
      | minRuns=100001                                        | minRuns | invalid           | minRuns must be an integer between 0 and 100000                                                                 |
      | page=10001                                            | page    | invalid           | page must be an integer between 1 and 10000                                                                     |
      | q=%20a%20                                             | q       | invalid           | q must be a search term of 2 to 50 characters                                                                   |
      | q=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx | q       | invalid           | q must be a search term of 2 to 50 characters                                                                   |
      | sort=                                                 | sort    | invalid           | sort must be a comma-separated list of: name, runs, wickets, matches, strikeRate (prefix with - for descending) |
      | sort=-                                                | sort    | invalid           | sort must be a comma-separated list of: name, runs, wickets, matches, strikeRate (prefix with - for descending) |

  Scenario: An invalid run bound gets one error, not a follow-on range error
    When I send a GET request to "api/players?minRuns=abc&maxRuns=1"
    Then the response status is 400
    And the problem lists exactly these errors:
      | param   | code    |
      | minRuns | invalid |
    And the problem lists only an error for "minRuns" with code "invalid" and message "minRuns must be an integer between 0 and 100000"

  Scenario: A number too long for JavaScript still gets the API's own message
    When I send a GET request to "api/players" with "limit" set to a 400-digit number
    Then the response status is 400
    And the problem lists only an error for "limit" with code "invalid" and message "limit must be an integer between 1 and 100"

  Scenario: Every invalid parameter is reported at once
    When I send a GET request to "api/players?limit=0&team=XYZ&foo=1"
    Then the response status is 400
    And the problem lists exactly these errors:
      | param | code              |
      | foo   | unknown_parameter |
      | limit | invalid           |
      | team  | invalid           |
