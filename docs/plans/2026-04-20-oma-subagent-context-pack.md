# OMA Subagent Context Pack

Use this pack when dispatching any subagent for the mobile UI modernization lane.

## Worktree

- Primary implementation workspace: `D:\dev\OMA\OMA-Order-Management-App\.worktrees\ui-modernization`
- Do not work inside `D:\dev\OMA\OMA-Order-Management-App\.worktrees\redesign` because that worktree already has unrelated local edits.

## Required Reading For Every Subagent

Every implementer and reviewer subagent must read these files before acting:

- `D:\dev\OMA\OMA-Order-Management-App\docs\plans\2026-04-19-oma-mobile-ui-modernization.md`
- `D:\dev\OMA\OMA-Order-Management-App\docs\plans\2026-04-19-oma-ui-inspiration-design.md`
- `D:\dev\OMA\OMA-Order-Management-App\Expert-Guidelines.md`

## Shared Product Rules

- Preserve route semantics in `app/(auth)` and `app/(app)`.
- Preserve storage keys: `userRole`, `username`, `lastLogin`, `cachedUsername`, `apiCache`.
- Preserve backend behavior and workbook semantics.
- Do not change `bookings`, `dispatch_value`, `invoiced_value`, `collections_value`, or `ar_exposure` definitions.
- Treat `analytics`, `new-order`, `process-orders`, `order-approval`, and `order-details` as workflow-sensitive screens. Restyle without weakening their domain logic.
- This is a mobile-first redesign. Optimize for hierarchy, touch targets, bottom sheets, focused flows, and task speed.

## Shared Visual Rules

- The target is "premium mobile command center," not generic SaaS admin.
- Pilot the redesign on home first. Do not start by rewriting the entire system.
- One dominant surface per screen.
- Remove repeated intro cards and explanatory filler.
- Use bottom sheets for overflow, filters, and secondary pickers.
- Empty, loading, error, and no-results states are first-pass work.
- Do not over-unify screen types. Search screens, queue screens, approval screens, detail screens, and creation flows should keep different visual grammar where needed.

## Current Screenshot Set

These files show the current UI baseline:

- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\01-login.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\02-main.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\03-analytics.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\04-customers.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\05-products.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\06-new-order.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\07-process-orders.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\08-my-orders.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\09-order-approval.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\10-customer-summary.png`
- `D:\dev\OMA\OMA-Order-Management-App\current-app-screenshots\11-order-details.png`

## Expert Reference Set

These files show the expert mobile interaction references:

- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(3).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(5).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(6).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(7).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(8).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(9).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(10).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(11).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(12).png`
- `D:\dev\OMA\OMA-Order-Management-App\Expert\image(13).png`

## Task-Specific Screenshot Bundles

### Task 0: Audit

Give the subagent:

- all current screenshots `01` through `11`
- all expert reference images

### Task 2: Home Pilot

Give the subagent:

- `02-main.png`
- `03-analytics.png`
- `07-process-orders.png`
- `Expert\image(10).png`
- `Expert\image(11).png`
- `Expert\image(12).png`
- `Expert\image(13).png`

### Task 5: Navigation And Shell

Give the subagent:

- `02-main.png`
- `11-order-details.png`
- `Expert\image(10).png`
- `Expert\image(11).png`
- `Expert\image(12).png`
- `Expert\image(13).png`

### Task 6: Login

Give the subagent:

- `01-login.png`
- any expert references used for mood and focus, but not queue or data density

### Task 7: Analytics

Give the subagent:

- `03-analytics.png`
- `02-main.png`
- relevant expert references that show dark command-center hierarchy and compact support sections

### Task 8: Customers And Products

Give the subagent:

- `04-customers.png`
- `05-products.png`
- expert references that emphasize search-first layout, filters, and short top sections

### Task 9: Queue And Approval

Give the subagent:

- `07-process-orders.png`
- `08-my-orders.png`
- `09-order-approval.png`
- expert references that show operational urgency, dense but clear cards, and contextual actions

### Task 10: Detail Screens

Give the subagent:

- `10-customer-summary.png`
- `11-order-details.png`
- expert references that show timeline-led, detail-led, or stacked contextual surfaces

### Task 11: New Order

Give the subagent:

- `06-new-order.png`
- expert references that show focused creation flows, step progress, and bottom-sheet selection

## Reviewer Expectations

- Spec reviewers must compare the subagent result against the exact task text from the implementation plan.
- Code quality reviewers must judge clarity, reuse boundaries, mobile interaction quality, and regression risk.
- Reviewers should also re-check the relevant screenshot bundle so they do not approve a technically correct but visually off-target change.
