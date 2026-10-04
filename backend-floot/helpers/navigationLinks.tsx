/** Deep links that open turn-by-turn navigation in the driver's maps app. */
export const navigationLinks = {
  googleMaps: (lat: number, lng: number) =>
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
  waze: (lat: number, lng: number) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  formatDistance: (meters: number | null) => {
    if (meters == null) return "";
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  },
};
