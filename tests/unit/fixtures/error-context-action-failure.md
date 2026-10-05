# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: .features-gen-self-heal\features\self-healing\broken-locators.feature.spec.js >> Self-healing exercise: deliberately broken locators >> Broken 2: renamed id
- Location: .features-gen-self-heal\features\self-healing\broken-locators.feature.spec.js:15:7

# Error details

```
TimeoutError: locator.fill: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('#loan-amount')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
    - banner [ref=e2]:
        - navigation [ref=e4]:
            - link "EMI Calculator" [ref=e6] [cursor=pointer]:
                - /url: https://emicalculator.net/
            - list [ref=e9]:
                - listitem [ref=e10]:
                    - link "Loan Calculators & Widgets" [ref=e11] [cursor=pointer]:
                        - /url: '#'
                - listitem [ref=e12]:
                    - link "Articles" [ref=e13] [cursor=pointer]:
                        - /url: https://emicalculator.net/category/articles/
                - listitem [ref=e14]:
                    - link "Product Reviews" [ref=e15] [cursor=pointer]:
                        - /url: https://emicalculator.net/category/reviews/
                - listitem [ref=e16]:
                    - link "News & Opinion" [ref=e17] [cursor=pointer]:
                        - /url: https://emicalculator.net/category/news-opinion/
    - document [ref=e18]:
        - main [ref=e20]:
            - article [ref=e21]:
                - heading "EMI Calculator for Home Loan, Car Loan & Personal Loan in India" [level=1] [ref=e23]
                - generic [ref=e25]:
                    - generic [ref=e26]:
                        - generic [ref=e27]:
                            - list:
                                - listitem [ref=e28]:
                                    - link "Home Loan" [ref=e29] [cursor=pointer]:
                                        - /url: '#'
                                - listitem [ref=e30]:
                                    - link "Personal Loan" [ref=e31] [cursor=pointer]:
                                        - /url: '#'
                                - listitem [ref=e32]:
                                    - link "Car Loan" [ref=e33] [cursor=pointer]:
                                        - /url: '#'
                            - generic [ref=e34]:
                                - generic [ref=e36]:
                                    - generic [ref=e37]:
                                        - generic [ref=e38]: Home Loan Amount
                                        - generic [ref=e40]:
                                            - textbox "Home Loan Amount" [ref=e41]: 50,00,000
                                            - generic [ref=e42]: ₹
                                    - generic:
                                        - generic [ref=e47]: '|0'
                                        - generic [ref=e48]: '|25L'
                                        - generic [ref=e49]: '|50L'
                                        - generic [ref=e50]: '|75L'
                                        - generic [ref=e51]: '|100L'
                                        - generic [ref=e52]: '|125L'
                                        - generic [ref=e53]: '|150L'
                                        - generic [ref=e54]: '|175L'
                                        - generic [ref=e55]: '|200L'
                                    - generic [ref=e56]:
                                        - generic [ref=e57]: Interest Rate
                                        - generic [ref=e59]:
                                            - textbox "Interest Rate" [ref=e60]: '9'
                                            - generic [ref=e61]: '%'
                                    - generic:
                                        - generic [ref=e66]: '|5'
                                        - generic [ref=e67]: '|7.5'
                                        - generic [ref=e68]: '|10'
                                        - generic [ref=e69]: '|12.5'
                                        - generic [ref=e70]: '|15'
                                        - generic [ref=e71]: '|17.5'
                                        - generic [ref=e72]: '|20'
                                    - generic [ref=e73]:
                                        - generic [ref=e74]: Loan Tenure
                                        - generic [ref=e77]:
                                            - textbox "Loan Tenure" [ref=e78]: '20'
                                            - generic [ref=e80]:
                                                - generic [ref=e81]:
                                                    - radio "Yr" [checked]
                                                    - text: Yr
                                                - generic [ref=e82]:
                                                    - radio "Mo"
                                                    - text: Mo
                                    - generic:
                                        - generic [ref=e86]: '|0'
                                        - generic [ref=e87]: '|5'
                                        - generic [ref=e88]: '|10'
                                        - generic [ref=e89]: '|15'
                                        - generic [ref=e90]: '|20'
                                        - generic [ref=e91]: '|25'
                                        - generic [ref=e92]: '|30'
                                - generic [ref=e93]:
                                    - generic [ref=e94]:
                                        - generic [ref=e95]:
                                            - heading "Loan EMI" [level=4] [ref=e96]
                                            - paragraph [ref=e97]: ₹44,986
                                        - generic [ref=e98]:
                                            - heading "Total Interest Payable" [level=4] [ref=e99]
                                            - paragraph [ref=e100]: ₹57,96,711
                                        - generic [ref=e101]:
                                            - heading "Total Payment (Principal + Interest)" [level=4] [ref=e102]: Total Payment(Principal + Interest)
                                            - paragraph [ref=e103]: ₹1,07,96,711
                                    - img [ref=e106]:
                                        - generic [ref=e111] [cursor=pointer]
                                        - generic [ref=e114]: Break-up of Total Payment
                                        - generic [ref=e115] [cursor=pointer]:
                                            - generic [ref=e116]: 46.3%
                                            - generic [ref=e118]: 53.7%
                                        - generic [ref=e123]:
                                            - generic [ref=e124]: Principal Loan Amount
                                            - generic [ref=e127]: Total Interest
                        - generic [ref=e130]:
                            - generic [ref=e131]:
                                - heading "Featured Calculators & Articles" [level=3] [ref=e132]
                                - list [ref=e134]:
                                    - listitem [ref=e135]:
                                        - link "Loan Calculator — Calculate EMI, Affordability, Tenure & Interest Rate" [ref=e136] [cursor=pointer]:
                                            - /url: https://emicalculator.net/loan-calculator/
                                    - listitem [ref=e137]:
                                        - link "Home Loan EMI Calculator with Prepayments, Taxes & Insurance" [ref=e138] [cursor=pointer]:
                                            - /url: https://emicalculator.net/home-loan-emi-calculator/
                                    - listitem [ref=e139]:
                                        - link "Credit Card EMI Calculator with GST" [ref=e140] [cursor=pointer]:
                                            - /url: https://emicalculator.net/credit-card-emi-calculator/
                                    - listitem [ref=e141]:
                                        - link "Key Highlights from Budget 2026" [ref=e142] [cursor=pointer]:
                                            - /url: https://emicalculator.net/key-highlights-from-budget-2026/
                                    - listitem [ref=e143]:
                                        - 'link "Basic Salary, HRA, Gratuity: Changes from April 1, 2026 and What It Means for You?" [ref=e144] [cursor=pointer]':
                                            - /url: https://emicalculator.net/basic-salary-hra-gratuity-changes-from-april-1-2026-and-what-it-means-for-you/
                                    - listitem [ref=e145]:
                                        - link "The Pros and Cons of Credit Card EMIs" [ref=e146] [cursor=pointer]:
                                            - /url: https://emicalculator.net/the-pros-and-cons-of-credit-card-emis/
                                    - listitem [ref=e147]:
                                        - link "Pay Tax on ₹25 Lakhs or ₹21.4 Lakhs? The Simple Truth About Employer Car Leasing" [ref=e148] [cursor=pointer]:
                                            - /url: https://emicalculator.net/pay-tax-on-%e2%82%b925-lakhs-or-%e2%82%b921-4-lakhs-the-simple-truth-about-employer-car-leasing/
                            - generic:
                                - insertion
                    - generic:
                        - generic:
                            - insertion
                    - generic [ref=e149]:
                        - generic [ref=e151]:
                            - generic [ref=e152]: Schedule showing EMI payments starting from
                            - generic [ref=e154]:
                                - textbox "Schedule showing EMI payments starting from" [ref=e155]: Oct 2026
                                - generic [ref=e156]: 
                            - combobox [ref=e160]:
                                - option "Calendar Year wise" [selected]
                                - option "Financial Year wise"
                        - img [ref=e163]:
                            - generic [ref=e170]: EMI Payment / year
                            - generic [ref=e172]: Balance
                            - generic [ref=e247]:
                                - generic [ref=e248]: Principal
                                - generic [ref=e251]: Interest
                                - generic [ref=e254]: Balance
                            - generic [ref=e257]:
                                - generic [ref=e258]: '2026'
                                - generic [ref=e259]: '2027'
                                - generic [ref=e260]: '2028'
                                - generic [ref=e261]: '2029'
                                - generic [ref=e262]: '2030'
                                - generic [ref=e263]: '2031'
                                - generic [ref=e264]: '2032'
                                - generic [ref=e265]: '2033'
                                - generic [ref=e266]: '2034'
                                - generic [ref=e267]: '2035'
                                - generic [ref=e268]: '2036'
                                - generic [ref=e269]: '2037'
                                - generic [ref=e270]: '2038'
                                - generic [ref=e271]: '2039'
                                - generic [ref=e272]: '2040'
                                - generic [ref=e273]: '2041'
                                - generic [ref=e274]: '2042'
                                - generic [ref=e275]: '2043'
                                - generic [ref=e276]: '2044'
                                - generic [ref=e277]: '2045'
                                - generic [ref=e278]: '2046'
                            - generic [ref=e279]:
                                - generic [ref=e280]: ₹ 0
                                - generic [ref=e281]: ₹ 1,20,000
                                - generic [ref=e282]: ₹ 2,40,000
                                - generic [ref=e283]: ₹ 3,60,000
                                - generic [ref=e284]: ₹ 4,80,000
                                - generic [ref=e285]: ₹ 6,00,000
                            - generic [ref=e286]:
                                - generic [ref=e287]: ₹ 0
                                - generic [ref=e288]: ₹ 12,00,000
                                - generic [ref=e289]: ₹ 24,00,000
                                - generic [ref=e290]: ₹ 36,00,000
                                - generic [ref=e291]: ₹ 48,00,000
                                - generic [ref=e292]: ₹ 60,00,000
                        - table [ref=e294]:
                            - rowgroup [ref=e295]:
                                - row [ref=e296]:
                                    - columnheader "Year" [ref=e297]
                                    - columnheader "Principal (A)" [ref=e298]: Principal(A)
                                    - columnheader "Interest (B)" [ref=e299]: Interest(B)
                                    - columnheader "Total Payment (A + B)" [ref=e300]: Total Payment(A + B)
                                    - columnheader "Balance" [ref=e301]
                                    - columnheader "Loan Paid To Date" [ref=e302]
                                - row [ref=e303]:
                                    - cell " 2026" [ref=e304] [cursor=pointer]
                                    - cell "₹ 22,628" [ref=e305]
                                    - cell "₹ 1,12,331" [ref=e306]
                                    - cell "₹ 1,34,959" [ref=e307]
                                    - cell "₹ 49,77,372" [ref=e308]
                                    - cell "0.45%" [ref=e309]
                                - row:
                                    - cell
                                - row [ref=e310]:
                                    - cell " 2027" [ref=e311] [cursor=pointer]
                                    - cell "₹ 95,758" [ref=e312]
                                    - cell "₹ 4,44,077" [ref=e313]
                                    - cell "₹ 5,39,836" [ref=e314]
                                    - cell "₹ 48,81,614" [ref=e315]
                                    - cell "2.37%" [ref=e316]
                                - row:
                                    - cell
                                - row [ref=e317]:
                                    - cell " 2028" [ref=e318] [cursor=pointer]
                                    - cell "₹ 1,04,741" [ref=e319]
                                    - cell "₹ 4,35,095" [ref=e320]
                                    - cell "₹ 5,39,836" [ref=e321]
                                    - cell "₹ 47,76,873" [ref=e322]
                                    - cell "4.46%" [ref=e323]
                                - row:
                                    - cell
                                - row [ref=e324]:
                                    - cell " 2029" [ref=e325] [cursor=pointer]
                                    - cell "₹ 1,14,566" [ref=e326]
                                    - cell "₹ 4,25,269" [ref=e327]
                                    - cell "₹ 5,39,836" [ref=e328]
                                    - cell "₹ 46,62,307" [ref=e329]
                                    - cell "6.75%" [ref=e330]
                                - row:
                                    - cell
                                - row [ref=e331]:
                                    - cell " 2030" [ref=e332] [cursor=pointer]
                                    - cell "₹ 1,25,313" [ref=e333]
                                    - cell "₹ 4,14,522" [ref=e334]
                                    - cell "₹ 5,39,836" [ref=e335]
                                    - cell "₹ 45,36,993" [ref=e336]
                                    - cell "9.26%" [ref=e337]
                                - row:
                                    - cell
                                - row [ref=e338]:
                                    - cell " 2031" [ref=e339] [cursor=pointer]
                                    - cell "₹ 1,37,069" [ref=e340]
                                    - cell "₹ 4,02,767" [ref=e341]
                                    - cell "₹ 5,39,836" [ref=e342]
                                    - cell "₹ 43,99,925" [ref=e343]
                                    - cell "12.00%" [ref=e344]
                                - row:
                                    - cell
                                - row [ref=e345]:
                                    - cell " 2032" [ref=e346] [cursor=pointer]
                                    - cell "₹ 1,49,927" [ref=e347]
                                    - cell "₹ 3,89,909" [ref=e348]
                                    - cell "₹ 5,39,836" [ref=e349]
                                    - cell "₹ 42,49,998" [ref=e350]
                                    - cell "15.00%" [ref=e351]
                                - row:
                                    - cell
                                - row [ref=e352]:
                                    - cell " 2033" [ref=e353] [cursor=pointer]
                                    - cell "₹ 1,63,991" [ref=e354]
                                    - cell "₹ 3,75,845" [ref=e355]
                                    - cell "₹ 5,39,836" [ref=e356]
                                    - cell "₹ 40,86,007" [ref=e357]
                                    - cell "18.28%" [ref=e358]
                                - row:
                                    - cell
                                - row [ref=e359]:
                                    - cell " 2034" [ref=e360] [cursor=pointer]
                                    - cell "₹ 1,79,374" [ref=e361]
                                    - cell "₹ 3,60,461" [ref=e362]
                                    - cell "₹ 5,39,836" [ref=e363]
                                    - cell "₹ 39,06,633" [ref=e364]
                                    - cell "21.87%" [ref=e365]
                                - row:
                                    - cell
                                - row [ref=e366]:
                                    - cell " 2035" [ref=e367] [cursor=pointer]
                                    - cell "₹ 1,96,201" [ref=e368]
                                    - cell "₹ 3,43,635" [ref=e369]
                                    - cell "₹ 5,39,836" [ref=e370]
                                    - cell "₹ 37,10,432" [ref=e371]
                                    - cell "25.79%" [ref=e372]
                                - row:
                                    - cell
                                - row [ref=e373]:
                                    - cell " 2036" [ref=e374] [cursor=pointer]
                                    - cell "₹ 2,14,606" [ref=e375]
                                    - cell "₹ 3,25,230" [ref=e376]
                                    - cell "₹ 5,39,836" [ref=e377]
                                    - cell "₹ 34,95,826" [ref=e378]
                                    - cell "30.08%" [ref=e379]
                                - row:
                                    - cell
                                - row [ref=e380]:
                                    - cell " 2037" [ref=e381] [cursor=pointer]
                                    - cell "₹ 2,34,737" [ref=e382]
                                    - cell "₹ 3,05,098" [ref=e383]
                                    - cell "₹ 5,39,836" [ref=e384]
                                    - cell "₹ 32,61,088" [ref=e385]
                                    - cell "34.78%" [ref=e386]
                                - row:
                                    - cell
                                - row [ref=e387]:
                                    - cell " 2038" [ref=e388] [cursor=pointer]
                                    - cell "₹ 2,56,757" [ref=e389]
                                    - cell "₹ 2,83,078" [ref=e390]
                                    - cell "₹ 5,39,836" [ref=e391]
                                    - cell "₹ 30,04,331" [ref=e392]
                                    - cell "39.91%" [ref=e393]
                                - row:
                                    - cell
                                - row [ref=e394]:
                                    - cell " 2039" [ref=e395] [cursor=pointer]
                                    - cell "₹ 2,80,843" [ref=e396]
                                    - cell "₹ 2,58,993" [ref=e397]
                                    - cell "₹ 5,39,836" [ref=e398]
                                    - cell "₹ 27,23,488" [ref=e399]
                                    - cell "45.53%" [ref=e400]
                                - row:
                                    - cell
                                - row [ref=e401]:
                                    - cell " 2040" [ref=e402] [cursor=pointer]
                                    - cell "₹ 3,07,188" [ref=e403]
                                    - cell "₹ 2,32,648" [ref=e404]
                                    - cell "₹ 5,39,836" [ref=e405]
                                    - cell "₹ 24,16,300" [ref=e406]
                                    - cell "51.67%" [ref=e407]
                                - row:
                                    - cell
                                - row [ref=e408]:
                                    - cell " 2041" [ref=e409] [cursor=pointer]
                                    - cell "₹ 3,36,004" [ref=e410]
                                    - cell "₹ 2,03,831" [ref=e411]
                                    - cell "₹ 5,39,836" [ref=e412]
                                    - cell "₹ 20,80,295" [ref=e413]
                                    - cell "58.39%" [ref=e414]
                                - row:
                                    - cell
                                - row [ref=e415]:
                                    - cell " 2042" [ref=e416] [cursor=pointer]
                                    - cell "₹ 3,67,524" [ref=e417]
                                    - cell "₹ 1,72,312" [ref=e418]
                                    - cell "₹ 5,39,836" [ref=e419]
                                    - cell "₹ 17,12,771" [ref=e420]
                                    - cell "65.74%" [ref=e421]
                                - row:
                                    - cell
                                - row [ref=e422]:
                                    - cell " 2043" [ref=e423] [cursor=pointer]
                                    - cell "₹ 4,02,000" [ref=e424]
                                    - cell "₹ 1,37,835" [ref=e425]
                                    - cell "₹ 5,39,836" [ref=e426]
                                    - cell "₹ 13,10,771" [ref=e427]
                                    - cell "73.78%" [ref=e428]
                                - row:
                                    - cell
                                - row [ref=e429]:
                                    - cell " 2044" [ref=e430] [cursor=pointer]
                                    - cell "₹ 4,39,711" [ref=e431]
                                    - cell "₹ 1,00,125" [ref=e432]
                                    - cell "₹ 5,39,836" [ref=e433]
                                    - cell "₹ 8,71,061" [ref=e434]
                                    - cell "82.58%" [ref=e435]
                                - row:
                                    - cell
                                - row [ref=e436]:
                                    - cell " 2045" [ref=e437] [cursor=pointer]
                                    - cell "₹ 4,80,959" [ref=e438]
                                    - cell "₹ 58,877" [ref=e439]
                                    - cell "₹ 5,39,836" [ref=e440]
                                    - cell "₹ 3,90,102" [ref=e441]
                                    - cell "92.20%" [ref=e442]
                                - row:
                                    - cell
                                - row [ref=e443]:
                                    - cell " 2046" [ref=e444] [cursor=pointer]
                                    - cell "₹ 3,90,102" [ref=e445]
                                    - cell "₹ 14,775" [ref=e446]
                                    - cell "₹ 4,04,877" [ref=e447]
                                    - cell "₹ 0" [ref=e448]
                                    - cell "100.00%" [ref=e449]
                                - row:
                                    - cell
                        - generic [ref=e450]:
                            - paragraph [ref=e451]: Want to download OR share a custom link to your EMI calculation (with all your numbers pre-filled)?
                            - button " Download PDF" [ref=e452] [cursor=pointer]:
                                - generic [ref=e453]: 
                                - text: Download PDF
                            - button " Download Excel" [ref=e454] [cursor=pointer]:
                                - generic [ref=e455]: 
                                - text: Download Excel
                            - button " Share" [ref=e456] [cursor=pointer]:
                                - generic [ref=e457]: 
                                - text: Share
                            - text: 
                - generic [ref=e458]:
                    - generic [ref=e459]:
                        - generic [ref=e464]:
                            - heading "What is EMI?" [level=2] [ref=e465]
                            - paragraph [ref=e466]: Equated Monthly Installment - EMI for short - is the amount payable every month to the bank or any other financial institution until the loan amount is fully paid off. It consists of the interest on loan as well as part of the principal amount to be repaid. The sum of principal amount and interest is divided by the tenure, i.e., number of months, in which the loan has to be repaid. This amount has to be paid monthly. The interest component of the EMI would be larger during the initial months and gradually reduce with each payment. The exact percentage allocated towards payment of the principal depends on the interest rate. Even though your monthly EMI payment won't change, the proportion of principal and interest components will change with time. With each successive payment, you'll pay more towards the principal and less in interest.
                            - paragraph [ref=e467]: "Here's the formula to calculate EMI:"
                            - paragraph:
                                - img "EMI Formula" [ref=e468]
                            - paragraph [ref=e469]
                            - paragraph [ref=e470]
                            - paragraph [ref=e471]
                            - paragraph [ref=e472]: where
                            - paragraph [ref=e473]:
                                - strong [ref=e474]: E
                                - text: is EMI
                            - paragraph [ref=e475]:
                                - strong [ref=e476]: P
                                - text: is Principal Loan Amount
                            - paragraph [ref=e477]:
                                - strong [ref=e478]: r
                                - text: is rate of interest calculated on monthly basis. (i.e., r = Rate of Annual interest/12/100. If rate of interest is 10.5% per annum, then r = 10.5/12/100=0.00875)
                            - paragraph [ref=e479]:
                                - strong [ref=e480]: 'n'
                                - text: is loan term / tenure / duration in number of months
                            - blockquote [ref=e481]:
                                - paragraph [ref=e482]:
                                    - text: For example, if you borrow ₹10,00,000 from the bank at 10.5% annual interest for a period of 10 years (i.e., 120 months), then EMI = ₹10,00,000 * 0.00875 * (1 + 0.00875)
                                    - superscript [ref=e483]: '120'
                                    - text: / ((1 + 0.00875)
                                    - superscript [ref=e484]: '120'
                                    - text: '- 1) = ₹13,493. i.e., you will have to pay ₹13,493 for 120 months to repay the entire loan amount. The total amount payable will be ₹13,493 * 120 = ₹16,19,220 that includes ₹6,19,220 as interest toward the loan.'
                            - paragraph [ref=e485]:
                                - text: Computing EMI for different combinations of principal loan amount, interest rates and loan term using the above
                                - link "EMI formula" [ref=e486] [cursor=pointer]:
                                    - /url: https://emicalculator.net/loan-emi-calculation-work/
                                - text: by hand or MS Excel is time consuming, complex and error prone. Our EMI calculator automates this calculation for you and gives you the result in a split second along with visual charts displaying payment schedule and the break-up of total payment.
                                - insertion
                            - heading "How to Use EMI Calculator?" [level=2] [ref=e487]
                            - paragraph [ref=e488]: With colourful charts and instant results, our EMI Calculator is easy to use, intuitive to understand and is quick to perform. You can calculate EMI for home loan, car loan, personal loan, education loan or any other fully amortizing loan using this calculator.
                            - paragraph [ref=e489]: 'Enter the following information in the EMI Calculator:'
                            - list [ref=e490]:
                                - listitem [ref=e491]: Principal loan amount you wish to avail (rupees) 
                                - listitem [ref=e492]: Loan term (months or years) 
                                - listitem [ref=e493]: Rate of interest (percentage) 
                                - listitem [ref=e494]:
                                    - link [ref=e495] [cursor=pointer]:
                                        - /url: https://emicalculator.net/emi-in-advance-vs-emi-in-arrears/
                                        - strong [ref=e496]: EMI in arrears OR EMI in
                                        - text: advance
                                    - text: (for car loan only) 
                            - paragraph [ref=e497]: Use the slider to adjust the values in the EMI calculator form. If you need to enter more precise values, you can type the values directly in the relevant boxes provided above. As soon as the values are changed using the slider (or hit the 'tab' key after entering the values directly in the input fields), EMI calculator will re-calculate your monthly payment (EMI) amount.
                            - paragraph [ref=e498]: A pie chart depicting the break-up of total payment (i.e., total principal vs. total interest payable) is also displayed. It displays the percentage of total interest versus principal amount in the sum total of all payments made against the loan. The payment schedule table showing payments made every month / year for the entire loan duration is displayed along with a chart showing interest and principal components paid each year. A portion of each payment is for the interest while the remaining amount is applied towards the principal balance. During initial loan period, a large portion of each payment is devoted to interest. With passage of time, larger portions pay down the principal. The payment schedule also shows the intermediate outstanding balance for each year which will be carried over to the next year.
                            - paragraph [ref=e499]:
                                - text: Want to make part prepayments to shorten your home loan schedule and reduce your total interest outgo? Use our
                                - link "Home Loan EMI Calculator with Prepayments" [ref=e500] [cursor=pointer]:
                                    - /url: https://emicalculator.net/home-loan-emi-calculator/
                                - text: . If you wish to calculate how much loan you can afford OR determine advertised vs actual loan interest rate (along with loan APR) on a purchase, use our
                                - link "loan calculator" [ref=e501] [cursor=pointer]:
                                    - /url: https://emicalculator.net/loan-calculator/
                                - text: .
                            - heading "Floating Rate EMI Calculation" [level=2] [ref=e502]
                            - paragraph [ref=e503]:
                                - text: We suggest that you calculate floating / variable rate EMI by taking into consideration two opposite scenarios, i.e., optimistic (deflationary) and pessimistic (inflationary) scenario. Loan amount and loan tenure, two components required to calculate the EMI are under your control; i.e., you are going to decide how much loan you have to borrow and how long your loan tenure should be. But interest rate is decided by the banks & HFCs based on rates and policies set by
                                - link "RBI" [ref=e504] [cursor=pointer]:
                                    - /url: http://www.rbi.org.in/
                                - text: . As a borrower, you should consider the two extreme possibilities of increase and decrease in the rate of interest and calculate your EMI under these two conditions. Such calculation will help you decide how much EMI is affordable, how long your loan tenure should be and how much you should borrow.
                            - paragraph [ref=e505]:
                                - strong [ref=e506]: Optimistic (deflationary) scenario
                                - text: ': Assume that the rate of interest comes down by 1% - 3% from the present rate. Consider this situation and calculate your EMI. In this situation, your EMI will come down or you may opt to shorten the loan tenure. Ex: If you avail home loan to purchase a house as an investment, then optimistic scenario enables you to compare this with other investment opportunities.'
                            - paragraph [ref=e507]:
                                - strong [ref=e508]: Pessimistic (inflationary) scenario
                                - text: ': In the same way, assume that the rate of interest is hiked by 1% - 3%. Is it possible for you to continue to pay the EMI without much struggle? Even a 2% increase in rate of interest can result in significant rise in your monthly payment for the entire loan tenure.'
                            - paragraph [ref=e509]: Such calculation helps you to plan for such future possibilities. When you take a loan, you are making a financial commitment for next few months, years or decades. So consider the best as well as worst cases...and be ready for both. In short, hope for the best but be prepared for the worst!
                        - generic [ref=e510]:
                            - list [ref=e515]:
                                - listitem [ref=e516]:
                                    - link "" [ref=e517] [cursor=pointer]:
                                        - /url: https://emicalculator.net/home-loan-emi-calculator/
                                        - text: 
                                        - generic [aria-hidden] [ref=e518]: 
                                    - generic [ref=e519]:
                                        - heading [level=5] [ref=e520]:
                                            - link "Home Loan EMI Calculator" [ref=e521] [cursor=pointer]:
                                                - /url: https://emicalculator.net/home-loan-emi-calculator/
                                        - paragraph [ref=e523]: Home Loan EMI Calculator with Prepayments, Taxes & Insurance
                                    - text: 
                            - list [ref=e528]:
                                - listitem [ref=e529]:
                                    - link "" [ref=e530] [cursor=pointer]:
                                        - /url: https://play.google.com/store/apps/details?id=net.emicalculator
                                        - text: 
                                        - generic [aria-hidden] [ref=e531]: 
                                    - generic [ref=e532]:
                                        - heading [level=5] [ref=e533]:
                                            - link "Android App" [ref=e534] [cursor=pointer]:
                                                - /url: https://play.google.com/store/apps/details?id=net.emicalculator
                                        - paragraph [ref=e536]: Download our Free Android App from Google Play Store
                                    - text: 
                            - list [ref=e541]:
                                - listitem [ref=e542]:
                                    - link "" [ref=e543] [cursor=pointer]:
                                        - /url: https://emicalculator.net/loan-calculator/
                                        - text: 
                                        - generic [aria-hidden] [ref=e544]: 
                                    - generic [ref=e545]:
                                        - heading [level=5] [ref=e546]:
                                            - link "Loan Calculator" [ref=e547] [cursor=pointer]:
                                                - /url: https://emicalculator.net/loan-calculator/
                                        - paragraph [ref=e549]: Loan Calculator — Calculate EMI, Affordability, Tenure & Interest Rate
                                    - text: 
                    - heading "Recent Articles" [level=2] [ref=e550]
                    - list [ref=e552]:
                        - listitem [ref=e553]:
                            - link "How much can you borrow against your shares, mutual funds, and ETFs?" [ref=e554] [cursor=pointer]:
                                - /url: https://emicalculator.net/how-much-can-you-borrow-against-your-shares-mutual-funds-and-etfs/
                            - generic [ref=e555]: May 02, 2026
                        - listitem [ref=e556]:
                            - 'link "Debt Consolidation: Silver Bullet or Slippery Slope?" [ref=e557] [cursor=pointer]':
                                - /url: https://emicalculator.net/debt-consolidation-silver-bullet-or-slippery-slope/
                            - generic [ref=e558]: Apr 30, 2026
                        - listitem [ref=e559]:
                            - 'link "RBI to Banks: Online Fraud: Prove Your Customer Was at Fault OR Pay up" [ref=e560] [cursor=pointer]':
                                - /url: https://emicalculator.net/rbi-to-banks-online-fraud-prove-your-customer-was-at-fault-or-pay-up/
                            - generic [ref=e561]: Apr 28, 2026
                        - listitem [ref=e562]:
                            - 'link "Tax-Free Loans from Employer: How the Rules Have Changed?" [ref=e563] [cursor=pointer]':
                                - /url: https://emicalculator.net/tax-free-loans-from-employer-how-the-rules-have-changed/
                            - generic [ref=e564]: Apr 25, 2026
                        - listitem [ref=e565]:
                            - 'link "Basic Salary, HRA, Gratuity: Changes from April 1, 2026 and What It Means for You?" [ref=e566] [cursor=pointer]':
                                - /url: https://emicalculator.net/basic-salary-hra-gratuity-changes-from-april-1-2026-and-what-it-means-for-you/
                            - generic [ref=e567]: Apr 22, 2026
                - generic [ref=e568]:
                    - generic [ref=e569]:
                        - heading "Leave a Reply" [level=3] [ref=e570]
                        - generic [ref=e571]:
                            - paragraph [ref=e572]:
                                - text: Your email address will not be published.
                                - generic [ref=e573]: Required fields are marked *
                            - paragraph [ref=e574]:
                                - generic [ref=e575]: Comment *
                                - textbox "Comment *" [ref=e576]
                            - paragraph [ref=e577]:
                                - generic [ref=e578]: Name *
                                - textbox "Name *" [ref=e579]
                            - paragraph [ref=e580]:
                                - generic [ref=e581]: Email *
                                - textbox "Email *" [ref=e582]
                            - paragraph [ref=e583]:
                                - generic [ref=e584]: Website
                                - textbox "Website" [ref=e585]
                            - paragraph [ref=e586]:
                                - button "Post Comment" [ref=e587] [cursor=pointer]
                    - heading "1,123 responses to “EMI Calculator for Home Loan, Car Loan & Personal Loan in India”" [level=2] [ref=e588]
                    - generic [ref=e589]:
                        - list [ref=e590]:
                            - listitem [ref=e591]:
                                - article [ref=e592]:
                                    - generic [ref=e593]:
                                        - generic [ref=e594]: 'KEERTHANA.T says:'
                                        - link [ref=e596] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-17274
                                            - time [ref=e597]: April 15, 2026 at 12:06 PM
                                    - paragraph [ref=e599]: EMI Calculator works really well , makes loan EMI Count easy for who working in Finance field corporates .
                                    - link "Reply to KEERTHANA.T" [ref=e601] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=17274#respond
                                        - text: Reply
                            - listitem [ref=e602]:
                                - article [ref=e603]:
                                    - generic [ref=e604]:
                                        - generic [ref=e605]: 'Raja says:'
                                        - link [ref=e607] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-16946
                                            - time [ref=e608]: April 8, 2026 at 1:47 PM
                                    - paragraph [ref=e610]: Good website to calculate EMI
                                    - link "Reply to Raja" [ref=e612] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=16946#respond
                                        - text: Reply
                            - listitem [ref=e613]:
                                - article [ref=e614]:
                                    - generic [ref=e615]:
                                        - generic [ref=e616]: 'nand Ram says:'
                                        - link [ref=e618] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-16404
                                            - time [ref=e619]: March 26, 2026 at 8:30 AM
                                    - paragraph [ref=e621]: I have been using this calculator for 6+ years
                                    - link "Reply to nand Ram" [ref=e623] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=16404#respond
                                        - text: Reply
                            - listitem [ref=e624]:
                                - article [ref=e625]:
                                    - generic [ref=e626]:
                                        - generic [ref=e627]:
                                            - link "Sumit Raj" [ref=e629] [cursor=pointer]:
                                                - /url: https://emicalculator.net/
                                            - text: 'says:'
                                        - link [ref=e631] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-16323
                                            - time [ref=e632]: March 24, 2026 at 5:00 PM
                                    - paragraph [ref=e634]: It is very easy to calculate and even it provides features to calculate old EMI starting date.
                                    - link "Reply to Sumit Raj" [ref=e636] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=16323#respond
                                        - text: Reply
                            - listitem [ref=e637]:
                                - article [ref=e638]:
                                    - generic [ref=e639]:
                                        - generic [ref=e640]: 'Rajshekhar Chakraborty says:'
                                        - link [ref=e642] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-15303
                                            - time [ref=e643]: March 5, 2026 at 6:20 PM
                                    - paragraph [ref=e645]: nice
                                    - link "Reply to Rajshekhar Chakraborty" [ref=e647] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=15303#respond
                                        - text: Reply
                            - listitem [ref=e648]:
                                - article [ref=e649]:
                                    - generic [ref=e650]:
                                        - generic [ref=e651]: 'DINESH says:'
                                        - link [ref=e653] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-13791
                                            - time [ref=e654]: January 19, 2026 at 3:32 PM
                                    - paragraph [ref=e656]: GOOD APPLICATION
                                    - link "Reply to DINESH" [ref=e658] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=13791#respond
                                        - text: Reply
                            - listitem [ref=e659]:
                                - article [ref=e660]:
                                    - generic [ref=e661]:
                                        - generic [ref=e662]: 'Eshwer says:'
                                        - link [ref=e664] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-13454
                                            - time [ref=e665]: January 3, 2026 at 7:55 AM
                                    - generic [ref=e666]:
                                        - paragraph [ref=e667]: Last 10 years I used to use this for emi calculations. It is easy and helpful.
                                        - paragraph [ref=e668]: Also it could be better if you can add part payments also
                                    - link "Reply to Eshwer" [ref=e670] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=13454#respond
                                        - text: Reply
                                - list [ref=e671]:
                                    - listitem [ref=e672]:
                                        - article [ref=e673]:
                                            - generic [ref=e674]:
                                                - generic [ref=e675]: 'Bob says:'
                                                - link [ref=e677] [cursor=pointer]:
                                                    - /url: https://emicalculator.net/#comment-14419
                                                    - time [ref=e678]: February 9, 2026 at 10:20 AM
                                            - paragraph [ref=e680]: Awesome suggestions
                                            - link "Reply to Bob" [ref=e682] [cursor=pointer]:
                                                - /url: https://emicalculator.net/?replytocom=14419#respond
                                                - text: Reply
                            - listitem [ref=e683]:
                                - article [ref=e684]:
                                    - generic [ref=e685]:
                                        - generic [ref=e686]: 'Ashish Sharma says:'
                                        - link [ref=e688] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-13217
                                            - time [ref=e689]: December 22, 2025 at 7:36 PM
                                    - paragraph [ref=e691]: Best app to calculate emi . Even bank has not created a such a good app
                                    - link "Reply to Ashish Sharma" [ref=e693] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=13217#respond
                                        - text: Reply
                            - listitem [ref=e694]:
                                - article [ref=e695]:
                                    - generic [ref=e696]:
                                        - generic [ref=e697]: 'Lakshmi narayana says:'
                                        - link [ref=e699] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-12878
                                            - time [ref=e700]: December 10, 2025 at 11:05 AM
                                    - paragraph [ref=e702]: best ever tool, very helpful. specially no need our personal details to calculate, easy access and thank god no ads.
                                    - link "Reply to Lakshmi narayana" [ref=e704] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=12878#respond
                                        - text: Reply
                            - listitem [ref=e705]:
                                - article [ref=e706]:
                                    - generic [ref=e707]:
                                        - generic [ref=e708]: 'Jashwanth S V says:'
                                        - link [ref=e710] [cursor=pointer]:
                                            - /url: https://emicalculator.net/#comment-11268
                                            - time [ref=e711]: November 5, 2025 at 2:48 PM
                                    - paragraph [ref=e713]: IT Works fine
                                    - link "Reply to Jashwanth S V" [ref=e715] [cursor=pointer]:
                                        - /url: https://emicalculator.net/?replytocom=11268#respond
                                        - text: Reply
                        - button "Load More" [ref=e717]
    - contentinfo [ref=e718]:
        - generic [ref=e719]:
            - generic [ref=e720]:
                - generic [ref=e721]:
                    - heading "Calculators & Widgets" [level=3] [ref=e722]
                    - list [ref=e724]:
                        - listitem [ref=e725]:
                            - link "EMI Calculator" [ref=e726] [cursor=pointer]:
                                - /url: https://emicalculator.net/
                        - listitem [ref=e727]:
                            - link "Android App" [ref=e728] [cursor=pointer]:
                                - /url: https://play.google.com/store/apps/details?id=net.emicalculator
                        - listitem [ref=e729]:
                            - link "Loan Calculator — Calculate EMI, Affordability, Tenure & Interest Rate" [ref=e730] [cursor=pointer]:
                                - /url: https://emicalculator.net/loan-calculator/
                        - listitem [ref=e731]:
                            - link "Home Loan EMI Calculator with Prepayments, Taxes & Insurance" [ref=e732] [cursor=pointer]:
                                - /url: https://emicalculator.net/home-loan-emi-calculator/
                        - listitem [ref=e733]:
                            - link "Mobile-friendly EMI Calculator Widget" [ref=e734] [cursor=pointer]:
                                - /url: https://emicalculator.net/emi-calculator-widget/
                        - listitem [ref=e735]:
                            - link "Home Loan Interest Rates — As of July 1, 2025" [ref=e736] [cursor=pointer]:
                                - /url: https://emicalculator.net/home-loan-interest-rates/
                - generic [ref=e737]:
                    - heading "Android App" [level=3] [ref=e738]
                    - generic [ref=e739]:
                        - paragraph [ref=e740]:
                            - text: You can also download our
                            - link [ref=e741] [cursor=pointer]:
                                - /url: https://play.google.com/store/apps/details?id=net.emicalculator
                                - strong [ref=e742]: EMI Calculator android app
                            - text: from the Google Play Store.
                        - paragraph [ref=e743]:
                            - link [ref=e744] [cursor=pointer]:
                                - /url: https://play.google.com/store/apps/details?id=net.emicalculator
                - generic [ref=e746]:
                    - heading "About Us" [level=3] [ref=e747]
                    - list [ref=e749]:
                        - listitem [ref=e750]:
                            - link "Privacy Policy" [ref=e751] [cursor=pointer]:
                                - /url: https://emicalculator.net/privacy-policy/
                        - listitem [ref=e752]:
                            - link "Terms of Use" [ref=e753] [cursor=pointer]:
                                - /url: https://emicalculator.net/terms-of-use/
                        - listitem [ref=e754]:
                            - link "Contact Us" [ref=e755] [cursor=pointer]:
                                - /url: https://emicalculator.net/contact/
            - paragraph [ref=e757]: Copyright © 2011-2025 emicalculator.net. All Rights Reserved.
```

