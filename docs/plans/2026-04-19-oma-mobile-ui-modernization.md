# OMA Mobile UI Modernization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn OMA into a premium mobile command center by proving the redesign on the home screen first, then extracting only the patterns that survive the pilot into a shared system, without changing routes, storage keys, backend endpoints, or workbook semantics.

**Architecture:** Run this as a pilot-first redesign, not a top-down system rewrite. Build a real UI test harness before adding component tests, modernize `app/(app)/main.tsx` with opt-in local primitives, then extract proven tokens and shared components into `components/oma/` and `utils/`. Keep analytics, queue flows, and order creation screen-specific where the domain requires it instead of forcing one generic card grammar across the app.

**Tech Stack:** Expo Router, React Native, TypeScript, existing `ThemeContext`, existing `FeedbackProvider`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-svg`, `jest-expo`, `react-test-renderer`

---

## Locked Decisions

These decisions are part of the plan. Do not reopen them during implementation unless the business owner changes the brief.

### Screen Classes

- **Command-center screens:** `app/(app)/main.tsx`, `app/(app)/analytics.tsx`
  Dark-first surfaces, one dominant hero, max three support signals, one obvious next-action zone.
- **Utility list screens:** `app/(app)/customers.tsx`, `app/(app)/products.tsx`, `app/(app)/my-orders.tsx`
  Light utility shell, search-first layout, no oversized intro card, content starts near the top.
- **Decision and queue screens:** `app/(app)/process-orders.tsx`, `app/(app)/order-approval.tsx`
  Higher-contrast surfaces, stronger semantic status hierarchy, operational pressure visible at a glance.
- **Focused and detail flows:** `app/(app)/new-order.tsx`, `app/(app)/customer-summary.tsx`, `app/(app)/order-details.tsx`, `app/(auth)/login.tsx`
  Context-first actions, bottom sheets for secondary selection, floating nav hidden when focus matters.

### Role-Based Navigation

| Role | Primary Nav | Overflow | Nav Hidden |
| --- | --- | --- | --- |
| `Manager` | `Home`, `Process`, `New`, `Clients`, `Stats` | `Catalog`, `My Orders`, `Order Approval` | `login`, `new-order`, `order-details`, `customer-summary` |
| `User` | `Home`, `Process`, `New`, `My Orders`, `Clients` | `Catalog`, `Stats` only if the current role behavior already allows analytics access | `login`, `new-order`, `order-details`, `customer-summary` |

### Non-Negotiable UI Rules

- Remove repeated explanatory intro cards from list, queue, and detail screens.
- One dominant surface per screen. Do not stack card-inside-card layouts unless functionally required.
- Empty, loading, error, and no-results states are first-pass requirements.
- Use bottom sheets for overflow, search filters, and secondary pickers.
- Keep `bookings`, `dispatch_value`, `invoiced_value`, `collections_value`, and `ar_exposure` semantics untouched.
- Do not force `analytics`, `new-order`, `order-approval`, or `order-details` into one generic `OmaRecordCard` pattern.
- Charts remain straight, labeled, and practical. No decorative curved-line hero charts.

### Screen-Specific Boundaries

- `app/(app)/analytics.tsx` keeps its exception-first hierarchy and repository-backed analytics flow.
- `app/(app)/new-order.tsx` keeps its step logic, pickers, submission flow, and `orderSheetSerializer` contract.
- `app/(app)/process-orders.tsx` keeps its operational grouping, filter logic, and mutation behavior.
- `app/(app)/order-approval.tsx` keeps its approval-specific actions and business rules.
- `app/(app)/customer-summary.tsx` and `app/(app)/order-details.tsx` stay contextual screens, not global-nav destinations.

## Pre-Flight

- Read [2026-04-19-oma-ui-inspiration-design.md](/D:/dev/OMA/OMA-Order-Management-App/docs/plans/2026-04-19-oma-ui-inspiration-design.md) before changing any UI code.
- Use `@brainstorming` assumptions already captured in the inspiration note. Do not reopen design scope unless the business owner changes the brief.
- Create an isolated worktree with `@using-git-worktrees` before implementation.
- Capture a screenshot baseline for every file in `current-app-screenshots/` so visual regressions can be judged against a fixed before-state.
- Preserve route semantics in `app/(auth)` and `app/(app)`.
- Preserve API and storage behavior. This is a UI modernization lane, not a workflow rewrite.
- Because docs under `docs/plans/` are not currently visible through the code index, implementation may read those markdown files directly from disk when needed.

### Pre-Flight Commands

Run: `git rev-parse --show-toplevel`  
Expected: prints the repo root.

Run: `git worktree add ..\\OMA-Order-Management-App-ui-modernization -b feat/ui-modernization`  
Expected: creates a clean worktree for the redesign branch.

Run: `npm run lint`  
Expected: baseline lint output before UI changes.

Run: `Get-ChildItem .\\current-app-screenshots`  
Expected: confirms the baseline screenshot set that manual QA must match.

## Task 0: Capture Current-State Audit And Locked IA Decisions

**Files:**
- Create: `docs/plans/2026-04-19-oma-mobile-ui-audit.md`
- Read: `components/oma/OmaFloatingNav.tsx`
- Read: `app/_layout.tsx`
- Read: `context/ThemeContext.tsx`
- Read: `utils/typography.ts`
- Read: `app/(app)/main.tsx`
- Read: `app/(app)/analytics.tsx`
- Read: `app/(app)/customers.tsx`
- Read: `app/(app)/products.tsx`
- Read: `app/(app)/my-orders.tsx`
- Read: `app/(app)/order-approval.tsx`
- Read: `app/(app)/process-orders.tsx`
- Read: `app/(app)/new-order.tsx`
- Read: `app/(app)/customer-summary.tsx`
- Read: `app/(app)/order-details.tsx`
- Read: `app/(auth)/login.tsx`

**Step 1: Write the audit artifact**

Create `docs/plans/2026-04-19-oma-mobile-ui-audit.md` with these sections:

```md
# OMA Mobile UI Audit

