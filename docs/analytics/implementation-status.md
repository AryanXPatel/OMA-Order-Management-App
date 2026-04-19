# Owner Command Center Implementation Status

## Current State
The frontend has completed the migration foundation and the first transform layer. The actual repository-backed command center and server-generated derived tabs are not finished yet.

## Implemented In This Repo

### 1. Sheet Contracts
- Added [sheetContracts.ts](/D:/dev/OMA/OMA-Order-Management-App/utils/sheetContracts.ts)
- Added [sheetContracts.test.ts](/D:/dev/OMA/OMA-Order-Management-App/utils/__tests__/sheetContracts.test.ts)

What it does:
- defines canonical analytics tab/header contracts
- validates headers
- guards against schema drift

### 2. Header-Based Row Mapping
- Added [fetchSheetObjects.ts](/D:/dev/OMA/OMA-Order-Management-App/utils/fetchSheetObjects.ts)
- Added [fetchSheetObjects.test.ts](/D:/dev/OMA/OMA-Order-Management-App/utils/__tests__/fetchSheetObjects.test.ts)

What it does:
- turns sheet `values` arrays into header-keyed objects
- starts moving analytics code away from positional parsing

### 3. Append-Only Raw Order Serializer
- Added [orderSheetSerializer.ts](/D:/dev/OMA/OMA-Order-Management-App/utils/orderSheetSerializer.ts)
- Added [orderSheetSerializer.test.ts](/D:/dev/OMA/OMA-Order-Management-App/utils/__tests__/orderSheetSerializer.test.ts)

What it does:
- preserves current `New_Order_Table` legacy write shape
- appends normalized analytics-safe fields on the right
- centralizes approval/rejection/dispatch normalized update ranges

### 4. Lifecycle Write Support
- Updated [new-order.tsx](/D:/dev/OMA/OMA-Order-Management-App/app/(app)/new-order.tsx)
- Updated [order-approval.tsx](/D:/dev/OMA/OMA-Order-Management-App/app/(app)/order-approval.tsx)
- Updated [process-orders.tsx](/D:/dev/OMA/OMA-Order-Management-App/app/(app)/process-orders.tsx)

What it does:
- new orders now serialize through the append-only writer
- approval and rejection still write legacy `M:N`, but also write normalized append-only fields
- dispatch still writes legacy `O/P/Q`, but also writes normalized append-only fields

### 5. Derived Transform Layer
- Added [commandCenterTransforms.ts](/D:/dev/OMA/OMA-Order-Management-App/utils/commandCenterTransforms.ts)
- Added [commandCenterTransforms.test.ts](/D:/dev/OMA/OMA-Order-Management-App/utils/__tests__/commandCenterTransforms.test.ts)

What it does:
- builds `Order_Header_Fact` rows
- builds `Customer_Account_Snapshot` rows
- builds `Analytics_KPI_Daily` rows
- reuses current `managerAnalytics` summary and financial semantics

## Checks Run
- `.\node_modules\.bin\jest.cmd --runTestsByPath utils/__tests__/sheetContracts.test.ts utils/__tests__/fetchSheetObjects.test.ts utils/__tests__/orderSheetSerializer.test.ts utils/__tests__/commandCenterTransforms.test.ts --runInBand`
- `npm run lint`
- `npx expo-doctor`

## Check Results
- Focused Jest suites: pass
- `expo-doctor`: pass
- `npm run lint`: pass with pre-existing warnings outside the touched files

## Not Implemented Yet
- command-center repository layer
- analytics screen migration to derived tab readers
- unified ledger/open-item A/R semantics
- targets / plan-vs-actual
- attention queue snapshot
- server-side tab generation and API support

## Immediate Next Step
After the Google Sheets tabs/columns exist, switch to:
- `D:\\dev\\OMA\\OMA-DEMO-Server`

Server tasks will likely include:
- raw-sheet append-only write support validation
- derived tab generation
- header-safe sheet APIs
- canonical ledger/open-item handling

## Notes
- The local `Sheets/` CSV files are reference snapshots only.
- They are not committed as runtime fixtures.
- The frontend is ready for the next phase, but the real command-center cutover depends on server and workbook support.
