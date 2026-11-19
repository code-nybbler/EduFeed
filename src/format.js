/** "640 m" / "2.3 km", or feet and miles for people who use them. */
export function formatDistance(meters, miles = false) {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (miles) {
    const mi = meters / 1609.344;
    if (mi < 0.1) return `${Math.max(10, Math.round((meters * 3.28084) / 10) * 10)} ft`;
    return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
  }
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}
