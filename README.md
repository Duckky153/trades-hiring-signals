# Trades Hiring Signals

Which home-service shops should a sales rep call this week, and why?

This is a small static site. It reads one export of public job postings from heating, cooling, plumbing and other trade shops, reads each posting's **title and description**, and ranks the shops for fit and timing. It counts jobs instead of listings, caps every signal, and sends unclear shops to a person instead of guessing.

**All data is synthetic.** The 60 shops and 231 postings are invented, every domain ends in the reserved `.example` ending, and the data date is Sep 30, 2026.

With the default weights the page opens with this sentence, computed live from the data:

> Of 60 shops posting 231 listings (173 distinct jobs), 13 are worth a call this week, 17 are worth watching, 7 are held for a person, and 23 don't fit yet.

## What's on the pages

**Ranked shops (`index.html`)**

- A synthetic data badge and the live result sentence.
- Tier filter buttons with counts: Call this week, Watch, Held for a person, Not yet, Excluded.
- The ranked table: shop, trade, metro, technicians, software, score, tier and the top reason in plain words.
- Click any shop to open its detail view: every signal with its points and the exact posting line behind it (board, date and age), the listings that were folded into one job, the listings that weren't counted and why, what a follow-up seat costs a year when the pay is posted, a draft first line built only from that shop's own postings, and two first-call questions tied to its signals.
- **Held for a person**: each held shop with its reason and the next step.
- **Excluded**: each shop that failed a fit gate, with the reason.
- **Why caps matter**: the big shop and the mid-size shop below, with both scores worked out line by line.
- **The rules in plain words**, each with the number of shops it touched, and a weights editor. Change any number and the whole page re-ranks.
- Assumptions, what I'd need to run this on real data, and five open questions.

**Where to look first (`segments.html`)**

- The same postings and rules, rolled up by trade and metro (or trade and region, trade only, or metro only).
- For each segment: shops, share passing the fit gates, share naming ServiceTitan, share hiring for follow-up work, median posted pay for follow-up seats, median technician count, and the share of qualified shops in Call this week, with a one-line reason for its rank.
- A toggle to include or leave out the adjacent trades (electrical, roofing, pest).
- The top three segments each get an opening angle built from their own numbers.
- A live sentence. With default weights: "HVAC shops in the Sun Belt metros (Phoenix, Dallas, Tampa and Atlanta) have the most ServiceTitan shops hiring for follow-up work: 7 of 16."

## How it works, one rule per sentence

The rules run in this order. Every number below is a default in one `DEFAULT_WEIGHTS` object in `signals.mjs`, and every one can be changed on the page.

1. **Same shop.** Two records with the same website are one shop; the same name with a different website is an identity conflict, held for a person.
2. **Gate: commercial only.** A shop that only does commercial or industrial work is out, because the buyer here is residential repair and replacement.
3. **Gate: too small.** A shop with fewer than 8 technicians is "too small for now".
4. **Gate: no shop source.** A shop whose only listings are job-board reposts, with no link back to the shop's own careers page, is out.
5. **Gate: stale.** A shop whose listings are all more than 60 days old is out.
6. **Count jobs, not listings.** Listings from the same shop with the same title, posted within 7 days of the first one, are one job, however many cities or boards it went up on.
7. **Recency.** A job counts in full up to 30 days old, at half credit from 31 to 60 days, and not at all after that.
8. **Trade.** HVAC or plumbing shops get 10 points; electrical, roofing and pest shops get 3.
9. **Software.** The software is read from the description text: ServiceTitan 20, Housecall Pro 10, any other named (FieldEdge, Successware, Jobber) 5, none 0, and only the best one counts.
10. **Follow-up hire.** An inside sales, estimate follow-up or sales support opening, or a front-office post whose text says it calls customers back on open estimates, gets 30 points, counting one job at most.
11. **Sales hires.** Each in-home sales opening (comfort advisor, sales technician, sales consultant) gets 8 points, counting two jobs at most (16).
12. **Technician hires.** Each technician, installer or apprentice opening gets 3 points, counting three jobs at most (9).
13. **Membership.** A posting that mentions a membership plan or maintenance club adds 5.
14. **New metro.** A posting in a metro where the shop has no listed location adds 5.
15. **Tiers.** 60 points or more is Call this week, 35 to 59 is Watch, and under 35 is Not yet.
16. **Holds.** Franchise locations, identity conflicts, an unclear service mix, and shops that would reach Call this week with no software named go to a person instead of a tier.

Two details that matter when explaining a score:

- Software, membership and new-metro points only come from postings that count (linked back to the shop and 60 days old or less), and they aren't scaled by age. Only the hiring signals get half credit.
- Posted pay is shown, never scored. Hourly pay is turned into a yearly figure at 2,080 hours.

## Why the rules look like this

- **Job posts are the trigger.** A shop advertising an inside sales or estimate follow-up seat is about to pay a salary for work that follow-up software can take on, and the posted pay shows what that seat costs. That's why it's worth the most points and is capped at one job.
- **The description matters, not just the title.** Shops name their software in the job text ("ServiceTitan experience a plus"), and a generic customer service post can turn out to include estimate follow-up. An earlier version of this idea read job titles only; this one reads the text. Other software scores lower, not zero, and a strong shop with no software named goes to a person.
- **Count jobs and cap every signal.** One job posted in three cities counts once. Without caps, a big shop posting a dozen technician jobs would beat a mid-size shop hiring its first follow-up person, even though the mid-size shop is paying for exactly the work being sold.
- **Unknowns go to a person, not to zero.** Franchise locations (does the owner buy, or head office?), unclear service mix, duplicate names and missing software are held with a next step, because a bad record wastes a call.

