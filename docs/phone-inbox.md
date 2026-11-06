# Laundromat phone inbox and urgent alerts

This adds a shared inbox to Laundroweb; it does not change the MagicJack line.
Start on a separate Twilio number and forward MagicJack only after a live test.
The feature is disabled by default. No credentials or real telephone numbers
are stored in source control.

## Caller experience

- 1 plays the owner's hours/location/payment information, then returns to the menu.
- 2 records a general message (up to 120 seconds).
- 9 durably logs an urgent request and records the caller's message. All messages, including option 2, enter message triage.
- No selection or an invalid selection ends the call without recording a message.
- After recording/transcription, triage determines whether to alert. If an urgent caller hangs up without recording or analysis is unavailable, human-review escalation starts after a bounded wait (up to three minutes for missing transcription).
- Prompts tell callers to call 911 for immediate threats to life or safety.

Signed-in OWNER and STAFF users can listen, read transcripts, call back using their
phone, acknowledge an alert, and mark a message resolved. Only an OWNER can change
phone settings or destinations. These permissions match this app's single-business
OWNER/STAFF model; this does not introduce multi-tenant telephone routing.

## Setup

1. Create a Twilio account and acquire a US/Canada voice-capable number. A trial
   account may only call verified destinations and plays a trial announcement;
   upgrade and verify calling permissions before using this for real customers.
2. Configure these server environment variables:

   | Variable | Value |
   | --- | --- |
   | `TWILIO_ACCOUNT_SID` | Account SID beginning AC |
   | `TWILIO_AUTH_TOKEN` | Account auth token, server only |
   | `TWILIO_PHONE_NUMBER` | New incoming number, e.g. +19195551234 |
   | `PHONE_PUBLIC_URL` | Exact public HTTPS app origin, without trailing slash |
   | `PHONE_WORKER_ENABLED` | true on the long-running Node app |
   | `PHONE_FALLBACK_NUMBER` | Optional direct on-call cell for when the line is disabled |

3. The normal build generates Prisma. Apply the updated Prisma schema using the
   existing deployment process (`prisma db push`); this change only adds tables.
   The worker starts through Next's Node instrumentation hook and checks pending
   work every five seconds. It is intended for the existing long-running Node
   deployment; a serverless-only deployment would need a separate scheduled worker.
4. In the Twilio number's Voice configuration, set "A call comes in" to POST:
   `https://YOUR-APP/api/phone/webhooks/incoming`.
5. Configure Twilio's **primary handler failure/fallback URL** to an independent
   TwiML Bin that dials a direct on-call cell. Do not point that fallback back at
   Laundroweb: it must work when the app is offline. Do not use the MagicJack
   number or any number that forwards to this line, which would create a loop.
   Example TwiML Bin (replace the sample number with the direct cell):

   ```xml
   <Response><Dial timeout="25">+19195551235</Dial></Response>
   ```

   `PHONE_FALLBACK_NUMBER` is separate: it only handles calls when the app is
   reachable and the feature is disabled. It cannot handle an app outage.
6. Enable HTTP Basic Authentication for Twilio recordings/media in Twilio's
   account settings. Recordings are fetched through a session-protected app route;
   browser users never receive Twilio credentials or a public recording URL.
7. In **Phone inbox > Setup**, fill in the real greeting and business information,
   add one to three named on-call contacts using +1 format, and save. Contacts
   rotate in listed order; defaults are six total calls, two minutes apart.
   Confirm the worker heartbeat says Running, then enable the line and save.
8. Test the scenarios below on the new number. Then forward MagicJack to it.
   No phone-number transfer is required for this setup.

## Urgent escalation behavior

Each outgoing call says there is an urgent laundromat message, gives the caller's
number and transcript if available, and asks the recipient to press 1. Until a
transcript is available, it directs the recipient to the inbox recording.

Only an explicit press 1, or acknowledge/resolve in the app, stops further calls.
A phone ringing, an answered call, and personal voicemail do not acknowledge an
alert. Acknowledgment is distinct from resolution. The operator must contact the
caller and handle the problem; this version does not bridge the caller live.

Retries, attempt counts, delivery errors, and leases are stored in PostgreSQL.
Multiple workers claim work atomically; expired leases recover after a restart.
Attempts are recorded before dialing. An ambiguous provider/network timeout is
shown as DELIVERY_UNCERTAIN and consumes an attempt; it is never retried immediately
because the provider may already have placed the call. The next scheduled attempt
still waits the configured interval. A narrow race can leave one call already in
flight when an operator acknowledges; its prompt checks the message's current state.

At the retry limit, the alert remains OPEN and is prominently marked as needing
attention. No automatic resolution occurs. Disabling the line pauses delivery;
re-enabling resumes open pending alerts. It does not discard any messages.

The worker heartbeat confirms recent operation, not guaranteed future delivery.
An application/database outage interrupts escalation of existing messages until
recovery; the independent Twilio fallback covers new callers. Deployments recover
pending work from the database rather than relying on in-memory timeouts.

## Verification before public forwarding