# Test source

```ts
  1  | import { expect } from '@playwright/test';
  2  | import { Then, When } from '../../fixtures';
  3  | import { toLoanType } from '../../pages/EmiCalculatorPage';
  4  | import { calculateEmi, yearsToMonths } from '../../support/emi-math';
  5  | import { formatInr, parseAmountShorthand } from '../../support/inr';
  6  |
  7  | // Steps for the self-healing exercise. They act on the deliberately broken legacy locators;
  8  | // the assertions use the working page object where possible, so a wrong heal can't pass.
  9  |
  10 | When('I switch product using the legacy Personal Loan tab locator', async ({ legacyPage }) => {
  11 |   await legacyPage.personalLoanTab.click();
  12 | });
  13 |
  14 | Then('the {string} tab is the active product', async ({ emiPage }, tab: string) => {
  15 |   await expect(emiPage.loanTabItem(toLoanType(tab))).toHaveClass(/\bactive\b/);
  16 | });
  17 |
  18 | When(
  19 |   'I type {word} into the legacy loan amount locator',
  20 |   async ({ legacyPage }, amount: string) => {
> 21 |     await legacyPage.loanAmountInput.fill(String(parseAmountShorthand(amount)));
     |                                      ^ TimeoutError: locator.fill: Timeout 5000ms exceeded.
  22 |     await legacyPage.loanAmountInput.press('Tab');
  23 |   },
  24 | );
  25 |
  26 | Then(
  27 |   'the legacy loan amount locator shows {string}',
  28 |   async ({ legacyPage, emiPage }, shown: string) => {
  29 |     await expect(legacyPage.loanAmountInput).toHaveValue(shown);
  30 |     // ...and it really is the loan amount field, not some other input that accepted the text.
  31 |     await expect(emiPage.form.amount('Home Loan')).toHaveValue(shown);
  32 |   },
  33 | );
  34 |
  35 | Then(
  36 |   'the legacy interest rate locator shows the default rate {string}',
  37 |   async ({ legacyPage, emiPage }, rate: string) => {
  38 |     await expect(legacyPage.interestRateInput).toHaveValue(rate);
  39 |     await expect(emiPage.form.interestRate).toHaveValue(rate);
  40 |   },
  41 | );
  42 |
  43 | Then(
  44 |   'the legacy monthly EMI locator shows the EMI for the default 50L loan at 9% for 20 years',
  45 |   async ({ legacyPage }) => {
  46 |     const { emi } = calculateEmi({
  47 |       principal: 5_000_000,
  48 |       annualRatePct: 9,
  49 |       months: yearsToMonths(20),
  50 |     });
  51 |     await expect(legacyPage.monthlyEmiValue).toHaveText(
  52 |       new RegExp(`^\\s*₹\\s*${formatInr(emi)}\\s*$`),
  53 |     );
  54 |   },
  55 | );
  56 |
  57 | Then('the legacy EMI heading locator is visible and names the loan EMI', async ({ legacyPage }) => {
  58 |   await expect(legacyPage.emiHeading).toBeVisible();
  59 |   await expect(legacyPage.emiHeading).toHaveText(/\bEMI\b/);
  60 | });
  61 |
  62 | Then('the monthly EMI shows {string} for the default loan', async ({ emiPage }, shown: string) => {
  63 |   await expect(emiPage.emi).toHaveText(shown);
  64 | });
  65 |
```
