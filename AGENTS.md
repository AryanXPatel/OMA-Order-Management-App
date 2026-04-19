# AGENTS.md

## Scope
These instructions apply to the entire repository rooted at `D:\dev\OMA\OMA-Order-Management-App`.

## Mission
This repo is the Expo Router frontend for OMA, an order management app used by sales teams. It talks to the OMA demo backend and Google Sheets-backed data flows. Preserve the current app behavior unless the task explicitly asks for workflow changes.

## Required Exploration Workflow
Use `jCodemunch-MCP` for code exploration whenever it is available.

1. Call `resolve_repo` with the current directory first.
2. If the repo is not indexed, call `index_folder`.
3. Before exploring structure, use `get_repo_outline` or `get_file_tree`.
4. Before searching, use `search_symbols` or `search_text`.
5. Before reading a file, use `get_file_outline` or `get_file_content`.

Do not default to shell-based search when `jCodemunch-MCP` is available.

If `jCodemunch-MCP` is unavailable in the current session, say so explicitly, then use the least invasive fallback needed to complete the task.

## Skills
Before starting a task, check whether an installed skill fits the task and use it when appropriate.

## Project Snapshot
- Framework: Expo SDK 52 with Expo Router
- Language: TypeScript-first, with a few existing `.js` utility files
- Targets: Android, iOS, and web
- Backend: `https://oma-demo-server.onrender.com`
- Auth model: local demo login persisted in `AsyncStorage`
- State model: React Context plus screen-local state

## Important Commands
- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Start on a custom port: `npm run dev -- --port 3035`
- Start web: `npm run web`
- Start Android: `npm run android`
- Start iOS: `npm run ios`
- Lint: `npm run lint`
- Expo health check: `npx expo-doctor`
- Expo dependency check: `npx expo install --check`

There is no general `build` script in `package.json`. Do not invent one. If the task is about production builds, use Expo or EAS commands intentionally.

## Directory Map
- `app/_layout.tsx`: app providers and root navigation shell
- `app/index.tsx`: login gate and initial redirect
- `app/(auth)/login.tsx`: login flow
- `app/(app)/*`: authenticated app screens
- `app/components/*`: reusable UI pieces
- `app/context/*`: shared providers such as theme and feedback
- `app/utils/*`: API, caching, responsive, and config helpers
- `docs/analytics/*`: owner command center research, workbook spec, and implementation status
- `assets/*`: fonts, icons, images, and some legacy files
- `app.json`: Expo config
- `eas.json`: EAS build profiles
- `dist/`: generated web output, not primary source

## Routing And Navigation Rules
- This app uses Expo Router file-based routing. Preserve route-group semantics in `app/(auth)` and `app/(app)`.
- Prefer navigation through `expo-router` APIs already used in the codebase.
- Do not rename route files casually. Route file names are part of the app contract.
- If you add a screen, place it in the route group that matches its auth requirements.

## Shared State And UX Rules
- `ThemeProvider` and `FeedbackProvider` are mounted in `app/_layout.tsx`. Reuse them instead of creating parallel global state.
- Prefer `ThemeContext` colors over hardcoding new theme systems.
- Prefer `useFeedback()` for user-facing success and error feedback instead of raw alerts when practical.
- Keep changes responsive across phone, tablet, and web. Existing code uses `responsive.js`, `Dimensions`, and `Platform` guards.

## Data And API Rules
- Central backend constant: `app/utils/apiManager.ts` exports `BACKEND_URL`.
- Prefer shared API utilities such as `fetchWithRetry`, `wakeUpServer`, `preloadData`, `apiCache`, and `webFetchWithRetry`.
- Avoid scattering new hardcoded backend URLs. If a new endpoint is needed, build it from `BACKEND_URL`.
- Preserve existing retry, warm-up, and cache behavior unless the task is explicitly about changing it.
- Web requests may use the web proxy logic in `app/utils/webApiManager.ts`. Do not break web behavior when editing API calls.
- Local development now prefers a local backend automatically in `__DEV__`:
  - `http://localhost:3000` for web / iOS simulator
  - `http://10.0.2.2:3000` for Android emulator
  - `EXPO_PUBLIC_BACKEND_URL` overrides both when set
- Before assuming a backend bug on analytics work, verify whether the app is pointed at local or remote backend.

## Owner Analytics Architecture
- The owner command center is an exception-first analytics surface for manager/business-owner decisions. Prefer surfacing revenue at risk, queue pressure, concentration risk, and collections pressure over decorative KPI walls.
- Current analytics foundations live in:
  - `app/(app)/analytics.tsx`
  - `utils/managerAnalytics.ts`
  - `utils/sheetContracts.ts`
  - `utils/fetchSheetObjects.ts`
  - `utils/orderSheetSerializer.ts`
  - `utils/commandCenterTransforms.ts`
