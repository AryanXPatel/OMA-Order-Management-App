# Voice Order Agent V1 Design

## Goal

Add a voice-driven order drafting flow to the New Order screen in OMA. The feature should let a user speak a full order or a follow-up command, have the system interpret it, and update the existing order draft for review. The feature must not auto-submit an order. The existing review and approval flow remains the final gate.

## Product Position

V1 is a draft mutation agent, not a separate ordering workflow and not a live voice assistant. The user records a short command, the backend interprets it, and the app applies safe changes to the current draft.

The feature is designed for naive users:

- one obvious mic button
- one obvious stop action
- one visible cancel action while recording or processing
- immediate draft updates when the command is clear
- strict blocking when the system is not sure which customer or product the user meant

## Hosting Assumption

The backend home for this feature is `D:\dev\OMA\OMA-DEMO-Server`.

This V1 is designed for the current Render deployment as a demo lane:

- synchronous request/response only
- no background jobs
- no streaming dependency
- stateless requests

As of May 8, 2026, free Render remains usable for a prototype but not for a reliable production voice flow because of sleep, cold starts, and the lack of free worker support.

## User Experience

The feature lives inside `app/(app)/new-order.tsx`. It should not open a separate screen.

Primary states:

- `idle`
- `recording`
- `processing`
- `applied`
- `needs_disambiguation`
- `error`

Primary control flow:

1. User taps `Start voice order`.
2. The button changes to `Stop`.
3. A separate `Cancel` action appears.
4. The user speaks a full order or a follow-up command.
5. The user taps `Stop`.
6. The app uploads the recording and the current draft snapshot to the backend.
7. The backend returns draft mutations or a clarification request.
8. The app applies safe mutations to the current draft and shows a short confirmation message.

The app stays on the same screen after a successful command. It does not jump to review after every change.

## Supported Voice Behaviors

The system should support both initial order creation and follow-up edits.

Examples:

- "Create order for Raj Traders, 10 bags cement, 5 rods, note urgent morning delivery."
- "Add 2 more rods."
- "Remove cement."
- "Replace rice with wheat."
- "Add this in note: call before dispatch."
- "Replace note with evening delivery only."
- "Make it 12."
- "Tomorrow 10 AM."
- "Source is phone order."

The draft remains editable by hand at all times.

## V1 Command Scope

V1 should support a medium, bounded command set:

- `set_customer`
- `add_line`
- `increase_qty`
- `decrease_qty`
- `set_qty`
- `remove_line`
- `replace_line`
- `append_note`
- `overwrite_note`
- `set_order_date_time`
- `set_order_source`

Do not support in V1:

- auto-submit
- approval or dispatch actions
- payment term mutation
- background conversational memory on the server

`clear_draft` and `clear_note` can exist only behind an explicit confirm UI. They should not apply immediately from voice alone.

## Safety Rules

The safety model is strict:

- if a customer or product match is ambiguous, do not mutate the draft
- show candidate choices and require the user to choose
- if a command is destructive, require either explicit phrasing or a confirm step
- if parsing fails, do not partially mutate the draft

Immediate apply is allowed only for non-destructive, unambiguous changes.

## Note Semantics

Note handling is asymmetric on purpose.

- append is the default
- overwrite is explicit

Examples:

- "Add this in note: urgent delivery." -> append
- "Also mention cash pickup." -> append
- "Replace note with deliver after 4 PM." -> overwrite
- "Clear note." -> require confirm

This prevents accidental data loss for a naive user.

## Context and Memory Model

The backend is stateless for V1.

Every voice request sends:

- the recorded audio
- the current draft snapshot
- small client metadata

The server does not own a long-lived session. The current app state is the conversation state. This avoids free-tier session loss and makes debugging easier.

## Frontend Architecture

The source of truth remains the existing local draft state in `app/(app)/new-order.tsx`.

Voice should mutate the same state used by manual input:

- selected customer
- selected customer code
- products
- order notes
- order date and time
- order source

Do not create a hidden parallel draft model.

Recommended local additions:

- `voiceState`
- `voiceTranscript`
- `voiceLastConfirmation`
- `voicePendingDisambiguation`
- `voiceMutationHistory`

`voiceMutationHistory` should support `undo last voice change` in the frontend only. The backend remains stateless.

## Mic Interaction

V1 uses a simple tap interaction:

- tap once to start recording
- tap again to stop and process
- tap `Cancel` to discard the recording or dismiss in-flight processing if the request has not completed

Do not use hold-to-talk or silence auto-stop in V1.

## Backend Pipeline

Add a new route to `D:\dev\OMA\OMA-DEMO-Server\index.js`, for example:

- `POST /api/voice-order/draft`

Pipeline:

1. accept short audio upload and draft snapshot
2. transcribe with Deepgram
3. interpret intent with GPT-mini
4. strict match against customer and product data
5. build machine-safe draft mutations
6. return the response to the app

GPT should interpret intent. Backend code should own matching authority and mutation planning.

## Backend Request Contract

Suggested request shape:

