import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator, 
  Dimensions 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { calculateDistance } from '../utils';
import { THEME } from '../theme';

const { width } = Dimensions.get('window');

export default function CameraScreen({ route, navigation }) {
  const { projectData } = route.params;
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [facing, setFacing] = useState('back');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraMountError, setCameraMountError] = useState(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showOverlays, setShowOverlays] = useState(true);
  const cameraRef = useRef(null);

  // Multi-Shot Inspection Photos State
  const [photos, setPhotos] = useState(route.params?.existingPhotos || route.params?.photos || []);

  useEffect(() => {
    if (route.params?.existingPhotos) {
      setPhotos(route.params.existingPhotos);
    }
  }, [route.params?.existingPhotos]);

  const targetLat = parseFloat(projectData?.latitude);
  const targetLon = parseFloat(projectData?.longitude);
  const geofenceRadius = parseFloat(projectData?.geofence_radius) || 100;

  // Initialize and track real-time GPS position for boundary overlay
  useEffect(() => {
    let subscriber = null;
    let isMounted = true;

    (async () => {
      // Auto-prompt camera permission on mount if needed
      if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
        try {
          await requestCameraPermission();
        } catch (camErr) {
          console.warn('Camera permission request error on mount:', camErr);
        }
      }

      const locStatus = await Location.requestForegroundPermissionsAsync();
      if (!isMounted) return;
      setLocationPermission(locStatus.status === 'granted');

      if (locStatus.status === 'granted') {
        try {
          // Initial fast fetch
          const initial = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          if (isMounted) {
            setCurrentLocation(initial);
            setGpsAccuracy(initial.coords.accuracy);
          }

          // Real-time position tracking for dynamic HUD boundary overlay
          subscriber = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 1500,
              distanceInterval: 1,
            },
            (newLoc) => {
              if (isMounted) {
                setCurrentLocation(newLoc);
                setGpsAccuracy(newLoc.coords.accuracy);
              }
            }
          );
        } catch (err) {
          console.warn('Real-time location watch error:', err);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (subscriber) {
        subscriber.remove();
      }
    };
  }, []);

  const handleRequestAllPermissions = async () => {
    try {
      if (!cameraPermission?.granted) {
        await requestCameraPermission();
      }
      const locStatus = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locStatus.status === 'granted');
    } catch (err) {
      console.warn('Permission request error:', err);
    }
  };

  const toggleCameraFacing = () => {
    setIsCameraReady(false);
    setCameraMountError(null);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  // Compute live distance and geofence state
  let liveDistance = null;
  let isInsideBoundary = false;

  if (currentLocation && !isNaN(targetLat) && !isNaN(targetLon)) {
    liveDistance = calculateDistance(
      currentLocation.coords.latitude,
      currentLocation.coords.longitude,
      targetLat,
      targetLon
    );
    isInsideBoundary = !isNaN(liveDistance) && liveDistance <= geofenceRadius;
  }

  // Permission handling
  if (!cameraPermission || locationPermission === null) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME.colors.primary} />
        <Text style={styles.loadingStatusText}>INITIALIZING SENSORS & GPS...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted || !locationPermission) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.permissionCard}>
          <MaterialCommunityIcons name="shield-alert" size={54} color={THEME.colors.danger} />
          <Text style={styles.permissionTitle}>HARDWARE ACCESS REQUIRED</Text>
          <Text style={styles.permissionDesc}>
            DPWH Oversight protocol requires calibrated camera optics and live GPS tracking to verify infrastructure location.
          </Text>
          <TouchableOpacity 
            style={styles.permissionBtn} 
            onPress={handleRequestAllPermissions}
            activeOpacity={0.8}
          >
            <Text style={styles.permissionBtnText}>GRANT CAMERA & GPS PERMISSIONS</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleSecureCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    if (!isCameraReady) {
      Alert.alert(
        'Camera Initializing',
        'Please wait a moment for the camera optics to initialize before capturing.'
      );
      return;
    }

    try {
      setIsCapturing(true);

      if (isNaN(targetLat) || isNaN(targetLon) || isNaN(geofenceRadius)) {
        Alert.alert(
          'Project Configuration Error',
          'Project coordinates or geofence boundary are missing or invalid.'
        );
        setIsCapturing(false);
        return;
      }

      // 1. Capture hardware sensor photo
      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.85,
        skipProcessing: false,
      });

      // 2. Fetch fresh high-precision GPS lock
      const freshLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const currentLat = freshLocation.coords.latitude;
      const currentLon = freshLocation.coords.longitude;
      const accuracy = freshLocation.coords.accuracy || 0;

      // 3. Check GPS accuracy threshold for outdoor field inspection
      if (accuracy > 80) {
        Alert.alert(
          'Weak GPS Signal',
          `GPS accuracy is ±${Math.round(accuracy)}m. To prevent fraudulent or unverified logs, please stand under open sky and wait for a stronger satellite fix.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Retry Under Open Sky', 
              onPress: () => setIsCapturing(false) 
            }
          ]
        );
        setIsCapturing(false);
        return;
      }

      // 4. Validate geofence boundary
      const finalDistance = calculateDistance(currentLat, currentLon, targetLat, targetLon);
      const withinGeofence = !isNaN(finalDistance) && finalDistance <= geofenceRadius;

      if (!withinGeofence) {
        const excess = isNaN(finalDistance) ? 'unknown' : Math.round(finalDistance - geofenceRadius);
        Alert.alert(
          'Boundary Breach Warning',
          `You are approximately ${excess}m outside the authorized ${geofenceRadius}m project boundary. Move closer to the site before capturing.`,
          [
            { text: 'Acknowledge', style: 'cancel', onPress: () => setIsCapturing(false) }
          ]
        );
        setIsCapturing(false);
        return;
      }

      // 5. Append to multi-shot photo array
      const capturedItem = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        uri: photo.uri,
        latitude: currentLat,
        longitude: currentLon,
        altitude: freshLocation.coords.altitude || 0,
        accuracy: accuracy,
        distance: finalDistance,
        geofenceStatus: 'Inside',
        capturedAt: new Date().toISOString(),
      };

      setPhotos((prev) => [...prev, capturedItem]);
      setIsCapturing(false);

    } catch (error) {
      console.error('Capture pipeline error:', error);
      Alert.alert('Capture Failed', 'Camera or GPS hardware could not complete the operation.');
      setIsCapturing(false);
    }
  };

  const handleCapture = handleSecureCapture;

  const handleReviewPhotos = () => {
    if (photos.length === 0) return;
    navigation.navigate('PhotoGallery', {
      projectData,
      photos,
    });
  };

  const handleBackPress = () => {
    if (photos.length > 0) {
      Alert.alert(
        'Unsaved Batch Photos',
        `You have ${photos.length} captured photo(s) in this session. What would you like to do?`,
        [
          { text: 'Keep Taking Photos', style: 'cancel' },
          { 
            text: 'Review Photos', 
            onPress: handleReviewPhotos 
          },
          { 
            text: 'Discard & Exit', 
            style: 'destructive', 
            onPress: () => navigation.goBack() 
          },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      {/* Hardware Camera View with focus management */}
      {isFocused && (
        <CameraView 
          style={styles.camera} 
          ref={cameraRef} 
          facing={facing}
          enableTorch={facing === 'back' && isTorchOn}
          onCameraReady={() => setIsCameraReady(true)}
          onMountError={(error) => {
            console.warn('Camera mount error:', error);
            setCameraMountError(error?.message || 'Camera hardware could not be initialized.');
          }}
        />
      )}

      {/* Camera Loading Overlay */}
      {isFocused && !isCameraReady && !cameraMountError && (
        <View style={styles.cameraLoadingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={THEME.colors.primary} />
          <Text style={styles.cameraLoadingText}>INITIALIZING CAMERA FEED...</Text>
        </View>
      )}

      {/* Camera Mount Error Overlay */}
      {cameraMountError && (
        <View style={styles.cameraErrorOverlay}>
          <MaterialCommunityIcons name="camera-off" size={48} color={THEME.colors.danger} />
          <Text style={styles.cameraErrorTitle}>CAMERA PREVIEW UNAVAILABLE</Text>
          <Text style={styles.cameraErrorDesc}>{cameraMountError}</Text>
          <TouchableOpacity 
            style={styles.switchCameraBtn} 
            onPress={toggleCameraFacing}
            activeOpacity={0.8}
          >
            <Ionicons name="camera-reverse" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.switchCameraBtnText}>SWITCH CAMERA</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* --- TOP HUD: PROJECT & SATELLITE STATUS --- */}
      <View style={[styles.topHudContainer, { paddingTop: Math.max(insets.top, 12) }]}>
        {/* Navigation & Utilities Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity 
            style={styles.hudIconBtn} 
            onPress={handleBackPress}
            accessibilityLabel="Back to Projects"
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {showOverlays ? (
            <View style={styles.projectPill}>
              <Text style={styles.projectCodeText}>ID #{projectData.project_id}</Text>
              <Text style={styles.projectNameText} numberOfLines={1}>
                {projectData.project_name}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <View style={styles.navActionButtons}>
            {/* Viewfinder Overlays Toggle (Show / Hide UI) */}
            <TouchableOpacity 
              style={[styles.hudIconBtn, !showOverlays && styles.hudIconBtnActive]} 
              onPress={() => setShowOverlays(!showOverlays)}
              accessibilityLabel={showOverlays ? "Hide Overlays" : "Show Overlays"}
              activeOpacity={0.8}
            >
              <Ionicons 
                name={showOverlays ? "eye-outline" : "eye-off-outline"} 
                size={22} 
                color={showOverlays ? "#FFFFFF" : THEME.colors.hudAccent} 
              />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.hudIconBtn} 
              onPress={toggleCameraFacing}
              accessibilityLabel="Flip Camera"
              activeOpacity={0.8}
            >
              <Ionicons name="camera-reverse-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.hudIconBtn, isTorchOn && styles.hudIconBtnActive]} 
              onPress={() => setIsTorchOn(!isTorchOn)}
              accessibilityLabel="Toggle Torch"
              activeOpacity={0.8}
            >
              <Ionicons 
                name={isTorchOn ? "flashlight" : "flashlight-outline"} 
                size={22} 
                color={isTorchOn ? THEME.colors.hudAccent : "#FFFFFF"} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Boundary & GPS Telemetry Banner (Collapsible) */}
        {showOverlays && (
          <View style={styles.telemetryBanner}>
            {/* Geofence Status Indicator */}
            <View style={[
              styles.boundaryBadge, 
              isInsideBoundary ? styles.boundaryBadgeInside : styles.boundaryBadgeOutside
            ]}>
              <Ionicons 
                name={isInsideBoundary ? "shield-checkmark" : "warning"} 
                size={18} 
                color="#FFFFFF" 
              />
              <Text style={styles.boundaryBadgeText}>
                {liveDistance === null 
                  ? 'ACQUIRING BOUNDARY...' 
                  : isInsideBoundary 
                    ? `VERIFIED IN BOUNDARY (${Math.round(liveDistance)}m / ${geofenceRadius}m)` 
                    : `OUTSIDE PERIMETER (${Math.round(liveDistance)}m > ${geofenceRadius}m)`
                }
              </Text>
            </View>

            {/* Real-time GPS Fix & Precision readout */}
            <View style={styles.gpsReadoutRow}>
              <View style={styles.gpsMetric}>
                <MaterialCommunityIcons name="crosshairs-gps" size={15} color={THEME.colors.hudAccent} />
                <Text style={styles.gpsMetricLabel}>PRECISION:</Text>
                <Text style={styles.gpsMetricValue}>
                  {gpsAccuracy !== null ? `±${Math.round(gpsAccuracy)}m` : 'SEARCHING...'}
                </Text>
              </View>

              <View style={styles.gpsMetric}>
                <MaterialCommunityIcons name="satellite-variant" size={15} color={THEME.colors.reticle} />
                <Text style={styles.gpsMetricLabel}>TARGET:</Text>
                <Text style={styles.gpsMetricValue}>
                  {targetLat.toFixed(4)}, {targetLon.toFixed(4)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* --- CENTER VIEWFINDER: FRAME BRACKETS (NO CROSSHAIR) --- */}
      {showOverlays && (
        <View style={styles.viewfinderCenter} pointerEvents="none">
          {/* Corner Brackets */}
          <View style={styles.reticleBox}>
            {/* Top-Left Corner */}
            <View style={[styles.cornerBracket, styles.bracketTopLeft]} />
            {/* Top-Right Corner */}
            <View style={[styles.cornerBracket, styles.bracketTopRight]} />
            {/* Bottom-Left Corner */}
            <View style={[styles.cornerBracket, styles.bracketBottomLeft]} />
            {/* Bottom-Right Corner */}
            <View style={[styles.cornerBracket, styles.bracketBottomRight]} />

            {/* Frame Label */}
            <View style={styles.frameLabelBadge}>
              <Text style={styles.frameLabelText}>DPWH GEO-SURVEY FIELD FRAME</Text>
            </View>
          </View>
        </View>
      )}

      {/* --- BOTTOM CONTROLS & GLOVE-FRIENDLY SHUTTER --- */}
      <View style={[styles.bottomControlContainer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Warning chip if outside perimeter */}
        {!isInsideBoundary && liveDistance !== null && (
          <View style={styles.warningAlertStrip}>
            <Ionicons name="alert-circle" size={18} color="#FFFFFF" />
            <Text style={styles.warningAlertText}>
              MOVE {Math.round(liveDistance - geofenceRadius)}m CLOSER TO ENABLE CAPTURE
            </Text>
          </View>
        )}

        {/* Floating counter badge & Review Photos button (visible when photos.length >= 1) */}
        {photos.length >= 1 && (
          <View style={styles.floatingReviewBar}>
            <View style={styles.counterBadge}>
              <Ionicons name="images" size={17} color={THEME.colors.hudAccent} />
              <Text style={styles.counterBadgeText}>
                {photos.length} {photos.length === 1 ? 'Photo' : 'Photos'} Captured
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.reviewPhotosBtn} 
              onPress={handleReviewPhotos}
              activeOpacity={0.8}
            >
              <Text style={styles.reviewPhotosBtnText}>REVIEW PHOTOS</Text>
              <Ionicons name="arrow-forward-circle" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* Large Glove-Friendly Trigger Area */}
        <View style={styles.triggerRow}>
          {isCapturing ? (
            <View style={styles.capturingIndicator}>
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text style={styles.capturingText}>LOCKING GPS & TELEMETRY...</Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={[
                styles.ruggedShutterBtn,
                !isInsideBoundary && styles.ruggedShutterBtnLocked
              ]} 
              onPress={handleCapture}
              activeOpacity={0.8}
            >
              <View style={styles.shutterInnerCircle}>
                <Ionicons 
                  name="camera" 
                  size={32} 
                  color="#FFFFFF" 
                />
              </View>
              <Text style={styles.shutterBtnLabel}>
                {isInsideBoundary 
                  ? (photos.length > 0 ? 'SNAP ADDITIONAL PHOTO' : 'RECORD & VERIFY') 
                  : 'PERIMETER LOCKED'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Utilitarian instruction strip */}
        <Text style={styles.footerHelpText}>
          Position infrastructure within frame brackets
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    width: '100%',
    height: '100%',
  },
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 5,
  },
  cameraLoadingText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cameraErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 24,
    zIndex: 15,
  },
  cameraErrorTitle: {
    marginTop: 14,
    color: THEME.colors.danger,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  cameraErrorDesc: {
    marginTop: 8,
    color: THEME.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  switchCameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: THEME.metrics.borderRadiusMd,
  },
  switchCameraBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  navActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingStatusText: {
    marginTop: 16,
    color: THEME.colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.8,
  },
  permissionCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.metrics.borderRadiusLg,
    padding: 28,
    alignItems: 'center',
    borderWidth: THEME.metrics.borderWidthRugged,
    borderColor: THEME.colors.borderStrong,
    elevation: 6,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionBtn: {
    backgroundColor: THEME.colors.primary,
    height: THEME.metrics.buttonHeight,
    borderRadius: THEME.metrics.borderRadiusMd,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },

  /* Top HUD */
  topHudContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  hudIconBtn: {
    width: THEME.metrics.touchTargetMin,
    height: THEME.metrics.touchTargetMin,
    borderRadius: THEME.metrics.borderRadiusMd,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  hudIconBtnActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.hudAccent,
  },
  projectPill: {
    flex: 1,
    marginHorizontal: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  projectCodeText: {
    color: THEME.colors.hudAccent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  projectNameText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  telemetryBanner: {
    marginTop: 4,
  },
  boundaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  boundaryBadgeInside: {
    backgroundColor: THEME.colors.success,
    borderColor: '#34D399',
  },
  boundaryBadgeOutside: {
    backgroundColor: THEME.colors.danger,
    borderColor: '#F87171',
  },
  boundaryBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 6,
    letterSpacing: 0.6,
  },
  gpsReadoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  gpsMetric: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gpsMetricLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
    marginRight: 4,
  },
  gpsMetricValue: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  /* Center Viewfinder Reticle */
  viewfinderCenter: {
    position: 'absolute',
    top: 140,
    bottom: 180,
    left: 20,
    right: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  reticleBox: {
    width: width - 50,
    height: (width - 50) * 0.9,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerBracket: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: THEME.colors.reticle,
  },
  bracketTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
  },
  bracketTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
  },
  bracketBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
  },
  bracketBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
  },
  frameLabelBadge: {
    position: 'absolute',
    bottom: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  frameLabelText: {
    color: THEME.colors.reticle,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  /* Bottom Controls */
  bottomControlContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    paddingTop: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  warningAlertStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: THEME.metrics.borderRadiusSm,
    marginBottom: 12,
    width: '100%',
    justifyContent: 'center',
  },
  warningAlertText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 6,
  },
  triggerRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  capturingIndicator: {
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  capturingText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  ruggedShutterBtn: {
    width: '100%',
    height: 64,
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.metrics.borderRadiusMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  ruggedShutterBtnLocked: {
    backgroundColor: '#475569',
    borderColor: '#94A3B8',
  },
  shutterInnerCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  shutterBtnLabel: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 0.8,
  },
  footerHelpText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  floatingReviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30, 41, 59, 0.96)',
    borderWidth: 1.5,
    borderColor: THEME.colors.hudAccent,
    borderRadius: THEME.metrics.borderRadiusMd,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    width: '100%',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  counterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.4)',
  },
  counterBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 6,
    letterSpacing: 0.4,
  },
  reviewPhotosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 3,
  },
  reviewPhotosBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.6,
  },
});