- Treat `New_Order_Table`, `Customer_Master`, `Product_Master`, and `Customer_Ledger_2` as operational/raw tabs. Raw tab changes must be append-only to the right. Do not insert columns in the middle of the currently used ranges.
- Prefer header-based parsing for analytics-related reads. Do not add new positional analytics parsing if `fetchSheetObjects` can be used instead.
- The first derived analytics tabs for the command center are:
  - `Order_Header_Fact`
  - `Customer_Account_Snapshot`
  - `Analytics_KPI_Daily`
- Planned later derived tabs include:
  - `AR_Open_Items_Fact`
  - `Rep_Performance_Daily`
  - `Product_Group_Daily`
  - `Source_Channel_Daily`
  - `Attention_Queue_Snapshot`
  - `Targets`
- Current repository-backed command center path now exists in:
  - `utils/commandCenterRepository.ts`
  - `utils/commandCenterTransforms.ts`
  - `utils/managerAnalytics.ts`
  - `app/(app)/analytics.tsx`
- `app/(app)/analytics.tsx` should prefer the repository/derived-tab path but keep a controlled raw fallback during rollout.
- `Attention_Queue_Snapshot` and `Targets` are now valid backend-facing tabs and should be treated as first-class data inputs, not ad hoc additions.
- Business definitions to keep consistent:
  - `bookings`: order amount at order create time
  - `dispatch_value`: value of dispatched lines/orders
  - `invoiced_value`: invoice-linked value
  - `collections_value`: received cash / receipt-side collections
  - `ar_exposure`: outstanding open receivables only
- When editing approval or dispatch flows, preserve the legacy `M:Q` updates in `New_Order_Table` and layer normalized append-only updates through `utils/orderSheetSerializer.ts`.
- If analytics numbers appear inconsistent, validate whether the issue is from `Customer_Ledger` vs `Customer_Ledger_2` semantics before changing UI logic.

## Sheet Snapshots
- The local `Sheets/` folder contains CSV snapshots used as workbook references during migration planning.
- Treat `Sheets/` as local reference material, not the source of truth for runtime behavior.
- Do not commit `Sheets/` contents unless the task explicitly asks for repository-tracked workbook fixtures.

## Persistence Rules
Current `AsyncStorage` keys include:
- `userRole`
- `username`
- `lastLogin`
- `cachedUsername`
- `apiCache`

If you change persistence behavior, update reads and writes consistently across the app.

## Domain Notes
- Current user roles are `Manager` and `User`.
- Login credentials are hardcoded demo credentials in `app/(auth)/login.tsx`.
- Core workflows include new order creation, approval, dispatch, customer lookup, and dashboard stats.
- The app assumes the backend may be cold on first use and warms it up proactively.

## Editing Rules
- Make focused changes. Avoid unrelated formatting churn.
- Follow the file's existing language and style unless the task justifies a local cleanup.
- Prefer TypeScript for new app code.
- Keep browser-only APIs behind `Platform.OS === "web"` guards.
- Do not hand-edit generated output in `dist/` unless the task is explicitly about generated web artifacts.
- Treat `assets/BACKUPlogin.tsx` and `app/(app)/neworder.txt` as legacy artifacts unless the task clearly targets them.

## Dependency Rules
- This repo currently passes `npx expo-doctor` on Expo SDK 52. Keep it that way.
- Do not run `npm audit fix --force` or bump Expo SDK versions casually. That is a breaking change lane.
- If you change dependencies, rerun `npm install`, `npx expo install --check`, and `npx expo-doctor`.
- Use Expo-compatible versions for Expo-managed packages.

## Validation Expectations
Pick the smallest relevant checks for the task, then report what you ran.

Typical checks:
- `npm run lint`
- `npx expo-doctor`
- `npm run dev -- --port 3035`

For dependency work:
- `npm install`
- `npx expo install --check`
- `npx expo-doctor`

For navigation or API work:
- verify affected routes, storage keys, and API helper usage

For owner analytics work:
- verify the local or deployed server route `POST /api/analytics/rebuild`
- verify the local or deployed server route `POST /api/sheets/batch-update`
- run the focused Jest suites under `utils/__tests__/`

## Known Repo Realities
- README version badges and some docs are older than the current installed Expo stack.
- Some code mixes TypeScript and JavaScript and includes inline styles. Do not assume the codebase is fully normalized.
- The backend is external to this repo. Frontend fixes should not silently assume backend contract changes.
- Remaining `npm audit` findings are largely tied to the Expo 52 toolchain and are not safe to clear with force-upgrades during routine tasks.

## Preferred Agent Output
When finishing work in this repo:
- name the files changed
- state the commands run
- mention any checks you could not run
- call out any remaining risk, especially around Expo compatibility or backend assumptions
