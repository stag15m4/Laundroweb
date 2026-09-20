# Laundroweb write API — integration guide for Alfred

Laundroweb exposes two write endpoints for Alfred. Both use a **two-step
propose/confirm flow**: nothing is ever written by a single call.

You cannot change anything in Laundroweb on your own. You propose a change,
show the human the summary that comes back, and only call confirm once they
have said yes. This is enforced server-side — a confirm call needs a token
that only a propose call can produce — but the point of the design is the
approval in the middle, so treat it as a rule, not an obstacle.

## Base

| | |
|---|---|
| Method | `POST` (the existing `GET` endpoints are unchanged) |
| Auth header | `X-Alfred-Token: <ALFRED_SERVICE_TOKEN>` on **both** calls |
| Content type | `application/json` |
| Token lifetime | 300 seconds, single use |

A request whose body contains `confirmationToken` is a **confirm**. Any other
body is a **propose**. There is no separate URL for the two steps.

---

## The flow

1. **Propose.** POST the real field values. The server validates everything,
   writes nothing, and returns `summary` plus `confirmationToken`.
2. **Show the human the `summary` verbatim** and ask them to approve it. Do not
   paraphrase it — it is written to be read aloud, and it states exactly what
   will happen.
3. **Confirm.** If they approve, POST `{ "confirmationToken": "..." }` and
   nothing else. If they decline, do nothing; the token expires on its own.

If more than five minutes pass between the summary and their answer, the token
will have expired. Propose again rather than apologising — the second proposal
is free and the values are unchanged.

---

## `POST /api/alfred/maintenance`

Logs a maintenance event.

### Propose request

| Field | Type | Required | Notes |
|---|---|---|---|
| `machine` | string | no | Machine id, serial number, or name (`"W30-6"`). Omit for shop-wide work with no specific machine |
| `type` | string | **yes** | Short label: `"Repair"`, `"Preventive"`, `"Inspection"` |
| `description` | string | **yes** | What was done, in a sentence |
| `date` | string | no | `YYYY-MM-DD`. Defaults to today |
| `cost` | number \| string | no | Dollars, e.g. `125.50` |
| `technician` | string | no | |
| `vendor` | string | no | |
| `status` | string | no | `SCHEDULED` \| `IN_PROGRESS` \| `COMPLETED` \| `OVERDUE`. Defaults to `COMPLETED` |
| `partsUsed` | array | no | `[{ "part": "Door seal", "quantity": 2 }]`. `part` is a part name or id |

```json
{
  "machine": "W30-6",
  "type": "Repair",
  "date": "2026-09-20",
  "description": "Replaced door seal after water leak",
  "cost": 125.50,
  "technician": "Seth",
  "partsUsed": [{ "part": "Door seal", "quantity": 2 }]
}
```

### Propose response — `200`

```json
{
  "status": "proposed",
  "summary": "Log Repair on W30-6 dated 2026-09-20, cost $125.50 using 2 × Door seal. Status COMPLETED. \"Replaced door seal after water leak\"",
  "confirmationToken": "coz4DyrrU5A2…",
  "expiresAt": "2026-09-20T16:12:56.142Z",
  "expiresInSeconds": 300,
  "details": {
    "machineId": "…",
    "machineName": "W30-6",
    "date": "2026-09-20T12:00:00.000Z",
    "type": "Repair",
    "description": "Replaced door seal after water leak",
    "cost": 125.5,
    "technician": "Seth",
    "vendor": null,
    "status": "COMPLETED",
    "parts": [{ "partId": "…", "partName": "Door seal", "quantityUsed": 2 }]
  }
}
```

`details` holds the resolved values — use it to show the human what the vague
input turned into (which machine `"the 30 pounder"` matched, for instance).

### Confirm

```json
{ "confirmationToken": "coz4DyrrU5A2…" }
```

Response — `200`:

```json
{
  "status": "confirmed",
  "summary": "…the same sentence as the proposal…",
  "maintenanceLogId": "cmua0f…",
  "record": { "…": "the created log, with machine and partsUsed expanded" }
}
```

Confirming a log that uses parts **also decrements parts inventory**, in the
same transaction. Say so when you report back.

---

## `POST /api/alfred/machines`

Changes a machine's status.

### Propose request

