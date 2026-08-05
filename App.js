import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { validateGeofence } from './utils';

export default function App() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState(null);
  const cameraRef = useRef(null);

  // Request Hardware Permissions on Startup
  useEffect(() => {
    (async () => {
      const locStatus = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locStatus.status === 'granted');
    })();
  }, []);

  if (!cameraPermission || locationPermission === null) {
    return <View><Text>Requesting permissions...</Text></View>;
  }

  if (!cameraPermission.granted || !locationPermission) {
    return (
      <View style={styles.container}>
        <Text>Camera and GPS permissions are required for DPWH Inspections.</Text>
        <TouchableOpacity onPress={requestCameraPermission} style={styles.btn}>
          <Text style={styles.btnText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // The Live-Capture Function
  const handleSecureCapture = async () => {
    if (cameraRef.current) {
      try {
        // 1. Capture Image & GPS
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        const currentLat = location.coords.latitude;
        const currentLon = location.coords.longitude;

        // MOCK PROJECT DATA: Let's assume the project site is exactly where you are standing right now, 
        // but offset slightly, with a 50-meter geofence_radius.
        const TARGET_PROJECT_LAT = 14.5995; 
        const TARGET_PROJECT_LON = 124.2386148;
        const GEOFENCE_RADIUS = 50; // in meters

        // 2. Validate Geofence
        const isWithinGeofence = validateGeofence(
          currentLat, currentLon, 
          TARGET_PROJECT_LAT, TARGET_PROJECT_LON, 
          GEOFENCE_RADIUS
        );

        if (!isWithinGeofence) {
           Alert.alert("Submission Rejected", "You are outside the registered project geofence.");
           return; // Stop the process
        }

        Alert.alert("Success", "Live image captured within geofence! Ready for hashing.");
        console.log("Secure Image:", photo.uri);

      } catch (error) {
        console.error("Capture Error:", error);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* The Camera fills the background using flex: 1 */}
      <CameraView style={styles.camera} ref={cameraRef} facing="back" />
      
      {/* The UI Container floats on top at the bottom of the screen */}
      <View style={styles.uiContainer}>
        <TouchableOpacity style={styles.captureBtn} onPress={handleSecureCapture}>
          <Text style={styles.btnText}>CAPTURE INFRASTRUCTURE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: 'black' 
  },
  camera: { 
    flex: 1 // This forces the camera to fill the entire container
  },
  uiContainer: { 
    position: 'absolute', 
    bottom: 50,           // Pushes the button up from the bottom edge
    width: '100%',        // Spans the full width of the screen
    alignItems: 'center', // Centers the button horizontally
    zIndex: 10            // Ensures the button sits above the camera view
  },
  captureBtn: { 
    backgroundColor: '#003366', 
    padding: 20, 
    borderRadius: 10,
    elevation: 5          // Adds a slight shadow on Android
  },
  btnText: { 
    color: 'white', 
    fontWeight: 'bold', 
    fontSize: 16 
  }
});