```json
{
  "draft": {
    "customerName": "Raj Traders",
    "customerCode": "C102",
    "products": [
      {
        "productCode": "P45",
        "productName": "Cement",
        "quantity": 10,
        "unit": "Bag",
        "orderAmount": "5000"
      }
    ],
    "orderComments": "Urgent",
    "orderSource": "Phone",
    "orderDateIso": "2026-05-08T10:30:00.000Z"
  },
  "clientMeta": {
    "platform": "android",
    "timestamp": "2026-05-08T10:31:00.000Z"
  }
}
```

The audio should be uploaded alongside this payload as multipart form data.

## Backend Response Contract

Suggested response shape:

```json
{
  "status": "applied",
  "transcript": "add 2 more rods and mention cash pickup",
  "normalizedCommand": {
    "intent": "update_order",
    "operations": [
      { "type": "increase_qty", "target": "last_line", "delta": 2 },
      { "type": "append_note", "value": "cash pickup" }
    ]
  },
  "mutations": [
    { "type": "increase_qty", "lineKey": "P88", "delta": 2 },
    { "type": "append_note", "value": "cash pickup" }
  ],
  "confirmationMessage": "Added 2 rods and updated the note.",
  "warnings": []
}
```

Possible `status` values:

- `applied`
- `needs_disambiguation`
- `rejected`
- `error`

For ambiguity, return candidates explicitly:

```json
{
  "status": "needs_disambiguation",
  "transcript": "add sugar",
  "disambiguation": {
    "kind": "product",
    "query": "sugar",
    "candidates": [
      { "id": "P1", "label": "Sugar 1kg" },
      { "id": "P2", "label": "Sugar 5kg" }
    ]
  }
}
```

## Matching Rules

Matching must be strict and deterministic.

- never auto-pick from low-confidence customer or product matches
- if more than one plausible match exists, return a disambiguation response
- if "add 2 more" has no clear last-touched line, reject it
- if "make it 12" points to more than one possible line, reject it
- if "replace rice with wheat" cannot resolve both sides, reject it

The backend should fetch or reuse current customer and product data from the same Sheets-backed sources the app already depends on.

## Frontend Mutation Rules

The frontend should apply returned mutations directly to local state. Each mutation should have a pure local application path.

Examples:

- `set_customer` -> set selected customer and customer code
- `add_line` -> add a line or merge into an existing identical line using one deterministic rule
- `increase_qty` -> update one line
- `remove_line` -> remove one line after match is clear
- `append_note` -> append with spacing normalization
- `overwrite_note` -> replace note value
- `set_order_date_time` -> update `orderDate`, `dateText`, and `timeText`
- `set_order_source` -> update `orderSource`

If the response is `needs_disambiguation`, do not mutate the draft until the user chooses a candidate.

## Error Handling

Failure behavior should be plain and recoverable.

- transcription failure -> "Could not understand the recording. Try again."
- parse failure -> "Could not turn that into an order change."
- matching failure -> show chooser or a specific correction prompt
- network or cold-start delay -> show processing copy and keep current draft untouched
- timeout -> preserve current draft and show retry guidance

No partial draft mutation should survive a failed request.

## UI Components

V1 can stay inside the existing screen with small additions:

- a voice control card near the top of the draft flow
- a processing state
- a short confirmation banner or feedback modal
- an inline disambiguation chooser
- an `Undo last voice change` action

Prefer `FeedbackContext` for transient success and error messaging. Use a dedicated inline or modal chooser for disambiguation, not a toast.

## Analytics and Logging

Keep logging practical and non-sensitive.

Suggested backend logs:

- request received
- audio processing start and finish
- transcript produced
- command class
- ambiguity result
- apply or reject result
- latency summary

Do not log raw secrets. Be careful with raw transcripts if they may contain sensitive customer or commercial data.

## Validation Plan

Backend validation:

- helper-level tests for transcript normalization
- helper-level tests for strict customer and product matching
- helper-level tests for mutation planning
- `node --check index.js`

Frontend validation:

- mutation application tests for each supported operation
- note append vs overwrite tests
- ambiguity handling tests
- undo-last-voice-change tests

Manual validation:

1. full spoken order creates a valid draft
2. follow-up voice command edits that draft
3. ambiguous product blocks mutation and shows choices
4. note append works by default
5. note overwrite works only on explicit overwrite phrasing
6. cancel recording leaves the draft untouched
7. backend error leaves the draft untouched
8. final `submitOrder()` still follows the existing approval path

## Rollout Recommendation

Build this in two implementation phases.

Phase 1:

- backend route
- Deepgram transcription
- GPT-mini parsing
- strict matching
- frontend mic control
- local mutation application
- disambiguation UI

Phase 2:

- undo polish
- transcript display polish
- better latency messaging
- command coverage expansion if real usage supports it

## Non-Goals

These are out of scope for V1:

- live streaming transcription
- server-side conversational sessions
- automatic order submission
- voice playback responses
- payment terms mutation
- approval, dispatch, or sheet-write workflow changes outside the existing submit path

## Recommended Next Step

Create an implementation plan that splits the work between:

- frontend recording and mutation application
- backend transcription and intent pipeline
- strict matcher helpers and tests

That plan should keep the current `submitOrder()` behavior intact and treat voice as a draft input surface only.
