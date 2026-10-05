@ui
@smoke
Feature: EMI calculator availability
  As a borrower
  I want the EMI calculator to load with all loan products
  So that I can plan a loan

  Scenario: The calculator dashboard loads with every loan product
    Given I open the EMI calculator
    Then the EMI calculator dashboard is displayed
    And the following loan products are available:
      | Home Loan     |
      | Personal Loan |
      | Car Loan      |