- General message: recording plays in the inbox; transcript arrives if supported.
- Urgent message: primary rings, backup rings if no acknowledgment, then rotates.
- Let personal voicemail answer: the alert stays OPEN.
- Answer and press 1: further scheduled calls stop; acknowledgment appears in inbox.
- Acknowledge and resolve from the inbox: retries stop and user/time are recorded.
- Hang up immediately after pressing 9: an urgent alert still appears and rings out.
- Restart the app with an alert pending: it resumes after recovery.
- Disable the line: direct fallback works and pending alert delivery pauses.
- Make the primary webhook unavailable: Twilio's independent fallback works.
- Test actual forwarded caller ID from MagicJack: callback numbers depend on what
  MagicJack sends. The greeting also asks callers to speak their callback number.

## Tests

- `node --import tsx --test tests/phone.test.ts` — signature verification, closed
  configuration, explicit acknowledgment, destination validation, rotation, XML escaping.
- After applying the schema to a dedicated disposable PostgreSQL database:
  `PHONE_TEST_DATABASE_URL="$DATABASE_URL" node --import tsx --test tests/phone.integration.test.ts`
  exercises signed callbacks, recording ownership, duplicate menus, competing workers,
  voicemail non-acknowledgment, expired leases, transport failure, retry caps, and replay.
  Provider fetch is mocked; no real calls are made. Never point this at production.
- CI runs both, plus typecheck, the production build, and the existing auth smoke test.

## Scope and operating costs

This first version uses a keypad menu and recorded voicemail. There is no conversational
AI receptionist, SMS escalation, automatic refund, door control, or Alfred write API.
Native Twilio voicemail transcription is best-effort and may be delayed or unavailable;
recordings remain available independently. Voicemail recording/transcription and
incoming/outgoing minutes incur provider charges. Recordings remain in Twilio and
message metadata/transcripts remain in the app database; no automated retention purge
is included. Define retention before expanding access or storing sensitive messages.

## On-call hours

Setup includes editable daily on-call start/end times in America/New_York.
Hours default to 06:00–22:00, with daylight saving changes handled automatically.
The start is inclusive; the end is exclusive. Overnight ranges are supported;
equal start/end is rejected. Uncheck the limit for 24-hour alerts.
Outside coverage, the menu and voicemail remain available. URGENT service alerts
wait without consuming attempts until coverage resumes; CRITICAL hazards and
REVIEW messages bypass quiet hours. An already placed call may finish after closing time.
The provider-side outage fallback is independent of these app hours; configure
its own hours if it must also remain quiet outside coverage.

## Smart message triage and languages

Every recorded message is analyzed, including the general mailbox. ROUTINE
(refunds, isolated vending failures) stays in the inbox without phone alerts.
URGENT service issues alert during on-call hours. CRITICAL hazards and REVIEW
(uncertain/unavailable analysis) alert at any hour using the same bounded,
acknowledged escalation. AI never resolves a message. Obvious current hazard
phrases in English, Spanish or Haitian Creole promote it without waiting for AI;
contextual AI handles other wording, negations and mixed issues. Phrase matching
and AI can make mistakes: live test with real callers before relying on routing.

Set OPENAI_API_KEY in Railway for recorded multilingual speech transcription;
the default PHONE_TRANSCRIPTION_MODEL is gpt-transcribe. Language is auto-detected,
original text is preserved and AI provides an English summary. The same
OPENAI_API_KEY powers structured message classification through the Responses API,
defaulting to gpt-6-luna; PHONE_TRIAGE_MODEL optionally overrides it. The phone
system does not use the manuals module's separate Anthropic credentials/model.
PHONE_TRIAGE_SELF_TEST=true runs one synthetic Sprite classification at startup,
logging only the level/source and never creating a message or dialing a phone. A missing/rejected speech or classification key, malformed output,
unclear language, or provider timeout leads to REVIEW rather than suppressing a
potential emergency. Native Twilio transcription remains a backup source of
hazard phrases, but English-only native transcription is not enough to clear a
multilingual message as routine. Haitian Creole recognition quality must be tested
with fluent speakers; do not represent it as validated from synthetic text tests.

The default menu includes a short Spanish instruction. Setup also accepts a
public HTTPS recorded multilingual menu URL, replacing all synthesized opening
menu speech. Record the full English/Spanish/Haitian Creole menu with a fluent
speaker: 1 information, 2 message, 9 urgent. The app does not pretend an English
or French TTS voice is Haitian Creole. Until supplied, a Creole greeting is not
configured. The recording prompt still uses the app's standard English instructions;
include instructions to leave name/callback/problem in the multilingual recording.

Speech transcription and AI incur usage charges and send message audio/text to
the configured providers. Callers hear a voicemail prompt and beep. The database
stores triage result, source, reason and errors; no automatic retention change is
included. Worker leases and conditional updates prevent duplicate analysis and
never reopen an acknowledged/resolved message. Alert dialing runs independently
of slow analysis, and deferred service-message backlogs cannot hide a critical
alert outside on-call hours.
