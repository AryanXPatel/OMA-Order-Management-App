# Owner Command Center Analytics Research

## Goal
Define what a manager/business-owner analytics page in OMA should show, based on order-management, order-to-cash, collections, and sales-execution research.

## Audience
This is for owner-operators and manager-business owners, not only operational users. The page should answer:

1. What revenue or cash is at risk today?
2. Where is the flow stuck right now?
3. Which customers, reps, channels, or product groups are driving the risk?
4. What should the owner intervene on first?

## Research Date
- Compiled on `2026-04-19`

## Core Design Direction
- Mobile-first
- Exception-first
- Actionable over decorative
- One-tap drill-in from every critical card

The page should behave like a command center, not a generic KPI screen.

## Priority KPI Groups

### 1. Revenue At Risk
- Open order value
- Blocked / rejected value
- Pending approval value
- Pending dispatch value
- Orders likely to slip this week

Why it matters:
- This tells the owner how much demand is not yet realized and where revenue leakage is starting.

### 2. Order Velocity And Throughput
- Orders per period
- Lines per period
- Intake-to-approval time
- Approval-to-dispatch time
- Order-to-dispatch cycle time

Why it matters:
- This shows whether the business is moving fast enough, not just whether it is busy.

### 3. Backlog And Aging
- Backlog count and value
- Aged approvals
- Aged dispatch queue
- Promise-date drift
- Oldest open orders

Why it matters:
- Backlog is one of the cleanest signals of where customer experience and working capital are starting to degrade.

### 4. Fulfillment And Queue Health
- Dispatch rate
- Ready-to-dispatch queue
- Orders stuck in approval
- Orders partially completed
- Allocation or stock-risk exceptions when inventory is available later

Why it matters:
- Owners need to see bottlenecks, not only totals.

### 5. Cash Conversion And A/R Pressure
- Total A/R exposure
- Aging mix: `current / 1-30 / 31-60 / 61-90 / 90+`
- High-risk exposure
- DSO
- CEI / collection effectiveness
- Cash due in `7/30` days

Why it matters:
- This is the link between orders created and cash actually realized.

### 6. Customer, Channel, And Product Concentration
- Top customer share
- Top five customer share
- Source/channel mix
- Product-group mix
- High-risk accounts

Why it matters:
- Owners care about dependency risk. A business carried by one account, one channel, or one category is fragile.

### 7. Rep Execution And Coaching
- Revenue per rep
- Open backlog per rep
- Dispatch rate per rep
- Active accounts per rep
- Stalled value per rep

Why it matters:
- This gives the owner a coaching and accountability lens without requiring a desktop CRM.

## Recommended Mobile Layout

### Top Strip
- Booked value
- Open value
- Overdue A/R
- Dispatch rate
- DSO or collections efficiency

### Intervention Queue
- Critical approvals
- Long-stuck dispatches
- 61+ day debtors
- Broken promise-to-pay items
- High-concentration accounts

### Flow View
- Intake -> Approval -> Dispatch -> Invoice -> Cash

### Cash Risk Panel
- Aging ladder
- Top debtors
- Concentration flags

### Mix And Concentration
- Top customers
- Top sources
- Top product groups

### Rep Execution
- Leaderboard
- Backlog by rep
- Stalled value by rep

## Practical Thresholds
These are practical defaults, not absolute standards:

- `61+` day overdue A/R: manager review
- `90+` day overdue A/R: critical escalation
- `CEI < 85%`: review collections process
- `DSO > payment terms` or rising for 2 periods: owner alert
- `customer > 10%` of revenue or A/R: concentration risk
- pending approval older than `24h`: operational alert
- approved-but-not-dispatched older than `24h`: dispatch alert

## What Current OMA Data Already Supports
- Booked demand
- Open pipeline
- Dispatch rate and cycle time
- Pending approvals
- Pending dispatches
- Rejected orders
- A/R aging from transaction-derived ledger data
- Top exposure accounts
- Rep mix
- Source mix
- Product-group mix
- Attention queue

## What Needs More Data
- True open-item A/R aging
- Plan vs target
- Promise-to-pay
- Credit limit / payment terms / risk tier
- Inventory or fulfillment capacity
- Invoice-linked realized value

## Sources
- Oracle NetSuite order management KPIs:
  https://www.netsuite.com/portal/resource/articles/ecommerce/order-management-kpis.shtml
- Oracle NetSuite order dashboard:
  https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_161727869331.html
- Oracle backlog management:
  https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/24d/faubm/why-you-use-backlog-management.html
- Oracle DSO:
  https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_0418110937.html
- Oracle CEI metrics:
  https://docs.oracle.com/en/cloud/saas/financials/26b/faofc/collections-effectiveness-index-metrics.html
- Oracle promise to pay:
  https://docs.oracle.com/en/cloud/saas/financials/26b/faofc/promise-to-pay.html
- SAP working capital:
  https://www.sap.com/resources/what-is-working-capital
- SAP collections worklist:
  https://help.sap.com/docs/SAP_S4HANA_CLOUD/918bca53037f408f91a2295d04ac16bc/01db475856c4a107e10000000a441470.html
- HubSpot mobile sales insights:
  https://knowledge.hubspot.com/prospecting/review-sales-rep-insights-on-the-hubspot-mobile-app
- Microsoft Dynamics relationship analytics:
  https://learn.microsoft.com/en-us/dynamics365/sales/relationship-analytics-overview
- Thomson Reuters collections KPIs:
  https://legal.thomsonreuters.com/en/insights/articles/the-5-kpis-for-the-collections-department
- Upflow order-to-cash KPIs:
  https://upflow.io/blog/ar-collections/order-to-cash-process
