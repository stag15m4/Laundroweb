# Door access wiring reference

Revision 1 | Recorded October 15, 2026 | Maintainer: Seth Gundersen

## Purpose and status

This document records the agreed three-block wiring arrangement for the existing 12 V door access system. Use it to trace conductors, maintain the installation, and plan future keypad or UniFi Access integration.

**Status: documented wiring baseline, pending field verification.** The final physical connections and successful completion of the tests below have not been reported. This is not an inspected as-built drawing or a record of fire marshal approval. Update this status after checking the installation.

Door location: ____________________  
Verified by and date: ____________________  
Reference photos and location: ____________________

## Required operation

Seth reported that the fire marshal requires fail-safe locking with a redundant push-to-exit button and motion sensor.

| Condition | Required behavior |
| --- | --- |
| Operating hours | Strike unpowered and door unlocked |
| Closed hours | Strike powered and door secured against entry |
| Exit button pressed during closed hours | Strike power interrupted and door released |
| Motion sensor activated during closed hours | Strike power interrupted and door released |
| All electrical power to strike removed | Strike releases in fail-safe configuration |

The timer controls the daily schedule. Each exit device must release the door independently while scheduled locking is active. A schedule setting must never override an exit release.

## Equipment

| Identifier | Equipment | Evidence and limitations |
| --- | --- | --- |
| PS1 | NCLTHS SP1205B power supply, listed as 12 V DC, 5 A | Owner supplied listing and board photo; actual output voltage and ratings to be checked |
| PB1 | Illuminated push-to-open / push-to-exit button | Owner corrected initial NO statement: contact is wired COM and NC; model and contact rating not recorded |
| MS1 | Alarm Controls SREX-100 request-to-exit sensor | Owner supplied instruction sheet; relay A COM and NC used in recorded circuit |
| LK1 | Adams Rite 7160 family electric strike | Installation sheet supplied; exact coil voltage, suffix, current and fail-safe configuration not independently verified |
| TM1 | JVR TL34N digital weekly timer | Supplied listing rear-label image identifies terminals 1 and 2 as switch contact, 3 and 4 as 12 V DC/AC power |
| B1 | Positive distribution connector | Five electrically common ports |
| B2 | Negative distribution connector | Five electrically common ports |
| B3 | Button-to-sensor junction connector | Two ports needed; a three-port connector may be used |

CAT6 is being used as field cable, not as Ethernet or PoE. Cable gauge, copper versus copper-clad aluminum, run lengths, voltage drop and current capacity have not been recorded. Check these against actual loads, including strike inrush, before treating this reference as a validated design.

## Cable and color conventions

**Run 1:** cabinet to exit button.  
**Run 2:** cabinet toward door frame, serving sensor and strike.

A color beginning with White means the white conductor carrying that color stripe. For example, White/Green is the white wire with a green stripe. Earlier chat notes sometimes wrote Green/White for this same conductor.

**CAT6 conductor colors are not the sensor factory lead colors.** Trace and label each cable before altering the installation.

## Complete cabinet connection map

Make wiring changes with incoming mains and any backup battery disconnected. The cabinet contains mains voltage; this document covers the low-voltage circuit only.

Each PS1 power terminal has one jumper to its distribution block. Use connectors and spade terminals suitable for the actual conductor size, type and load; do not assume a board screw accepts multiple conductors.

| Node | Connection 1 | Connection 2 | Connection 3 | Connection 4 | Connection 5 |
| --- | --- | --- | --- | --- | --- |
| B1 positive | PS1 V+ jumper | Run 1 Blue | Run 1 Orange | Run 2 Blue | TM1 terminal 4 jumper |
| B2 negative | PS1 GND jumper | Run 1 White/Blue | Run 2 White/Blue | Run 2 White/Brown | TM1 terminal 3 jumper |
| B3 junction | Run 1 White/Orange | Run 2 Green | Spare if three-port | Not applicable | Not applicable |

| Direct connection | Destination |
| --- | --- |
| Run 2 White/Green | TM1 terminal 1 |
| Run 2 Brown | TM1 terminal 2 |

**PS1 PUSH remains unused. Run 1 Orange connects to B1 positive, not PUSH.**

PS1 NO, NC, PUSH and both CONTROL terminals are unused in this baseline. These functional terminals are not spare junction points. The power supply's internal access-control relay is not used; the timer's contact switches the strike circuit.

Ordinary lever-block ports are electrically common. Different slots in one block do not isolate conductors. Do not join Run 2 White/Green and Run 2 Brown outside the timer contact; that would bypass the schedule.

## Every CAT6 conductor

| Run | Conductor | Cabinet destination | Field function |
| --- | --- | --- | --- |
| 1 | Blue | B1 positive | Button LED positive |
| 1 | White/Blue | B2 negative | Button LED negative |
| 1 | Orange | B1 positive | Button COM feed |
| 1 | White/Orange | B3 junction | Button NC return |
| 1 | Green | Unused and insulated | Spare |
| 1 | White/Green | Unused and insulated | Spare |
| 1 | Brown | Unused and insulated | Spare |
| 1 | White/Brown | Unused and insulated | Spare |
| 2 | Blue | B1 positive | Sensor power positive |
| 2 | White/Blue | B2 negative | Sensor power negative |
| 2 | Green | B3 junction | Sensor relay A COM feed |
| 2 | White/Green | TM1 terminal 1 | Sensor relay A NC return |
| 2 | Brown | TM1 terminal 2 | Strike feed |
| 2 | White/Brown | B2 negative | Strike return |
| 2 | Orange | Unused and insulated | Spare |
| 2 | White/Orange | Unused and insulated | Spare |

The table records the agreed field assignments. Continuity and endpoint checks remain necessary to confirm the physical wiring matches.

