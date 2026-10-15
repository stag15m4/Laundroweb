# UniFi Protect entrance traffic — capture phase

This integration captures diagnostic alarms, not daily entries, occupancy, or unique people. No facial recognition, video processing, or Alfred endpoint is added. The automated Protect sender has its own credential and is separate from Alfred's human-approved write contract.

## Deployment and connection

1. Deploy the PR after CI passes. The existing start command runs Prisma db push; the only schema addition is ProtectWebhookEvent. No manual migration or changes to existing tables are required.
2. Set PROTECT_WEBHOOK_TOKEN to a new random secret of at least 32 characters (for example, generate with `openssl rand -hex 32`). Never commit the real secret, put it in a URL, or reuse Alfred/compliance credentials. The receiver fails closed if missing/too short.
3. In Protect create an alarm named `Laundroweb Entrance Test`: Activity / Line Crossing; include only FOH Rear-Facing (G5 Dome). Its Traffic Count Line should have only Person selected. No entries-only direction has yet been verified.
4. Action: Custom Webhook; method Post; Delivery URL `https://<your-laundroweb-host>/api/integrations/protect`. Add header `X-Protect-Token` with the same secret. Protect should send application/json; if configurable, add Content-Type: application/json. No new paid API service is needed.
5. Open Laundroweb / Cameras as an owner. Expand Connection settings to copy the URL. Refresh after walking across the line. Inspect the returned JSON locally; do not post raw production payloads publicly.

The token permits only event ingestion. The owner-only GET /api/cameras/traffic shows the latest 20 events received in the past seven days; it cannot be called using the webhook credential. It never returns the token. Staff cannot view diagnostic payloads.

## What must be verified before building a counter

- A single arrival and a single departure: confirm actual payload fields, any line identifier and direction, and whether the alarm UI can filter the direction at its source.
- Two people close together and two people side by side: check whether one alarm combines crossings.
- Several crossings close together: check Protect alarm cooldown, suppression and rate limits. Never assume one alarm equals one person.
- Retries: identical JSON payloads are deduplicated by canonical hash with an atomic unique upsert. Different alarms for the same crossing remain separate; there is no identity deduplication.
- Delivery interruption/restart: this receiver has no historical backfill or proof of camera health. No recent event does not prove the connection is offline or that no one visited.
- Record manual counts alongside footage, then compare a normal day including baskets/carts and repeat trips. Do not divide bidirectional events by two or label arrivals as unique visitors.

Protect's actual payload and firmware behavior decide whether webhooks suffice. If direction or multiplicity cannot be preserved, investigate its supported event API or change camera placement/hardware before adding business metrics.

## Storage and errors

The receiver accepts the documented alarm envelope (alarm.name plus numeric millisecond timestamp) up to 32 KiB. It retains the JSON body for short-lived diagnostics; it does not fetch images or video. Records older than seven days by server receipt time are deleted transactionally on the next accepted delivery, and are hidden from the read API immediately at expiry. This is activity-driven cleanup, not a scheduled deletion job. Disable the alarm and remove PROTECT_WEBHOOK_TOKEN when ending the test.

Malformed requests return JSON messages: 401 invalid/missing token, 415 non-JSON content type, 400 invalid alarm/JSON, 413 oversized body, 503 unconfigured receiver/storage error. GET cannot mutate the receiver. No tokens or raw payloads are logged by the route.

Sources checked October 15, 2026:
- https://help.ui.com/hc/en-us/articles/25478744592023-Send-UniFi-Protect-Alerts-to-Web-Services-using-Webhooks
- https://help.ui.com/hc/en-us/articles/360058867233-UniFi-Protect-Cameras-AI-Detections-and-Facial-Recognition

## Future security module (deferred)

Seth requested a later security module for people of interest (POIs) and other triggers. Reuse the integration boundary where appropriate, but verify each Protect alarm's payload and supported actions before implementation. POI alerts, event history and other security rules are future scope; the entrance diagnostic receiver does not implement them or actuate doors/alarms.
