@ui
@tc1
@home-loan
Feature: Home loan EMI and pie chart breakdown
  Assessment B3, Test Case 1: validate the EMI pie chart.
  The expected EMI is computed independently by the test (src/support/emi-math.ts),
  never read back from the application.

  Background:
    Given I open the EMI calculator
    And I select the "Home Loan" tab

  Scenario Outline: <scenario> - <amount> at <rate>% for <years> years
    When I enter a loan amount of <amount>, an interest rate of <rate>% and a tenure of <years> years
    Then the displayed EMI matches my independently calculated EMI
    And the displayed total interest and total payment match my calculation
    And the pie chart is visible with 2 sections
    And both pie chart sections show numerical values greater than zero
    And the pie chart values are consistent with my calculation

    Examples:
      | scenario   | amount | rate | years |
      | Scenario A | 25L    | 10   | 10    |
      | Scenario B | 50L    | 7.5  | 15    |
