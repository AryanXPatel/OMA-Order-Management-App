# Owner Command Center Google Sheets Workbook Spec

## Goal
Define the workbook structure needed to support the owner command center without breaking the current OMA operational flows.

## Migration Rule
- Existing operational tabs remain the write path.
- Raw tab schema changes are append-only to the right.
- New command-center tabs are read-optimized derived tabs.

## Existing Operational Tabs
- `New_Order_Table`
- `Customer_Master`
- `Product_Master`
- `Customer_Ledger_2`

## Raw Tab Append-Only Columns

### `New_Order_Table`
Append these columns after the current `A:Q` block:

1. `order_line_id`
2. `order_created_at_iso`
3. `customer_code_snapshot`
4. `product_code_snapshot`
5. `product_group_snapshot`
6. `source_channel_norm`
7. `approval_status_norm`
8. `dispatch_status_norm`
9. `approval_at_iso`
10. `dispatch_at_iso`
11. `last_status_at_iso`
12. `promised_dispatch_date_iso`
13. `due_date_iso`
14. `invoice_no`
15. `invoice_date_iso`
16. `invoice_amount`
17. `cancelled_at_iso`
18. `cancel_reason_code`

Notes:
- Current app-side write support for these append-only fields is already scaffolded in the frontend.
- Do not insert these into the middle of the current sheet.

### `Customer_Master`
Recommended append-only fields:

1. `customer_status`
2. `sales_owner`
3. `collector_owner`
4. `zone`
5. `city`
6. `state`
7. `industry`
8. `channel`
9. `payment_terms_days`
10. `credit_limit`
11. `risk_tier`

### `Product_Master`
Recommended append-only fields:

1. `product_status`
2. `product_group_norm`
3. `brand`
4. `subcategory`
5. `standard_cost`
6. `margin_pct`
7. `uom`

### `Customer_Ledger_2`
Recommended append-only fields:

1. `txn_id`
2. `txn_date_iso`
3. `voucher_type_norm`
4. `signed_amount`
5. `due_date_iso`
6. `open_amount`
7. `collector_owner`
8. `risk_tier`

## Phase 1 Derived Tabs

### `Order_Header_Fact`
One row per `order_id`.

Suggested columns:
- `order_id`
- `customer_name`
- `customer_code`
- `customer_contact`
- `user`
- `source`
- `created_at`
- `dispatch_at`
- `status`
- `item_count`
- `quantity_total`
- `total_amount`
- `approved_items`
- `dispatched_items`
- `cycle_hours`
- `age_hours`
- `product_groups`
- `products`
- `latest_manager_comment`
- `latest_dispatch_comment`

### `Customer_Account_Snapshot`
One row per `customer_code` per refresh.

Suggested columns:
- `customer_code`
- `customer_name`
- `customer_contact`
- `customer_group`
- `total_exposure`
- `current_exposure`
- `thirty_day_exposure`
- `sixty_day_exposure`
- `ninety_day_exposure`
- `high_risk_exposure`
- `collected_value`
- `invoiced_value`
- `collection_rate`
- `average_age_days`
- `last_updated_at`

### `Analytics_KPI_Daily`
One row per day.

Suggested columns:
- `as_of_date`
- `order_count`
- `total_value`
- `open_value`
- `dispatched_value`
- `dispatched_orders`
- `pending_approvals`
- `pending_approval_value`
- `pending_dispatches`
- `pending_dispatch_value`
- `rejected_orders`
- `rejected_value`
- `active_customers`
- `active_reps`
- `average_order_value`
- `dispatch_rate`
- `throughput_rate`
- `avg_dispatch_hours`
- `average_open_age_hours`
- `aged_pending_approvals`
- `aged_dispatch_queue`
- `high_value_threshold`
- `high_value_open_orders`
- `top_customer_share`
- `top_source_share`
- `total_exposure`
- `current_exposure`
- `thirty_exposure`
- `sixty_exposure`
- `ninety_exposure`
- `high_risk_exposure`
- `collected_value`
- `invoiced_value`
- `collection_rate`
- `average_age_days`
- `last_updated_at`

## Later Tabs
- `AR_Open_Items_Fact`
- `Rep_Performance_Daily`
- `Product_Group_Daily`
- `Source_Channel_Daily`
- `Attention_Queue_Snapshot`
- `Targets`

## Current Manual Step For You
Copy the CSV content you prepared into the corresponding Google Sheets tabs, and create the new tabs listed above with headers only if the server-side derivation is not ready yet.

Once those tabs or raw append-only columns exist, the next repo to change is:
- `D:\\dev\\OMA\\OMA-DEMO-Server`

That server work is what will let the frontend stop reconstructing analytics entirely in-app.