| Field | Type | Required | Notes |
|---|---|---|---|
| `machine` | string | **yes** | Machine id, serial number, or name |
| `status` | string | **yes** | `OPERATIONAL` \| `OUT_OF_ORDER` \| `NEEDS_SERVICE` \| `RETIRED`. Case and spacing are normalised, so `"out of order"` is accepted |
| `note` | string | conditional | **Required unless `status` is `OPERATIONAL`** |

A machine cannot be taken out of service without a reason. If the human has not
given one, ask for it before proposing — do not invent one.

```json
{
  "machine": "W30-6",
  "status": "out of order",
  "note": "Bearing howling on spin. Parts ordered."
}
```

### Propose response — `200`

Same envelope as maintenance. `details` is:

```json
{
  "machineId": "…",
  "machineName": "W30-6",
  "fromStatus": "OPERATIONAL",
  "status": "OUT_OF_ORDER",
  "note": "Bearing howling on spin. Parts ordered."
}
```

`fromStatus` is the current status — worth reading back to the human, since it
confirms you found the machine they meant.

### Confirm

```json
{ "confirmationToken": "…" }
```

Response — `200`:

```json
{
  "status": "confirmed",
  "summary": "…",
  "machineId": "…",
  "record": { "id": "…", "name": "W30-6", "type": "WASHER", "status": "OUT_OF_ORDER" }
}
```

The note is saved against the machine and appears on the Notes page.

---

## Errors

Every failure is a non-2xx status with this body:

```json
{ "error": "stable_code", "message": "A sentence written for a person." }
```

**Relay the `message`, not the status code.** The messages are written to be
repeated to the human as-is.

| Status | `error` | What to do |
|---|---|---|
| `401` | `Unauthorized` | Token missing or wrong. Not recoverable in conversation — tell the human the integration is misconfigured |
| `400` | `invalid_json` | Bug on your side; fix the request |
| `400` | `missing_machine`, `missing_type`, `missing_description`, `missing_status` | Ask the human for the missing detail |
| `400` | `invalid_date`, `invalid_cost`, `invalid_status`, `invalid_parts`, `invalid_part_quantity` | Re-ask for that one value |
| `400` | `note_required` | Ask why the machine is going out of service, then propose again |
| `400` | `missing_confirmation_token` | Bug on your side |
| `404` | `machine_not_found`, `part_not_found` | Tell the human nothing matched; ask them to name it exactly |
| `404` | `unknown_confirmation_token` | Propose again |
| `409` | `ambiguous_machine`, `ambiguous_part` | Response includes `candidates: string[]`. **Ask the human which one** — never pick for them |
| `409` | `insufficient_part_stock` | Message states stock on hand vs requested. Ask how to proceed |
| `409` | `status_unchanged` | The machine is already in that state. Report it; nothing to do |
| `409` | `already_confirmed` | The change already went through. Do **not** retry — say it is done |
| `409` | `wrong_endpoint` | You sent a token to the wrong URL; fix the call |
| `410` | `expired_confirmation_token` | Propose again and re-ask for approval |

### Ambiguity

`"W30"` matches six machines, so the server refuses rather than guessing:

```json
{
  "error": "ambiguous_machine",
  "message": "\"W30\" matches 6 machines: W30-1, W30-2, W30-3, W30-4, W30-5, W30-6. Send the exact name or the serial number.",
  "candidates": ["W30-1", "W30-2", "W30-3", "W30-4", "W30-5", "W30-6"]
}
```

Put the `candidates` to the human and let them choose. Writing to the wrong
machine is worse than asking one more question.

---

## Rules

1. **Never call confirm without explicit human approval of that specific
   summary.** Not "they asked me to log maintenance earlier" — approval of the
   summary you just showed them.
2. **Never auto-retry a confirm.** `already_confirmed` means it worked;
   retrying anything else risks a duplicate once the cause is fixed.
3. **Never choose between ambiguous candidates.** Ask.
4. **Never invent a value to satisfy validation** — particularly the note on a
   status change, or a cost. Ask, or leave the optional field out.
5. **Report what actually happened**, including side effects: a confirmed
   maintenance log with parts has reduced inventory.

## Read endpoints

Unchanged and still `GET`-only: `/api/alfred/kpis`, `/revenue`, `/expenses`,
`/utilities`, `/machines`, `/maintenance`. Same `X-Alfred-Token` header. Use
them to check current state before proposing — for example, reading
`/api/alfred/machines` to find the exact name of the machine the human means.
