export type ServiceLocation = {
  inputAddress: string; matchedAddress: string; latitude: number | null; longitude: number | null;
  county: string; countyFips: string; state: string; source: "US_CENSUS" | "CLW";
  lookedUpAt: string; confirmedAt?: string; confirmedById?: string; confirmedByName?: string;
};

// Business address and county, independent of the customer's billing address.
export const CLW_LOCATION: ServiceLocation = {
  inputAddress: "540 McKoy St, Clinton, NC 28328", matchedAddress: "540 McKoy St, Clinton, NC 28328",
  latitude: null, longitude: null, county: "Sampson County", countyFips: "37163", state: "NC",
  source: "CLW", lookedUpAt: "2026-10-20T00:00:00.000Z",
};

export function mapsUrl(location: ServiceLocation) {
  // Include the address alongside the coordinates so the pin has a readable label.
  const query = location.latitude !== null && location.longitude !== null ?
    `${location.latitude},${location.longitude} (${location.matchedAddress})` : location.matchedAddress;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
}

export function locationSnapshot(fulfillment: unknown, delivery: ServiceLocation | null) {
  if (fulfillment === "PICKUP") return { ...CLW_LOCATION };
  if (fulfillment !== "DELIVERY" && fulfillment !== "LINEN") throw new Error("Invalid fulfillment method.");
  return delivery ? { ...delivery } : null;
}
