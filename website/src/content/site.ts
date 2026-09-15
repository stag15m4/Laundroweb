/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SINGLE SOURCE OF TRUTH FOR ALL SITE CONTENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  Everything a customer reads lives in this file. Edit here, rebuild, done.
 *  No other file needs to change for routine updates.
 *
 *  ⚠️  ITEMS MARKED `TODO:` ARE PLACEHOLDERS AND MUST BE REPLACED BEFORE LAUNCH.
 *      Publishing a wrong address, phone number, or set of hours is worse than
 *      having no site at all — it generates one-star reviews from people who
 *      drove to a closed store. Search the file for "TODO" to find them all.
 */

export const business = {
  name: "Clinton Laundry Works",
  /** Short tagline used in the hero and the browser title. */
  tagline: "Clean clothes, fast machines, no hassle.",

  // ── TODO: REPLACE ALL CONTACT DETAILS BELOW ────────────────────────────────
  phone: "TODO: (555) 555-0123",
  /** Digits only, with country code — used for the tap-to-call link on mobile. */
  phoneHref: "TODO: +15555550123",
  email: "TODO: hello@clintonlaundryworks.com",

  address: {
    street: "TODO: 123 Main Street",
    city: "TODO: Clinton",
    state: "TODO: XX",
    zip: "TODO: 00000",
  },

  /**
   * Google Maps link. Easiest way to get the right one: search your business
   * on Google Maps, click Share, and copy the link.
   */
  mapUrl: "TODO: https://maps.google.com/?q=Clinton+Laundry+Works",

  /** Public site URL once the domain is live. Used for SEO canonical tags. */
  siteUrl: "TODO: https://clintonlaundryworks.com",

  /** Optional — leave as empty strings to hide the social icons entirely. */
  social: {
    facebook: "",
    instagram: "",
  },
} as const;

/**
 * Store hours.
 *
 * `open`     — when the doors are unlocked and machines are usable.
 * `attended` — when a staff member is physically on site. Leave as `null`
 *              for days with no attendant. This is displayed as a separate
 *              column because "is someone there?" is a real question for
 *              customers doing laundry alone at night.
 *
 * TODO: Replace every row below with real hours.
 */
export const hours = [
  { day: "Monday",    open: "TODO: 6:00 AM – 10:00 PM", attended: "TODO: 8:00 AM – 4:00 PM" },
  { day: "Tuesday",   open: "TODO: 6:00 AM – 10:00 PM", attended: "TODO: 8:00 AM – 4:00 PM" },
  { day: "Wednesday", open: "TODO: 6:00 AM – 10:00 PM", attended: "TODO: 8:00 AM – 4:00 PM" },
  { day: "Thursday",  open: "TODO: 6:00 AM – 10:00 PM", attended: "TODO: 8:00 AM – 4:00 PM" },
  { day: "Friday",    open: "TODO: 6:00 AM – 10:00 PM", attended: "TODO: 8:00 AM – 4:00 PM" },
  { day: "Saturday",  open: "TODO: 6:00 AM – 10:00 PM", attended: "TODO: 8:00 AM – 2:00 PM" },
  { day: "Sunday",    open: "TODO: 6:00 AM – 10:00 PM", attended: null },
] as const;

/** Last wash is started this long before closing. Set to null to hide the notice. */
export const lastWashNotice = "TODO: Last wash starts 1 hour before closing";

/**
 * Equipment — these counts are pulled from the live equipment records in the
 * Laundroweb ops system, so they are accurate as of the last audit.
 * Update if machines are added or retired.
 */
export const equipment = {
  brand: "Huebsch",
  washers: [
    {
      size: "60 lb",
      count: 2,
      blurb: "Comforters, sleeping bags, and multiple loads at once.",
    },
    {
      size: "30 lb",
      count: 6,
      blurb: "About three regular home loads — the everyday workhorse.",
    },
    {
      size: "20 lb",
      count: 5,
      blurb: "Perfect for a single large hamper or delicates run.",
    },
  ],
  dryers: [
    { size: "45 lb", count: 4 },
    { size: "30 lb", count: 8 },
    { size: "20 lb", count: 4 },
  ],
} as const;

export const totalWashers = equipment.washers.reduce((n, w) => n + w.count, 0);
export const totalDryers = equipment.dryers.reduce((n, d) => n + d.count, 0);

/**
 * Pricing.
 *
 * TODO: Replace every price below with real prices.
 *
 * Deliberately hardcoded rather than pulled from the ops database: it keeps the
 * public site with zero runtime dependency on the internal system, and prices
 * change rarely. Edit this array when they do.
 */
