@self-healing
Feature: Self-healing exercise: deliberately broken locators
  Each scenario uses one locator from LegacyEmiCalculatorPage that is broken on purpose, in a
  different way. They are LEFT BROKEN, as the assessment asks: run them with `npm run test:broken`
  and let the healer (`npm run heal`) propose fixes. See SELF_HEALING.md.

  Every scenario ends with a post-condition that only the RIGHT element can satisfy, so a "heal"
  that finds the wrong element still fails when the scenario is re-run.

  Background:
    Given I open the EMI calculator

  Scenario: Broken 1: ambiguous role name (strict-mode violation)
    When I switch product using the legacy Personal Loan tab locator
    Then the "Personal Loan" tab is the active product

  Scenario: Broken 2: renamed id
    When I type 25L into the legacy loan amount locator
    Then the legacy loan amount locator shows "25,00,000"

  Scenario: Broken 3: absolute XPath
    Then the legacy interest rate locator shows the default rate "9"

  Scenario: Broken 4: positional nth-child CSS
    Then the legacy monthly EMI locator shows the EMI for the default 50L loan at 9% for 20 years

  Scenario: Broken 5: drifted heading text
    Then the legacy EMI heading locator is visible and names the loan EMI

  @negative-control
  Scenario: Control: a real assertion failure that must NOT be healed
    The locator here is correct; the expected value is deliberately wrong (the right EMI for
    50L at 9% for 20 years is ₹44,986). A healer that "fixes" this by changing the locator, or the
    expected value, would hide a genuine defect. It must classify it as not-a-locator-problem.

    Then the monthly EMI shows "₹33,000" for the default loan
