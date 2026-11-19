import { useCallback, useState } from 'react';

// Wikipedia and Commons only need a neighbourhood-level position, so coordinates
// are rounded to 3 decimal places (about 110 m) before use. They stay in memory:
// nothing is stored or sent anywhere except those rounded values in the search
// request to Wikimedia.
const round = (n) => Math.round(n * 1000) / 1000;

const DENIED = 'Location access is blocked. Allow it in your browser\'s site settings to see places near you.';
const FAILED = "Couldn't get your location. Please try again.";
const UNSUPPORTED = "This browser can't share your location.";

export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);

  /** Asks the browser for the user's position (this shows the permission prompt the first time). Resolves to coords, or null on failure. */
  const request = useCallback(
    () =>
      new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setError(UNSUPPORTED);
          resolve(null);
          return;
        }
        setAsking(true);
        setError(null);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const next = { lat: round(pos.coords.latitude), lon: round(pos.coords.longitude) };
            setCoords(next);
            setAsking(false);
            resolve(next);
          },
          (err) => {
            setAsking(false);
            setError(err.code === 1 ? DENIED : FAILED); // code 1 = PERMISSION_DENIED
            resolve(null);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
        );
      }),
    []
  );

  /** Re-uses location quietly, but only if the user has already granted it: never shows a prompt. */
  const restore = useCallback(async () => {
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' });
      if (status?.state === 'granted') await request();
    } catch {
      // No Permissions API: wait for an explicit tap on "Near me".
    }
  }, [request]);

  const clearError = useCallback(() => setError(null), []);

  return { coords, error, asking, request, restore, clearError };
}