## Existing Shared Pieces
- ThemeContext
- omaTypography
- OmaFloatingNav
- Root layout shell

## Repeated Route-Level Patterns
- topGlow
- headerShell
- introCard
- duplicated shadows

## Locked Nav Decisions
- Manager primary nav
- User primary nav
- Hidden-nav routes

## Screen Classes
- Command-center
- Utility list
- Decision and queue
- Focused and detail

## Protected Workflow Rules
- analytics semantics unchanged
- orderSheetSerializer unchanged
- route names unchanged
- storage keys unchanged
```

**Step 2: Populate the audit using current code and screenshots**

Record:
- the current six-item floating nav from `components/oma/OmaFloatingNav.tsx`
- the hardcoded shell behavior in `app/_layout.tsx`
- repeated route-local styling patterns called out in the inspiration note
- which screens are prototype-heavy versus already close to the target

**Step 3: Save the audit before any UI implementation**

Expected: the engineer can answer “what gets reused, what gets replaced, and what stays bespoke” without reopening design debate.

**Step 4: Commit**

```bash
git add docs/plans/2026-04-19-oma-mobile-ui-audit.md
git commit -m "docs: capture OMA UI audit and IA decisions"
```

## Task 1: Add A Real UI Test Harness Before Component Tests

**Files:**
- Create: `app/test-utils/renderWithAppProviders.tsx`
- Create: `app/test-utils/mockExpoRouter.ts`
- Create: `jest/setup-ui.ts`
- Create: `app/test-utils/__tests__/renderWithAppProviders.test.tsx`
- Modify: `package.json`

**Step 1: Write the failing test**

```tsx
import renderer from "react-test-renderer";
import { Text } from "react-native";
import { renderWithAppProviders } from "../renderWithAppProviders";

