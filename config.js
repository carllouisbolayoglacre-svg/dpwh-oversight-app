// config.js
import Constants from 'expo-constants';

// 1. Resolve host IP address:
//    - Priority 1: EXPO_PUBLIC_LOCAL_IP environment variable (if defined)
//    - Priority 2: Automatically extract IP from Metro bundler host URI
//    - Priority 3: Fallback IP
const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
const autoDetectedIp = debuggerHost ? debuggerHost.split(':')[0] : null;

export const LOCAL_IP = process.env.EXPO_PUBLIC_LOCAL_IP || autoDetectedIp || '192.168.1.62';

if (__DEV__) {
  console.log(`[DPWH Config] Resolved Backend Server IP: ${LOCAL_IP}`);
}

export const API_URLS = {
  // Django endpoint for authentication
  LOGIN: `http://${LOCAL_IP}:8000/accounts/api/mobile-login/`,
  // Node.js endpoint for fetching assignments
  PROJECTS: `http://${LOCAL_IP}:5000/api/projects/`,
  // Node.js endpoint for image uploads
  UPLOAD: `http://${LOCAL_IP}:5000/api/upload-inspection/`,
};