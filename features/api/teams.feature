@api
@teams
Feature: Teams endpoint
  GET /api/teams lists the 10 IPL teams, optionally sorted.

  Scenario: List all teams
    When I request the teams list
    Then the response status is 200
    And the response matches the "team list" contract
    And the response contains 10 items

  # Descending on purpose: api/data/teams.json is stored in name order, so an API that ignored
  # sort=name would still pass an ascending check.
  Scenario: Sort teams by name, descending
    When I request the teams list with:
      | sort | -name |
    Then the response status is 200
    And the response matches the "team list" contract
    And the items are ordered by "name" descending
    And the item ids are, in order: "SRH, RCB, RR, PBKS, MI, LSG, KKR, GT, DC, CSK"

  Scenario: Sort teams by titles (descending), then by name
    When I request the teams list with:
      | sort | -titles,name |
    Then the response status is 200
    And the response matches the "team list" contract
    And the items are ordered by "titles" descending, then by "name" ascending
    And the item ids are, in order: "CSK, MI, KKR, GT, RR, SRH, DC, LSG, PBKS, RCB"

  Scenario: An unknown parameter is rejected
    When I send a GET request to "api/teams?foo=1"
    Then the response status is 400
    And the problem lists only an error for "foo" with code "unknown_parameter" and message "foo is not a supported parameter"

  Scenario: An unsortable field is rejected
    When I request the teams list with:
      | sort | city |
    Then the response status is 400
    And the response is a problem document with title "Bad Request"
    And the problem lists an error for "sort" with code "invalid"
