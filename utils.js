// Converts degrees to radians
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

// Calculates distance in meters between two coordinates
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Validates if the capture is within the allowed geofence radius
export const validateGeofence = (currentLat, currentLon, projectLat, projectLon, allowedRadius) => {
  const distance = calculateDistance(currentLat, currentLon, projectLat, projectLon);
  console.log(`Distance from site: ${distance.toFixed(2)} meters`);
  return distance <= allowedRadius;
};