## Sensor factory lead mapping

The SREX-100 manufacturer manual identifies the following factory leads. Confirm the installed splices match this table.

| CAT6 Run 2 conductor | SREX-100 factory lead | Function |
| --- | --- | --- |
| Blue | Red | Sensor supply |
| White/Blue | Black | Sensor supply return |
| Green | White with black stripe | Relay A common |
| White/Green | Yellow with black stripe | Relay A normally closed |

The manual rates the sensor relay contacts at 1.3 A at 30 V DC or 24 V AC. Check the actual strike load and switching requirements against this rating. The unused sensor leads and configuration switch positions have not been inventoried. Do not apply voltage to its dry-contact input leads.

## Timer terminal assignments

**The earlier Gemini text reversed the power and contact terminal pairs. Do not reuse those earlier assignments.** Match the actual timer rear label to the supplied TL34N label before using this map.

| TM1 terminal | Recorded connection | Purpose |
| --- | --- | --- |
| 1 | Run 2 White/Green | Contact from sensor NC |
| 2 | Run 2 Brown | Contact to strike feed |
| 3 | B2 negative | Timer supply; black lead shown in listing |
| 4 | B1 positive | Timer supply; red lead shown in listing |

The supplied label marks terminals 1 and 2 with a switch symbol and terminals 3 and 4 as 12 V DC/AC power. No polarity symbol was legible on that label; the 3-negative and 4-positive assignment follows the pictured lead colors. Follow the installed unit's instructions if its markings differ. Contact terminals 1 and 2 can exchange loop-wire positions.

Timer power stays continuously supplied. Only the strike feed runs through the timer contact.

## Circuit operation and schedule

The strike feed passes through these components in order:

1. PS1 V+ and B1.
2. Run 1 Orange to PB1 common.
3. PB1 NC contact to Run 1 White/Orange.
4. B3 to Run 2 Green and MS1 relay A common.
5. MS1 relay A NC to Run 2 White/Green.
6. TM1 contact between terminals 1 and 2.
7. Run 2 Brown to LK1.
8. LK1 return through Run 2 White/Brown, B2 and PS1 GND.

PB1 opening, MS1 opening or TM1 opening interrupts strike power. Button illumination, sensor power and timer power are supplied separately and continuously from B1 and B2.

| Schedule state | Timer contact | Strike behavior |
| --- | --- | --- |
| Closed hours | ON / closed | Powered when both exit contacts are closed |
| Operating hours | OFF / open | Unpowered and unlocked |

Example only: if business hours are 09:00 to 17:00, set the contact OFF at 09:00 and ON at 17:00 on the applicable days. Actual business hours, selected weekdays, holiday exceptions and final timer settings have not been confirmed.

Recorded schedule and timer mode: ____________________

## Verification and maintenance record

A lit display or relay click does not establish correct operation. Record the following with the door safely accessible.

| Check | Required result | Result and date |
| --- | --- | --- |
| Endpoint and continuity check | Each conductor matches this reference | Pending |
| Supply and load check | Correct voltage at devices under load; suitable wiring and contact ratings | Pending |
| Closed-hours state | Strike secures door against entry | Pending |
| Button test with sensor inactive | Button independently releases door | Pending |
| Sensor test without pressing button | Sensor independently releases door | Pending |
| Operating-hours state | Door remains unlocked | Pending |
| Complete strike power loss | Strike releases | Pending |
| Timer power loss and restoration | Behavior recorded; exit releases remain effective | Pending |
| Sensor-only power loss | Behavior recorded and reviewed against required egress behavior | Pending |
| Final acceptance | Applicable fire marshal requirements confirmed | Pending |

Opening a relay's NC contact during normal sensing does not establish that sensor-only power loss will open it. Assess that failure condition separately. Battery presence, fire-alarm release interface, manual release duration and any required listings or approvals have not been established.

After verification, add dated cabinet and device-end photos, actual equipment labels, cable lengths and settings to this record.

## Future keypad or UniFi Access integration

No future controller or keypad is installed by this document, and no specific UniFi model has been selected.

Preserve the ability of each required exit device to interrupt strike power independently. Any added controller should be designed so a software command, schedule or controller fault cannot defeat the required release path.

Before making changes:

1. Select the exact keypad or controller and consult its current manufacturer wiring instructions.
2. Identify whether its output is a dry contact or powered lock output, and confirm voltage, current and inductive-load ratings.
3. Decide whether it replaces the timer schedule or adds another release function; document the resulting behavior.
4. Determine whether the existing supply and strike are compatible. Never join two powered outputs together.
5. Resolve backup-power, controller-loss, sensor-loss and fire-alarm behavior with the installer and approving authority.
6. Review spare CAT6 conductors for the chosen interface. Spare conductors are not proof that the cable meets data, PoE or device installation requirements.
7. Revise the connection tables and repeat all release and schedule tests.

Do not put a new controller contact across the entire button-and-sensor chain in a way that can bypass both exit devices.

## Source record and revisions

Baseline sources: Seth's October 15, 2026 wiring discussion and NC-button correction; supplied power supply board photo and SP1205B listing; TL34N rear-label listing image; strike installation page; SREX-100 instructions. The earlier Gemini instructions were used for owner-confirmed CAT6 assignments, not for timer terminal numbering.

Manufacturer sensor manual:  
https://www.alarmcontrols.com/adobe/assets/urn:aaid:aem:2ef764d2-be72-406b-907f-51d974c3b0b9/original/as/AADSS1057483.pdf

| Revision | Date | Change |
| --- | --- | --- |
| 1 | 2026-10-15 | Recorded three-block baseline, corrected timer pairs, unused conductors, test record and future integration requirements |

For later changes, preserve prior revisions in git and update the date, equipment list, affected connections, tests and verification status.
