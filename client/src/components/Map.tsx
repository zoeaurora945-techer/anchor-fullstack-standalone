/**
 * GOOGLE MAPS FRONTEND INTEGRATION
 *
 * To use this component, you need a Google Maps API key.
 * Set VITE_GOOGLE_MAPS_API_KEY in your .env file.
 *
 * If no API key is set, the map will show a placeholder.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAPS_URL = API_KEY
  ? `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`
  : null;

function loadMapScript(): Promise<void> {
  if (!MAPS_URL) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = MAPS_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve();
      script.remove();
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      resolve();
    };
    document.head.appendChild(script);
  });
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);

  const init = usePersistFn(async () => {
    await loadMapScript();
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    if (!window.google?.maps) {
      // No API key or script failed to load
      return;
    }
    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      streetViewControl: true,
      mapId: "DEMO_MAP_ID",
    });
    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  if (!API_KEY) {
    return (
      <div
        ref={mapContainer}
        className={cn(
          "w-full h-[500px] flex items-center justify-center bg-muted rounded-lg",
          className
        )}
      >
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">地图功能</p>
          <p className="text-sm">设置 VITE_GOOGLE_MAPS_API_KEY 以启用</p>
        </div>
      </div>
    );
  }

  return <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />;
}
