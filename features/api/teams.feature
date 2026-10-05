@api
@teams
Feature: Teams endpoint
  GET /api/teams lists the 10 IPL teams, optionally sorted.

  Scenario: List all teams
    When I request the teams list
    Then the response status is 200
    And the response matches the "team list" contract
    And the response contains 10 items

  Scenario: Sort teams by name
    When I request the teams list with:
      | sort | name |
    Then the response status is 200
    And the response matches the "team list" contract
    And the items are ordered by "name" ascending
    And the item ids are, in order: "CSK, DC, GT, KKR, LSG, MI, PBKS, RR, RCB, SRH"

  Scenario: Sort teams by titles (descending), then by name
    When I request the teams list with:
      | sort | -titles,name |
    Then the response status is 200
    And the response matches the "team list" contract
    And the items are ordered by "titles" descending, then by "name" ascending
    And the item ids are, in order: "CSK, MI, KKR, GT, RR, SRH, DC, LSG, PBKS, RCB"

  Scenario: An unsortable field is rejected
    When I request the teams list with:
      | sort | city |
    Then the response status is 400
    And the response is a problem document with title "Bad Request"
    And the problem lists an error for "sort" with code "invalid"
