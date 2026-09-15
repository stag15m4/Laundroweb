# Clinton Laundry Works — public website

Marketing site for the laundromat. Static Next.js 15 + Tailwind, exported to
plain HTML so it can be hosted free anywhere.

This is **separate from the `Laundroweb` ops app**, on purpose:

- The ops app runs `npx prisma db push` on every deploy. A marketing copy edit
  should never be able to trigger a schema push against live data.
- The ops app holds the database URL, the NextAuth secret, and Tuya
  credentials that control the store's HVAC. The public site is the most
  exposed surface you own; it should not share a process or an env with those.
- A static site costs nothing to host and loads instantly. The ops app needs a
  server and a database.

It currently lives in the `website/` directory of the `Laundroweb` repo only as
a staging location — see [Moving to its own repo](#moving-to-its-own-repo). It
is inert there: Railway's nixpacks builder reads the repo root, so this nested
`package.json` is never built or deployed by the ops app's pipeline.

## Before you launch

All customer-facing content lives in **one file**: [`src/content/site.ts`](src/content/site.ts).

Placeholder values are prefixed with `TODO:`. A script checks for leftovers:

```bash
npm run check:content
```

It exits non-zero while any placeholder remains. Wire it into your deploy so a
half-filled site cannot reach production. You must fill in:

| What | Why it matters |
| --- | --- |
| Address, phone, email | The three things people actually search for |
| Hours (open + attended) | Wrong hours produce one-star reviews from people who drove out |
| Prices | Currently placeholder dollar amounts |
| Google Maps URL | Powers the "Open in Maps" button |
| Site URL | Needed for canonical tags and `sitemap.xml` |

Until these are filled in, the site renders the placeholder text with the
`TODO:` prefix stripped, and **omits** them from the structured data handed to
search engines — publishing a fake address as machine-readable `LocalBusiness`
data is much harder to walk back than a typo in body copy.

### The FasCard rollout

Card payment copy is deliberately hedged: it says card payment works on
*select* machines and is expanding, because that is what is true today. When
every machine is converted, set one flag in `site.ts`:

```ts
export const fascardRolloutComplete = true;
```

The homepage, pricing page, and FAQ all switch to the unqualified wording
automatically. Do not hand-edit the copy to claim full card support before the
rollout finishes — a customer arriving with only a card and finding a coin-only
machine is exactly the bad review this hedge avoids.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # static export into out/
npm run check:content
```

## Deploying

`npm run build` writes a fully static site to `out/`. Point any host at it:

- **Cloudflare Pages / Netlify** — build command `npm run build`, output `out`.
- **Vercel** — detected automatically.
- **Any web server** — copy `out/` and serve it.

There is no server, no database, and no environment variables.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Hero, differentiators, equipment, payment, FAQ |
| `/pricing/` | Wash/dry/supply prices and machine-size guidance |
| `/commercial/` | Business accounts, with a quote form or phone/email fallback |
| `/visit/` | Hours (open vs. attended), address, directions |

`robots.txt` and `sitemap.xml` are generated at build time.

### The business-account form

Static export means there is no server to receive a form POST. Set
`formEndpoint` in `site.ts` to a form service URL (Formspree, Netlify Forms,
Basin) and the form submits directly to it, no JavaScript required. Leave it
empty and the page shows a phone-and-email call to action instead — never a
form that silently goes nowhere.

## Equipment data

The machine counts in `site.ts` were taken from the live equipment records in
the Laundroweb ops system:

- **13 Huebsch washers** — 2 × 60 lb, 6 × 30 lb, 5 × 20 lb
- **16 Huebsch dryer drums** — 4 × 45 lb, 8 × 30 lb, 4 × 20 lb (8 stacked units)

These are hardcoded rather than read from the ops database. The public site
stays up even if the ops app is down, and machine counts change rarely. Update
them here when the floor changes.

## Moving to its own repo

Create an empty repo on GitHub, then lift this directory out with its history
intact:

```bash
# from the root of the Laundroweb checkout
git subtree split --prefix=website -b website-only

git clone --no-local . /tmp/clinton-site -b website-only
cd /tmp/clinton-site
git remote set-url origin git@github.com:stag15m4/clinton-laundry-works.git
git push -u origin website-only:main
```

Then delete `website/` from `Laundroweb` so there is only one copy.