describe("renderWithAppProviders", () => {
  it("renders children inside theme, feedback, and safe-area providers", () => {
    const tree = renderer
      .create(renderWithAppProviders(<Text>Harness ready</Text>))
      .root;

    expect(tree.findByProps({ children: "Harness ready" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest app/test-utils/__tests__/renderWithAppProviders.test.tsx --runInBand`  
Expected: FAIL because `renderWithAppProviders` and the UI setup file do not exist yet.

**Step 3: Write minimal implementation**

```tsx
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "@/context/ThemeContext";
import { FeedbackProvider } from "@/context/FeedbackContext";

export function renderWithAppProviders(node: React.ReactElement) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FeedbackProvider>{node}</FeedbackProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

Add UI test support in `package.json` and `jest/setup-ui.ts` for:
- alias resolution for `@/`
- safe-area defaults
- `expo-router` mocks
- `react-native-reanimated` test-safe mocks

**Step 4: Run test to verify it passes**

Run: `npx jest app/test-utils/__tests__/renderWithAppProviders.test.tsx --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add app/test-utils/renderWithAppProviders.tsx app/test-utils/mockExpoRouter.ts app/test-utils/__tests__/renderWithAppProviders.test.tsx jest/setup-ui.ts package.json
git commit -m "test: add OMA UI render harness"
```

## Task 2: Pilot The Redesign On The Home Screen Only

**Files:**
- Create: `components/oma/home/OmaHomeHero.tsx`
- Create: `components/oma/home/OmaHomeSignals.tsx`
- Create: `components/oma/home/OmaHomeQueuePreview.tsx`
- Create: `components/oma/home/OmaHomeRecentMovement.tsx`
- Create: `components/oma/home/__tests__/OmaHomeHero.test.tsx`
- Modify: `app/(app)/main.tsx`

**Step 1: Write the failing test**

```tsx
import renderer from "react-test-renderer";
import OmaHomeHero from "../OmaHomeHero";

describe("OmaHomeHero", () => {
  it("renders one high-priority command-center summary", () => {
    const tree = renderer.create(
      <OmaHomeHero
        label="Bookings at risk"
        value="Rs 24,09,000"
        delta="1 approval blocking dispatch"
        stats={[
          { label: "Dispatch", value: "95%" },
          { label: "Customers", value: "34" },
          { label: "Open pipeline", value: "Rs 50,01,035" },
        ]}
      />
    ).root;

    expect(tree.findByProps({ children: "Bookings at risk" })).toBeTruthy();
    expect(tree.findByProps({ children: "Rs 24,09,000" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/home/__tests__/OmaHomeHero.test.tsx --runInBand`  
Expected: FAIL with `Cannot find module '../OmaHomeHero'`.

**Step 3: Write minimal implementation**

```tsx
import { Text, View } from "react-native";

export default function OmaHomeHero(props: {
  label: string;
  value: string;
  delta: string;
  stats: { label: string; value: string }[];
}) {
  return (
    <View>
      <Text>{props.label}</Text>
      <Text>{props.value}</Text>
    </View>
  );
}
```

Then implement the real pilot in `app/(app)/main.tsx` using the existing `ThemeContext` plus local home-only constants:
- one dominant hero
- max three support signals
- one queue preview section
- one recent movement section
- fewer quick actions
- no repeated intro card
- dark graphite shell with electric-blue emphasis

Do **not** extract a global design system yet. Only prove the direction on the home screen.

**Step 4: Run test to verify it passes**

Run: `npx jest components/oma/home/__tests__/OmaHomeHero.test.tsx --runInBand`  
Expected: PASS.

**Step 5: Manual pilot check**

Confirm against [2026-04-19-oma-ui-inspiration-design.md](/D:/dev/OMA/OMA-Order-Management-App/docs/plans/2026-04-19-oma-ui-inspiration-design.md):
- one hero only
- no decorative background circles
- no more than three signal cards
- queue content appears before generic utility cards

**Step 6: Commit**

```bash
git add components/oma/home/OmaHomeHero.tsx components/oma/home/OmaHomeSignals.tsx components/oma/home/OmaHomeQueuePreview.tsx components/oma/home/OmaHomeRecentMovement.tsx components/oma/home/__tests__/OmaHomeHero.test.tsx app/(app)/main.tsx
git commit -m "feat: pilot OMA command-center home redesign"
```

## Task 3: Extract Only The Proven Design Contract From The Home Pilot

**Files:**
- Create: `utils/omaDesignTokens.ts`
- Create: `components/oma/OmaScreen.tsx`
- Create: `components/oma/OmaHeroCard.tsx`
- Create: `components/oma/OmaSectionBlock.tsx`
- Create: `utils/__tests__/omaDesignTokens.test.ts`
- Create: `components/oma/__tests__/OmaHeroCard.test.tsx`
- Modify: `context/ThemeContext.tsx`
- Modify: `utils/typography.ts`

**Step 1: Write the failing token test**

```ts
import { omaDesignTokens } from "../omaDesignTokens";

describe("omaDesignTokens", () => {
  it("exports only the proven mobile contract", () => {
    expect(omaDesignTokens.radius.hero).toBeGreaterThan(0);
    expect(omaDesignTokens.nav.maxPrimaryItems).toBe(5);
    expect(omaDesignTokens.screen.commandCenter.heroMaxSignals).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest utils/__tests__/omaDesignTokens.test.ts --runInBand`  
Expected: FAIL with `Cannot find module '../omaDesignTokens'`.

**Step 3: Write minimal implementation**

```ts
export const omaDesignTokens = {
  nav: { maxPrimaryItems: 5 },
  radius: { hero: 28, card: 24 },
  screen: {
    commandCenter: { heroMaxSignals: 3 },
  },
} as const;
```

Then implement the real extraction:
- move proven spacing, radii, and type rhythm into `utils/omaDesignTokens.ts`
- extend `ThemeContext` with richer surface and semantic values
- expand `utils/typography.ts` beyond font-family aliases
- make `OmaScreen` accept optional top-atmosphere behavior instead of forcing one `topGlow` pattern everywhere

**Step 4: Run the token and hero tests**

Run: `npx jest utils/__tests__/omaDesignTokens.test.ts --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/__tests__/OmaHeroCard.test.tsx --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add utils/omaDesignTokens.ts utils/__tests__/omaDesignTokens.test.ts context/ThemeContext.tsx utils/typography.ts components/oma/OmaScreen.tsx components/oma/OmaHeroCard.tsx components/oma/OmaSectionBlock.tsx components/oma/__tests__/OmaHeroCard.test.tsx
git commit -m "feat: extract proven OMA mobile design contract"
```

## Task 4: Build Shared States And Interaction Primitives Early

**Files:**
- Create: `components/oma/OmaStateView.tsx`
- Create: `components/oma/OmaBottomSheet.tsx`
- Create: `components/oma/OmaOverflowSheet.tsx`
- Create: `components/oma/__tests__/OmaStateView.test.tsx`
- Create: `components/oma/__tests__/OmaBottomSheet.test.tsx`

**Step 1: Write the failing state test**

```tsx
import renderer from "react-test-renderer";
import OmaStateView from "../OmaStateView";

describe("OmaStateView", () => {
  it("renders a no-results state with a primary action", () => {
    const tree = renderer.create(
      <OmaStateView
        title="No matching customers"
        message="Try a broader search or clear filters."
        actionLabel="Clear filters"
        onAction={() => {}}
      />
    ).root;

    expect(tree.findByProps({ children: "No matching customers" })).toBeTruthy();
    expect(tree.findByProps({ children: "Clear filters" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/__tests__/OmaStateView.test.tsx --runInBand`  
Expected: FAIL because `OmaStateView` does not exist.

**Step 3: Write minimal implementation**

```tsx
import { Pressable, Text, View } from "react-native";

export default function OmaStateView(props: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View>
      <Text>{props.title}</Text>
      <Text>{props.message}</Text>
      {props.actionLabel ? <Pressable onPress={props.onAction}><Text>{props.actionLabel}</Text></Pressable> : null}
    </View>
  );
}
```

Then implement the real interaction layer:
- `OmaStateView` handles empty, loading, error, and no-results states
- `OmaBottomSheet` supports safe-area padding and focus-preserving secondary actions
- `OmaOverflowSheet` supports contextual actions and filter overflow

**Step 4: Run state and sheet tests**

Run: `npx jest components/oma/__tests__/OmaStateView.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/__tests__/OmaBottomSheet.test.tsx --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/oma/OmaStateView.tsx components/oma/OmaBottomSheet.tsx components/oma/OmaOverflowSheet.tsx components/oma/__tests__/OmaStateView.test.tsx components/oma/__tests__/OmaBottomSheet.test.tsx
git commit -m "feat: add shared OMA interaction and state primitives"
```

## Task 5: Implement Role-Aware Navigation And Root Shell Rules

**Files:**
- Create: `components/oma/OmaNavConfig.ts`
- Create: `components/oma/__tests__/OmaNavConfig.test.ts`
- Modify: `components/oma/OmaFloatingNav.tsx`
- Modify: `app/_layout.tsx`

**Step 1: Write the failing nav-config test**

```ts
import { getNavModel } from "../OmaNavConfig";

describe("getNavModel", () => {
  it("returns a five-item manager nav and hides focused detail routes", () => {
    const model = getNavModel({
      role: "Manager",
      leafSegment: "main",
    });

    expect(model.primary.map((item) => item.label)).toEqual([
      "Home",
      "Process",
      "New",
      "Clients",
      "Stats",
    ]);
    expect(model.hidden).toContain("order-details");
    expect(model.overflow.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/__tests__/OmaNavConfig.test.ts --runInBand`  
Expected: FAIL because `getNavModel` does not exist.

**Step 3: Write minimal implementation**

```ts
export function getNavModel() {
  return {
    primary: [],
    overflow: [],
    hidden: [],
  };
}
```

Then implement the real version:
- primary and overflow items are role-aware
- `new-order`, `order-details`, `customer-summary`, and `login` hide floating nav
- `app/_layout.tsx` stops hardcoding shell atmosphere and nav padding assumptions
- `components/oma/OmaFloatingNav.tsx` consumes nav config instead of a single static six-item array

Do not create a new auth provider for this. Use the existing persisted `userRole` behavior directly and conservatively.

**Step 4: Run test to verify it passes**

Run: `npx jest components/oma/__tests__/OmaNavConfig.test.ts --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/oma/OmaNavConfig.ts components/oma/__tests__/OmaNavConfig.test.ts components/oma/OmaFloatingNav.tsx app/_layout.tsx
git commit -m "feat: add role-aware OMA navigation model"
```

## Task 6: Modernize Login Early

**Files:**
- Create: `components/oma/auth/OmaAuthShell.tsx`
- Create: `components/oma/auth/__tests__/OmaAuthShell.test.tsx`
- Modify: `app/(auth)/login.tsx`

**Step 1: Write the failing test**

```tsx
import renderer from "react-test-renderer";
import OmaAuthShell from "../OmaAuthShell";

describe("OmaAuthShell", () => {
  it("renders title, subtitle, and action slot", () => {
    const tree = renderer.create(
      <OmaAuthShell title="Welcome back" subtitle="Track orders without the concept-card feel." />
    ).root;

    expect(tree.findByProps({ children: "Welcome back" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/auth/__tests__/OmaAuthShell.test.tsx --runInBand`  
Expected: FAIL because `OmaAuthShell` does not exist.

**Step 3: Write minimal implementation**

```tsx
import { Text, View } from "react-native";

export default function OmaAuthShell(props: { title: string; subtitle: string }) {
  return (
    <View>
      <Text>{props.title}</Text>
      <Text>{props.subtitle}</Text>
    </View>
  );
}
```

Then implement the real login modernization:
- remove the redesign-announcement tone
- reduce explanatory copy
- keep existing credentials and storage writes intact
- align the auth screen with the new visual system without changing the login flow

**Step 4: Run test to verify it passes**

Run: `npx jest components/oma/auth/__tests__/OmaAuthShell.test.tsx --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/oma/auth/OmaAuthShell.tsx components/oma/auth/__tests__/OmaAuthShell.test.tsx app/(auth)/login.tsx
git commit -m "feat: modernize OMA login shell"
```

## Task 7: Align Analytics With The Command-Center Language Without Breaking Semantics

**Files:**
- Create: `components/oma/analytics/OmaAnalyticsHero.tsx`
- Create: `components/oma/analytics/__tests__/OmaAnalyticsHero.test.tsx`
- Modify: `app/(app)/analytics.tsx`

**Step 1: Write the failing test**

```tsx
import renderer from "react-test-renderer";
import OmaAnalyticsHero from "../OmaAnalyticsHero";

describe("OmaAnalyticsHero", () => {
  it("renders attention-first analytics framing", () => {
    const tree = renderer.create(
      <OmaAnalyticsHero
        title="Revenue at risk"
        value="Rs 24,09,000"
        sections={["Attention queue", "Recent movement"]}
      />
    ).root;

    expect(tree.findByProps({ children: "Revenue at risk" })).toBeTruthy();
    expect(tree.findByProps({ children: "Attention queue" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/analytics/__tests__/OmaAnalyticsHero.test.tsx --runInBand`  
Expected: FAIL because `OmaAnalyticsHero` does not exist.

**Step 3: Write minimal implementation**

```tsx
import { Text, View } from "react-native";

export default function OmaAnalyticsHero(props: {
  title: string;
  value: string;
  sections: string[];
}) {
  return (
    <View>
      <Text>{props.title}</Text>
      <Text>{props.value}</Text>
      {props.sections.map((section) => (
        <Text key={section}>{section}</Text>
      ))}
    </View>
  );
}
```

Then implement the real analytics pass:
- preserve repository-backed analytics flow
- preserve exception-first hierarchy
- keep raw fallback behavior during rollout
- restyle sections without changing manager analytics semantics

**Step 4: Run test and focused analytics suites**

Run: `npx jest components/oma/analytics/__tests__/OmaAnalyticsHero.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest utils/__tests__/commandCenterRepository.test.ts --runInBand`  
Expected: PASS.

Run: `npx jest utils/__tests__/commandCenterTransforms.test.ts --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/oma/analytics/OmaAnalyticsHero.tsx components/oma/analytics/__tests__/OmaAnalyticsHero.test.tsx app/(app)/analytics.tsx
git commit -m "feat: align analytics with OMA command-center design"
```

## Task 8: Make Customers And Products Search-First

**Files:**
- Create: `components/oma/list/OmaSearchField.tsx`
- Create: `components/oma/list/OmaFilterChipRow.tsx`
- Create: `components/oma/list/__tests__/OmaFilterChipRow.test.tsx`
- Modify: `app/(app)/customers.tsx`
- Modify: `app/(app)/products.tsx`

**Step 1: Write the failing test**

```tsx
import renderer from "react-test-renderer";
import OmaFilterChipRow from "../OmaFilterChipRow";

describe("OmaFilterChipRow", () => {
  it("renders filters with labels and counts", () => {
    const tree = renderer.create(
      <OmaFilterChipRow
        options={[
          { id: "all", label: "All", count: 30 },
          { id: "outstanding", label: "Outstanding", count: 12 },
        ]}
        activeId="all"
        onChange={() => {}}
      />
    ).root;

    expect(tree.findByProps({ children: "All" })).toBeTruthy();
    expect(tree.findByProps({ children: "Outstanding" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/list/__tests__/OmaFilterChipRow.test.tsx --runInBand`  
Expected: FAIL because the list primitives do not exist.

**Step 3: Write minimal implementation**

```tsx
import { View } from "react-native";

export default function OmaFilterChipRow() {
  return <View />;
}
```

Then implement the real migration:
- search and filters appear before dense content
- intro blocks are removed
- customers and products share only the search/filter rhythm, not one oversized generic hero
- current sort, search, and modal behavior stays intact

**Step 4: Run test to verify it passes**

Run: `npx jest components/oma/list/__tests__/OmaFilterChipRow.test.tsx --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/oma/list/OmaSearchField.tsx components/oma/list/OmaFilterChipRow.tsx components/oma/list/__tests__/OmaFilterChipRow.test.tsx app/(app)/customers.tsx app/(app)/products.tsx
git commit -m "feat: make OMA list screens search-first"
```

## Task 9: Raise The Stakes On Queue And Approval Screens

**Files:**
- Create: `components/oma/OmaStatusPill.tsx`
- Create: `components/oma/__tests__/OmaStatusPill.test.tsx`
- Modify: `app/(app)/my-orders.tsx`
- Modify: `app/(app)/process-orders.tsx`
- Modify: `app/(app)/order-approval.tsx`

**Step 1: Write the failing test**

```tsx
import renderer from "react-test-renderer";
import OmaStatusPill from "../OmaStatusPill";

describe("OmaStatusPill", () => {
  it("renders a semantic label", () => {
    const tree = renderer.create(
      <OmaStatusPill label="Awaiting approval" tone="warning" />
    ).root;

    expect(tree.findByProps({ children: "Awaiting approval" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/__tests__/OmaStatusPill.test.tsx --runInBand`  
Expected: FAIL because `OmaStatusPill` does not exist.

**Step 3: Write minimal implementation**

```tsx
import { Text } from "react-native";

export default function OmaStatusPill(props: { label: string }) {
  return <Text>{props.label}</Text>;
}
```

Then implement the real queue pass:
- `my-orders` becomes clearer as queue plus history
- `process-orders` reads like an operational console, not a soft list
- `order-approval` feels higher-stakes and more decision-led
- keep current filters, sorting, grouping, and mutations intact

**Step 4: Run test to verify it passes**

Run: `npx jest components/oma/__tests__/OmaStatusPill.test.tsx --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/oma/OmaStatusPill.tsx components/oma/__tests__/OmaStatusPill.test.tsx app/(app)/my-orders.tsx app/(app)/process-orders.tsx app/(app)/order-approval.tsx
git commit -m "feat: raise hierarchy on OMA queue screens"
```

## Task 10: Modernize Detail Screens Without Turning Them Into Dashboards

**Files:**
- Create: `components/oma/detail/OmaTimelineSection.tsx`
- Create: `components/oma/detail/__tests__/OmaTimelineSection.test.tsx`
- Modify: `app/(app)/customer-summary.tsx`
- Modify: `app/(app)/order-details.tsx`

**Step 1: Write the failing test**

```tsx
import renderer from "react-test-renderer";
import OmaTimelineSection from "../OmaTimelineSection";

describe("OmaTimelineSection", () => {
  it("renders ordered events", () => {
    const tree = renderer.create(
      <OmaTimelineSection
        title="Recent movement"
        events={[
          { id: "1", label: "Order created", detail: "18 Apr 2026" },
        ]}
      />
    ).root;

    expect(tree.findByProps({ children: "Recent movement" })).toBeTruthy();
    expect(tree.findByProps({ children: "Order created" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/detail/__tests__/OmaTimelineSection.test.tsx --runInBand`  
Expected: FAIL because the timeline primitive does not exist.

**Step 3: Write minimal implementation**

```tsx
import { Text, View } from "react-native";

export default function OmaTimelineSection(props: {
  title: string;
  events: { id: string; label: string; detail: string }[];
}) {
  return (
    <View>
      <Text>{props.title}</Text>
      {props.events.map((event) => (
        <Text key={event.id}>{event.label}</Text>
      ))}
    </View>
  );
}
```

Then implement the real detail pass:
- `customer-summary` becomes denser and less explanatory
- `order-details` becomes more timeline-led and status-led
- both remain contextual screens with hidden floating nav
- lookup, ledger, and order details behavior remains intact

**Step 4: Run test to verify it passes**

Run: `npx jest components/oma/detail/__tests__/OmaTimelineSection.test.tsx --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/oma/detail/OmaTimelineSection.tsx components/oma/detail/__tests__/OmaTimelineSection.test.tsx app/(app)/customer-summary.tsx app/(app)/order-details.tsx
git commit -m "feat: modernize OMA detail screens"
```

## Task 11: Modernize New Order In Its Own Risk Lane

**Files:**
- Create: `components/oma/order/OmaSelectionSheet.tsx`
- Create: `components/oma/order/__tests__/OmaSelectionSheet.test.tsx`
- Modify: `app/(app)/new-order.tsx`

**Step 1: Write the failing test**

```tsx
import renderer from "react-test-renderer";
import OmaSelectionSheet from "../OmaSelectionSheet";

describe("OmaSelectionSheet", () => {
  it("renders title and options", () => {
    const tree = renderer.create(
      <OmaSelectionSheet
        title="Select customer"
        options={[{ id: "1", label: "Flipkart Sellers" }]}
        onSelect={() => {}}
      />
    ).root;

    expect(tree.findByProps({ children: "Select customer" })).toBeTruthy();
    expect(tree.findByProps({ children: "Flipkart Sellers" })).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest components/oma/order/__tests__/OmaSelectionSheet.test.tsx --runInBand`  
Expected: FAIL because the extracted selection surface does not exist.

**Step 3: Write minimal implementation**

```tsx
import { Text, View } from "react-native";

export default function OmaSelectionSheet(props: {
  title: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <View>
      <Text>{props.title}</Text>
      {props.options.map((option) => (
        <Text key={option.id}>{option.label}</Text>
      ))}
    </View>
  );
}
```

Then implement the real focused-flow pass:
- use contextual sheets for secondary pickers
- keep step logic, order validation, submission path, and serializer behavior intact
- keep nav hidden during the stepper flow
- do not change endpoint behavior or workbook write semantics

**Step 4: Run test and serializer suite**

Run: `npx jest components/oma/order/__tests__/OmaSelectionSheet.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest utils/__tests__/orderSheetSerializer.test.ts --runInBand`  
Expected: PASS.

**Step 5: Commit**

```bash
git add components/oma/order/OmaSelectionSheet.tsx components/oma/order/__tests__/OmaSelectionSheet.test.tsx app/(app)/new-order.tsx
git commit -m "feat: modernize OMA new-order flow in isolation"
```

## Final Verification

Run: `npx jest app/test-utils/__tests__/renderWithAppProviders.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/home/__tests__/OmaHomeHero.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest utils/__tests__/omaDesignTokens.test.ts --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/__tests__/OmaStateView.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/__tests__/OmaNavConfig.test.ts --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/auth/__tests__/OmaAuthShell.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/analytics/__tests__/OmaAnalyticsHero.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/list/__tests__/OmaFilterChipRow.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/__tests__/OmaStatusPill.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/detail/__tests__/OmaTimelineSection.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest components/oma/order/__tests__/OmaSelectionSheet.test.tsx --runInBand`  
Expected: PASS.

Run: `npx jest utils/__tests__/commandCenterRepository.test.ts --runInBand`  
Expected: PASS.

Run: `npx jest utils/__tests__/commandCenterTransforms.test.ts --runInBand`  
Expected: PASS.

Run: `npx jest utils/__tests__/orderSheetSerializer.test.ts --runInBand`  
Expected: PASS.

Run: `npm run lint`  
Expected: PASS.

Run: `npm run dev -- --port 3035`  
Expected: the redesigned routes load without runtime errors on Expo web.

## Manual QA Checklist

- Verify [02-main.png](/D:/dev/OMA/OMA-Order-Management-App/current-app-screenshots/02-main.png) now reads as a command center within five seconds.
- Verify manager nav shows `Home`, `Process`, `New`, `Clients`, and `Stats`, with overflow for the rest.
- Verify user nav shows `Home`, `Process`, `New`, `My Orders`, and `Clients`, with overflow for the rest.
- Verify floating nav is hidden on `login`, `new-order`, `order-details`, and `customer-summary`.
- Verify customers and products open directly into searchable content instead of long intro cards.
- Verify process-orders and order-approval feel materially higher-stakes than before.
- Verify `new-order` keeps the same submission behavior and workbook writes.
- Verify analytics still reads as attention-first and still uses the repository-backed data path.
- Verify login still writes `userRole`, `username`, `lastLogin`, and `cachedUsername`.
- Verify one Android phone-sized viewport and one iPhone-sized viewport.
- Verify keyboard overlap, long-list scroll behavior, bottom-sheet open/close, empty states, and no-results states.
- Verify both light and dark themes look intentional, not mirrored inversions.

Plan complete and saved to `docs/plans/2026-04-19-oma-mobile-ui-modernization.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration

2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
