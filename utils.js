// Converts degrees to radians
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

// Calculates distance in meters between two coordinates
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const nLat1 = parseFloat(lat1);
  const nLon1 = parseFloat(lon1);
  const nLat2 = parseFloat(lat2);
  const nLon2 = parseFloat(lon2);

  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) {
    return NaN;
  }

  const R = 6371e3; // Earth's radius in meters
  const phi1 = toRadians(nLat1);
  const phi2 = toRadians(nLat2);
  const deltaPhi = toRadians(nLat2 - nLat1);
  const deltaLambda = toRadians(nLon2 - nLon1);

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Validates if the capture is within the allowed geofence radius
export const validateGeofence = (currentLat, currentLon, projectLat, projectLon, allowedRadius) => {
  const radius = parseFloat(allowedRadius);
  if (isNaN(radius) || radius <= 0) {
    return false;
  }
  const distance = calculateDistance(currentLat, currentLon, projectLat, projectLon);
  if (isNaN(distance)) {
    return false;
  }
  console.log(`Distance from site: ${distance.toFixed(2)} meters (Allowed: ${radius}m)`);
  return distance <= radius;
};

export const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('The server did not respond in time. Check that Django is running and the phone is on the same network.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Executes a native multipart/form-data upload using XMLHttpRequest.
 * Bypasses Expo Winter fetch implementation which throws 'Unsupported FormDataPart implementation'
 * when handling React Native { uri, name, type } file objects.
 *
 * @param {string} url - Target endpoint URL
 * @param {FormData} formData - Multipart form data with file parts
 * @param {number} [timeoutMs=60000] - Request timeout in milliseconds
 * @returns {Promise<{status: number, data: any}>}
 */
export const uploadMultipartAsync = (url, formData, timeoutMs = 60000, headers = {}) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Accept', 'application/json');
    Object.entries(headers).forEach(([name, value]) => {
      xhr.setRequestHeader(name, value);
    });

    xhr.onload = () => {
      let responseData = {};
      try {
        responseData = JSON.parse(xhr.responseText);
      } catch (parseErr) {
        responseData = { text: xhr.responseText };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          status: xhr.status,
          data: responseData,
        });
      } else {
        const message = responseData?.error || responseData?.message || `Server responded with status code ${xhr.status}`;
        const err = new Error(message);
        err.status = xhr.status;
        err.data = responseData;
        reject(err);
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network request failed. Could not reach server.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Network request timed out.'));
    };

    xhr.send(formData);
  });
};
