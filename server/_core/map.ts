/**
 * Google Maps placeholder - not available without API key.
 * Returns null to indicate map features are disabled.
 */

export type LatLng = {
  lat: number;
  lng: number;
};

export async function makeRequest<T = unknown>(
  _endpoint: string,
  _params?: Record<string, unknown>
): Promise<T> {
  throw new Error("Google Maps requires an API key. Set MAPS_API_KEY environment variable.");
}

export type TravelMode = "driving" | "walking" | "bicycling" | "transit";
export type MapType = "roadmap" | "satellite" | "terrain" | "hybrid";
export type SpeedUnit = "KPH" | "MPH";