export const pricing = {
  washers: [
    { size: "20 lb", price: "TODO: $3.50" },
    { size: "30 lb", price: "TODO: $5.00" },
    { size: "60 lb", price: "TODO: $8.50" },
  ],
  dryers: [
    { size: "20 lb", price: "TODO: $0.25 / 5 min" },
    { size: "30 lb", price: "TODO: $0.25 / 4 min" },
    { size: "45 lb", price: "TODO: $0.25 / 3 min" },
  ],
  /** Set to null to hide the vending section on the pricing page. */
  vending: [
    { item: "Detergent pod", price: "TODO: $1.50" },
    { item: "Dryer sheets (2 pk)", price: "TODO: $0.75" },
    { item: "Bleach packet", price: "TODO: $1.00" },
    { item: "Fabric softener packet", price: "TODO: $1.00" },
  ],
} as const;

/**
 * Payment methods.
 *
 * NOTE ON CARD PAYMENT: the FasCard rollout is in progress — some machines take
 * cards today, and the rest are being upgraded. The copy below says exactly
 * that on purpose. Do NOT change it to claim every machine takes cards until
 * the rollout is actually finished, or customers will show up with a card and
 * find a coin-only machine.
 *
 * When the rollout completes, set `fascardRolloutComplete` to true and the
 * site will automatically switch to the unqualified wording.
 */
export const fascardRolloutComplete = false;

export const payment = {
  coin: {
    title: "Coin operated",
    body: "Quarters work in every machine in the store.",
  },
  card: {
    title: fascardRolloutComplete ? "Tap or swipe to pay" : "Card payment on select machines",
    body: fascardRolloutComplete
      ? "Credit, debit, and contactless payment are accepted on every machine."
      : "We're rolling out FasCard readers across the store. A growing number of machines already accept credit, debit, and contactless payment — and the rest are being upgraded.",
  },
} as const;

/** Reasons to choose this laundromat. Shown as cards on the home page. */
export const highlights = [
  {
    title: `${totalWashers} washers, ${totalDryers} dryers`,
    body: "Enough capacity that you're not waiting for a machine, even on a busy Saturday.",
  },
  {
    title: "60 lb washers on site",
    body: "Comforters, sleeping bags, and bulky bedding that will not fit in a home machine.",
  },
  {
    title: `All ${equipment.brand} commercial equipment`,
    body: "The same machines used by hotels and hospitals — faster cycles and a harder extract, so everything spends less time in the dryer.",
  },
  {
    title: "Staffed part of the day",
    body: "An attendant is on site during posted hours if you need change, a hand, or a question answered.",
  },
  {
    title: "Supplies in store",
    body: "Detergent, dryer sheets, bleach, and softener available on site — no extra stop if you forgot yours.",
  },
  {
    title: "Business accounts welcome",
    body: "Predictable turnaround and volume pricing for salons, gyms, restaurants, and short-term rentals.",
  },
] as const;

/** Frequently asked questions. Also emitted as FAQ structured data for search. */
export const faqs = [
  {
    q: "Do I need quarters?",
    a: fascardRolloutComplete
      ? "No — every machine accepts cards, and quarters still work if you prefer them."
      : "Not necessarily. Every machine takes quarters, and a growing number also accept credit, debit, and contactless payment as we roll out FasCard readers across the store.",
  },
  {
    q: "How big a load can I wash?",
    a: "Our largest washers hold 60 lb — roughly six regular home loads, and large enough for a king comforter or a sleeping bag. We also have 30 lb and 20 lb machines for smaller loads.",
  },
  {
    q: "Is someone there to help?",
    a: "An attendant is on site during the attended hours listed on our hours page. Outside those hours the store is open and self-serve.",
  },
  {
    q: "Do you sell detergent?",
    a: "Yes. Detergent pods, dryer sheets, bleach, and fabric softener are available in store, so a forgotten bottle does not cost you a trip home.",
  },
  {
    q: "Do you handle laundry for businesses?",
    a: "We do. We work with salons, gyms, restaurants, and short-term rental operators on recurring volume. Get in touch for pricing and turnaround times.",
  },
] as const;

/**
 * Business-account enquiry form.
 *
 * The site is statically exported, so there is no server to receive a form
 * POST. Point this at a form-handling service (Formspree, Netlify Forms,
 * Basin) and the form submits directly to it — no JavaScript required.
 *
 * Leave it as an empty string and the page falls back to a plain
 * phone-and-email call to action instead of showing a form that goes nowhere.
 *
 * TODO: Set this once you've created a form endpoint, or leave empty to keep
 *       the phone/email fallback.
 */
export const formEndpoint = "";

/** Types of business we serve. Shown on the commercial page. */
export const commercialSegments = [
  {
    title: "Salons & spas",
    body: "Towels and capes turned around on a dependable schedule, so you are never short mid-shift.",
  },
  {
    title: "Gyms & studios",
    body: "High-volume towel service with the extract power to get sweat and odor out properly.",
  },
  {
    title: "Restaurants & cafés",
    body: "Aprons, rags, and table linens — including the grease-heavy items home machines cannot handle.",
  },
  {
    title: "Short-term rentals",
    body: "Sheets, duvets, and towels between guests, sized for same-day turnover.",
  },
] as const;
