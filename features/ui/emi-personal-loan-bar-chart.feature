@ui
@tc2
@personal-loan
Feature: Personal loan EMI bar chart
  Assessment B3, Test Case 2: validate the EMI bar chart.
  Values are set by interacting with the sliders. The expected yearly schedule (bar count and
  tooltip values) is computed independently by the test suite from the loan inputs and the
  chosen start month, so the test does not depend on the date it runs.

  Background:
    Given I open the EMI calculator
    And I select the "Personal Loan" tab

  Scenario Outline: Bar chart matches an independent amortization schedule
    When I use the sliders to set a loan amount of 10L, an interest rate of 12% and a tenure of 5 years
    Then the displayed EMI matches my independently calculated EMI
    When I change the schedule start month to <month> of next year
    Then the bar chart is visible
    And the bar chart has one bar per calendar year of the schedule, <years> in total
    And the yearly interest and principal in the bar chart match my amortization schedule
    When I hover over the <series> bar of the second year of the schedule
    Then the tooltip shows that year's <series> and total payment from my amortization schedule

    # title-format: Schedule starting in <month>: <years> yearly bars, <series> tooltip
    Examples:
      | month   | years | series    |
      | January | 5     | Interest  |
      | June    | 6     | Principal |
