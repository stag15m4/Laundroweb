import { WdfError } from "./wdf-pricing";
import { ServiceLocation } from "./wdf-location";

// Return candidates, never silently pick the first or infer a county from a ZIP.
export function censusMatches(data: unknown, inputAddress: string, now = new Date()): ServiceLocation[] {
  const root = data as { result?: { addressMatches?: unknown } } | null;
  if (!Array.isArray(root?.result?.addressMatches)) throw new WdfError("Address lookup returned an invalid response. Please retry.", 502);
  const candidates: ServiceLocation[] = [];
  for (const value of root.result.addressMatches) {
    const m = value as { matchedAddress?: unknown; coordinates?: { x?: unknown; y?: unknown }; geographies?: { Counties?: unknown } } | null;
    const counties = m?.geographies?.Counties;
    if (!Array.isArray(counties) || counties.length !== 1) continue;
    const county = counties[0] as { GEOID?: unknown; NAME?: unknown; STATE?: unknown } | null;
    const longitude = m?.coordinates?.x, latitude = m?.coordinates?.y;
    if (typeof m?.matchedAddress !== "string" || !m.matchedAddress.trim() || m.matchedAddress.length > 500 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      county?.STATE !== "37" || typeof county.GEOID !== "string" || !/^37\d{3}$/.test(county.GEOID) ||
      typeof county.NAME !== "string" || !county.NAME.trim() || county.NAME.length > 100) continue;
    const candidate: ServiceLocation = { inputAddress, matchedAddress: m.matchedAddress, longitude, latitude,
      county: county.NAME, countyFips: county.GEOID, state: "NC", source: "US_CENSUS", lookedUpAt: now.toISOString() };
    if (!candidates.some(c => c.matchedAddress === candidate.matchedAddress && c.countyFips === candidate.countyFips && c.latitude === latitude && c.longitude === longitude)) candidates.push(candidate);
  }
  if (root.result.addressMatches.length && !candidates.length)
    throw new WdfError("No North Carolina address with a county match was found. Check the full street address, city, state and ZIP.");
  return candidates.slice(0, 10);
}

export async function lookupAddress(address: string, fetcher: typeof fetch = fetch) {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.search = new URLSearchParams({ address, benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "Counties", format: "json" }).toString();
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), cache: "no-store", redirect: "error" });
    if (!response.ok) throw new Error("Lookup unavailable");
    const raw = await response.text();
    if (raw.length > 1000000) throw new Error("Lookup response too large");
    return censusMatches(JSON.parse(raw), address);
  } catch (e) {
    if (e instanceof WdfError) throw e;
    // Do not log a URL containing a private customer address.
    throw new WdfError("Address lookup is unavailable. Your saved address has not changed. Please retry.", 502);
  }
}
