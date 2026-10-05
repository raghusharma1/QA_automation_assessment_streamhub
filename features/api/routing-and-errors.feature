@api
@routing
Feature: Health, routing and method handling
  The API answers every request with a meaningful status code and, for errors, an RFC 9457
  problem document. It never fails with a server error.

  Scenario: Health check
    When I send a GET request to "health"
    Then the response status is 200
    And the response matches the "health" contract

  Scenario: Unknown route
    When I send a GET request to "api/nope"
    Then the response status is 404
    And the response is a problem document with title "Not Found"

  Scenario Outline: Unsupported methods on known paths are rejected with 405
    When I send a <method> request to "<path>"
    Then the response status is 405
    And the response header "allow" is "GET"
    And the response is a problem document with title "Method Not Allowed"

    # title-format: <method> <path> is not allowed
    Examples:
      | method | path          |
      | POST   | api/players   |
      | PUT    | api/players/1 |
      | DELETE | api/players/1 |
      | PATCH  | api/teams     |
      | POST   | api/matches   |