The cap example, worked out (it's on the page too):

| Shop | Technicians | What it's hiring | Points | Tier |
|---|---|---|---|---|
| Bayshore Comfort Co | 64 | 12 technician jobs, 2 comfort advisors, no follow-up hire | 10 trade + 20 ServiceTitan + 16 sales + 9 technicians (capped from 36) = **55** | Watch |
| Gulfside Air & Heat | 20 | its first estimate follow-up coordinator, 1 technician | 10 trade + 20 ServiceTitan + 30 follow-up + 3 technician = **63** | Call this week |

Without the technician cap, Bayshore would score 82 (10 + 20 + 16 + 36) and pass Gulfside easily.

## The planted cases

The synthetic data includes one shop for each situation the rules have to handle. Each one has its own test.

| # | Situation | Shop | Result |
|---|---|---|---|
| 1 | One job posted in 3 cities on 2 boards | Gulfside Air & Heat | 4 listings, counted as one job |
| 2 | Large shop, 12 technician jobs, no follow-up hire, against a mid-size shop hiring its first follow-up coordinator | Bayshore Comfort Co, Gulfside Air & Heat | 55 (Watch) ranks below 63 (Call this week) |
| 3 | Commercial-only contractor naming ServiceTitan | Palo Verde Mechanical | Excluded: commercial only |
| 4 | Franchise location with 3 sites, posting from the brand's head-office careers site | Polar Peak Heating & Cooling of Dallas | Held: franchise, confirm who buys |
| 5 | Strong signals, no software named | Chattahoochee Plumbing | Held: software unknown |
| 6 | Same name spelled two ways on one website; same name in two metros on two websites | Ridgeline Heating & Air; Summit Plumbing Co | Ridgeline merges into one shop; both Summit records are held |
| 7 | Only job-board reposts, no link to the shop | Keystone Climate Control | Excluded: no shop source |
| 8 | Postings 31 to 60 days old, and older | Windy City Comfort; Prairie Path Plumbing | Half credit; excluded as stale |
| 9 | 4 technicians | Cedar Ridge Heating & Cooling | Excluded: too small for now |
| 10 | Customer service post whose text says "call customers back on open estimates" | Suncoast Plumbing Services | Counts as a follow-up hire |
| 11 | Posted pay on a follow-up seat | Gulfside Air & Heat | "This seat costs $37,440 to $45,760 a year", not scored |
| 12 | Membership plan or maintenance club mentioned | Ridgeline Heating & Air | Adds 5 |

## Assumptions

- ServiceTitan shops fit best, because the estimate and follow-up data already lives there. Other software scores lower, not zero.
- A follow-up or inside sales opening means the shop is about to pay a salary for work software can take on.
- Technician counts come from careers-page text like "join our team of 42 techs", so they're approximate. A shop with no count isn't excluded for size.
- Hiring is not buying. A posting shows a shop is growing and where work is piling up, not that it will buy anything.
- Seasonality (segments page): HVAC demand peaks in summer and winter and plumbing is steadier, so a late-September snapshot may catch HVAC shops hiring for winter. Nothing is adjusted for it.
- Regions: Sun Belt is Phoenix, Dallas, Tampa and Atlanta; Midwest is Columbus and Chicago; Northeast is Philadelphia and Northern New Jersey.

## How to run

- **View it:** open `index.html` in any modern browser. Double-clicking the file works: there's no build step, no server, no install and no network call. On GitHub Pages it runs the same way.
- **Test it:** `node tests/run-tests.mjs` (Node 18 or newer, no dependencies). It runs 33 checks: each planted case, dedupe, recency, caps, tier boundaries at 34, 35, 59 and 60, holds overriding tiers, the live sentence, weight edits re-ranking, the segments page, and a scan of every file for private words, dashes, local paths and network calls.
- **Rebuild the data:** `node tools/make-data.mjs` rewrites `data.js` from a fixed seed, so it produces the same file every time.

## Files

| File | What it does |
|---|---|
| `index.html`, `app.js` | The ranked shops page. `app.js` only draws; it holds no rules. |
| `segments.html`, `segments.js` | The "Where to look first" page. Drawing only. |
| `signals.mjs` | Every rule and score as pure functions, plus the weights. It has no imports or exports, so the browser loads it as a plain script from disk and Node loads it for the tests. |
| `data.js` | The synthetic shops and postings. |
| `styles.css` | Light and dark themes, system fonts only. Tables turn into stacked cards on phones. |
| `tests/run-tests.mjs` | The test suite. |
| `tools/make-data.mjs` | Builds `data.js` from a seed. The pages never run it. |

## Limits

- The data is synthetic. Real postings are messier: odd titles, copied descriptions, redirects through hiring platforms, and careers pages that change without notice.
- Text is read with keyword patterns, not a language model. A post that describes estimate follow-up in other words is missed, and "comfortable in ServiceTitan or willing to learn" counts as naming ServiceTitan.
- Hiring is not buying, and a follow-up hire could also mean the shop has already decided to solve follow-up with people. That's the second open question on the page.
- The new-metro check only knows the cities in the data's city list.
- Weight edits aren't saved; the page resets on reload. The segments page always uses the default weights.
- To run it on real data I'd need the job boards and careers pages to read, a list of current customers to exclude, and the field-service software that's supported.

Built by Dakshit Raj with AI coding tools (Claude Code, Codex). All shops and postings are synthetic.
