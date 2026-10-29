import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { API_URLS } from '../config';
import { THEME } from '../theme';
import { calculateDistance, fetchWithTimeout } from '../utils';

const { width } = Dimensions.get('window');

// Default verified DPWH fallback project so SiteMap is NEVER blank when offline
const DEFAULT_FALLBACK_PROJECTS = [
  {
    project_id: '1',
    project_name: 'Tibanga Highway Rehabilitation',
    latitude: '8.2326000',
    longitude: '124.2386000',
    geofence_radius: '100.00',
  },
];

export default function ProjectMapScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { userToken } = useAuth();
  const webviewRef = useRef(null);
  const locationWatcherRef = useRef(null);
  const isLeafletReadyRef = useRef(false);

  // Initial project optionally passed via route params
  const paramProject = route.params?.projectData || route.params?.project || null;

  // --- COMPONENT STATE ---
  const [projects, setProjects] = useState(
    paramProject ? [paramProject] : DEFAULT_FALLBACK_PROJECTS
  );
  // Default to paramProject if opened via "VIEW GEOFENCE", otherwise null for overview
  const [selectedProjectId, setSelectedProjectId] = useState(paramProject?.project_id || null);
  const [userLocation, setUserLocation] = useState(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(null);
  const [isCardCollapsed, setIsCardCollapsed] = useState(false);

  // Keep refs for asynchronous Leaflet bridge pushes
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const selectedProjectIdRef = useRef(selectedProjectId);
  selectedProjectIdRef.current = selectedProjectId;

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  // Sync route params if navigation updates them
  useEffect(() => {
    if (paramProject) {
      setProjects((prev) => {
        const exists = prev.some((p) => String(p.project_id) === String(paramProject.project_id));
        return exists ? prev : [paramProject, ...prev];
      });
      setSelectedProjectId(paramProject.project_id);
    }
  }, [paramProject]);

  // --- 1. FETCH ASSIGNED PROJECTS FROM BACKEND ---
  const fetchAssignedProjects = async () => {
    try {
      if (userToken) {
        const response = await fetchWithTimeout(API_URLS.PROJECTS, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${userToken}`,
          },
        });
        const data = await response.json();

        if (response.ok && data.success && Array.isArray(data.projects)) {
          const normalizedProjects = data.projects.map((project) => ({
            ...project,
            project_id: project.project_id ?? project.id,
          }));
          const validProjects = normalizedProjects.filter((p) => {
            const lat = parseFloat(p.latitude);
            const lon = parseFloat(p.longitude);
            return Number.isFinite(lat) && Number.isFinite(lon);
          });

          if (validProjects.length > 0) {
            setProjects(validProjects);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[ProjectMapScreen] Backend fetch error:', err.message);
    }

    // Keep fallback or paramProject if fetch fails
    if (!paramProject && (!projects || projects.length === 0)) {
      setProjects(DEFAULT_FALLBACK_PROJECTS);
    }
  };

  useEffect(() => {
    fetchAssignedProjects();
  }, [userToken]);

  // --- 2. FOREGROUND GPS LOCATION TRACKING ---
  useEffect(() => {
    let isMounted = true;

    const setupLocationTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;

        if (status !== 'granted') {
          setHasLocationPermission(false);
          Alert.alert(
            'GPS Permission Required',
            'Precise location access is required to calculate real-time proximity to DPWH project geofences.'
          );
          return;
        }

        setHasLocationPermission(true);

        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (isMounted && initialLocation?.coords) {
          setUserLocation(initialLocation.coords);
        }

        locationWatcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 2,
          },
          (newLoc) => {
            if (isMounted && newLoc?.coords) {
              setUserLocation(newLoc.coords);
            }
          }
        );
      } catch (err) {
        console.error('[ProjectMapScreen] Location tracking error:', err);
        if (isMounted) setHasLocationPermission(false);
      }
    };

    setupLocationTracking();

    return () => {
      isMounted = false;
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
    };
  }, []);

  // --- 3. DERIVED SELECTED PROJECT & PROXIMITY CALCULATIONS ---
  const selectedProject = useMemo(() => {
    if (!selectedProjectId || !projects || projects.length === 0) return null;
    return projects.find((p) => String(p.project_id) === String(selectedProjectId)) || null;
  }, [projects, selectedProjectId]);

  const targetLat = selectedProject ? parseFloat(selectedProject.latitude) : NaN;
  const targetLon = selectedProject ? parseFloat(selectedProject.longitude) : NaN;
  const geofenceRadius = selectedProject ? parseFloat(selectedProject.geofence_radius) || 100 : 100;

  // Real-time distance calculation via Haversine formula
  const distance = useMemo(() => {
    if (!userLocation || !Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return null;
    return calculateDistance(userLocation.latitude, userLocation.longitude, targetLat, targetLon);
  }, [userLocation, targetLat, targetLon]);

  const isInsideGeofence = distance !== null && !isNaN(distance) && distance <= geofenceRadius;

  const isInsideGeofenceRef = useRef(isInsideGeofence);
  isInsideGeofenceRef.current = isInsideGeofence;

  // Formatted distance display
  const distanceFormatted = useMemo(() => {
    if (!selectedProject) return '';
    if (distance === null || isNaN(distance)) return 'Acquiring GPS...';
    if (distance < 1000) return `${Math.round(distance)} m away`;
    return `${(distance / 1000).toFixed(2)} km away`;
  }, [distance, selectedProject]);

  // --- 4. UNIFIED PUSH SYNCHRONIZATION WITH LEAFLET ---
  // Push latest React Native state to Leaflet without ever reloading the WebView
  const pushStateToMap = () => {
    if (!isLeafletReadyRef.current || !webviewRef.current) return;

    const payload = {
      projects: projectsRef.current,
      selectedProjectId: selectedProjectIdRef.current,
      userLocation: userLocationRef.current
        ? {
            latitude: parseFloat(userLocationRef.current.latitude),
            longitude: parseFloat(userLocationRef.current.longitude),
            accuracy: parseFloat(userLocationRef.current.accuracy) || 10,
          }
        : null,
      isInsideGeofence: isInsideGeofenceRef.current,
    };

    webviewRef.current.injectJavaScript(`
      if (window.syncMapState) {
        window.syncMapState(${JSON.stringify(payload)});
      }
      true;
    `);
  };

  // Synchronize whenever projects, selection, location, or geofence status changes
  useEffect(() => {
    pushStateToMap();
  }, [projects, selectedProjectId, userLocation, isInsideGeofence]);

  // --- ACTIONS ---
  const handleLaunchCamera = () => {
    if (!selectedProject) {
      Alert.alert('No Project Selected', 'Please tap a project on the map first.');
      return;
    }

    if (isInsideGeofence) {
      navigation.navigate('Camera', { projectData: selectedProject });
    } else {
      Alert.alert(
        'Outside Geofence Perimeter',
        `You are currently ${distanceFormatted} from ${selectedProject.project_name} (authorized radius: ${geofenceRadius}m).\n\nStandard DPWH protocol requires photos to be taken within the project boundary. Do you want to proceed with a field override?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Proceed with Override',
            onPress: () => navigation.navigate('Camera', { projectData: selectedProject }),
          },
        ]
      );
    }
  };

  const centerOnUser = () => {
    if (!userLocation) {
      Alert.alert('Acquiring Signal', 'Waiting for live GPS fix from satellite...');
      return;
    }
    webviewRef.current?.injectJavaScript(`
      if (window.flyToCoords) {
        window.flyToCoords(${parseFloat(userLocation.latitude)}, ${parseFloat(userLocation.longitude)});
      }
      true;
    `);
  };

  const centerOnSelectedProject = () => {
    if (selectedProject && Number.isFinite(targetLat) && Number.isFinite(targetLon)) {
      webviewRef.current?.injectJavaScript(`
        if (window.flyToCoords) {
          window.flyToCoords(${targetLat}, ${targetLon});
        }
        true;
      `);
    } else if (projects.length > 0) {
      fitUserAndProject();
    } else {
      Alert.alert('No Project Selected', 'Tap any project circle or pin on the map to inspect its site.');
    }
  };

  const fitUserAndProject = () => {
    if (!webviewRef.current) return;
    const uLat = userLocation?.latitude ? parseFloat(userLocation.latitude) : null;
    const uLon = userLocation?.longitude ? parseFloat(userLocation.longitude) : null;

    webviewRef.current.injectJavaScript(`
      if (window.fitAllBounds) {
        window.fitAllBounds(${uLat}, ${uLon});
      }
      true;
    `);
  };

  // Handle messages posted from Leaflet WebView
  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'LEAFLET_READY') {
        isLeafletReadyRef.current = true;
        pushStateToMap();
      } else if (data.type === 'PROJECT_SELECTED') {
        setSelectedProjectId(data.projectId);
      } else if (data.type === 'DESELECT_ALL') {
        setSelectedProjectId(null);
      }
    } catch (err) {
      console.warn('[ProjectMapScreen] WebView message parse error:', err);
    }
  };

  // --- COMPLETELY STATIC LEAFLET 1.9.4 HTML ---
  // Memoized with empty dependency array [] so WebView NEVER unmounts or reloads!
  const leafletHtml = useMemo(() => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body, #map {
            width: 100%;
            height: 100%;
            background: #EEF2F6;
            overflow: hidden;
          }
          /* Live Pulsing User GPS Marker */
          .user-pulse-marker {
            position: relative;
            width: 24px;
            height: 24px;
          }
          .user-pulse-dot {
            width: 14px;
            height: 14px;
            background: #007AFF;
            border: 2.5px solid #FFFFFF;
            border-radius: 50%;
            position: absolute;
            top: 5px;
            left: 5px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          }
          .user-pulse-wave {
            width: 24px;
            height: 24px;
            background: rgba(0, 122, 255, 0.35);
            border-radius: 50%;
            position: absolute;
            top: 0;
            left: 0;
            animation: pulse 2s infinite ease-out;
          }
          @keyframes pulse {
            0% { transform: scale(0.6); opacity: 1; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          /* DPWH Project Marker Pin */
          .dpwh-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            background: #003366;
            border: 2px solid #FFFFFF;
            border-radius: 50%;
            color: #FFFFFF;
            font-size: 11px;
            font-weight: 800;
            box-shadow: 0 3px 8px rgba(0,0,0,0.35);
            cursor: pointer;
            transition: all 0.25s ease;
          }
          .dpwh-pin.selected {
            background: #003366;
            border: 3px solid #F59E0B;
            transform: scale(1.18);
            box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);
          }
          .dpwh-pin.other {
            background: #475569;
            opacity: 0.9;
          }
          /* Custom Leaflet Popup */
          .leaflet-popup-content-wrapper {
            background: #FFFFFF;
            border-radius: 8px;
            border: 2px solid #003366;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          }
          .leaflet-popup-content {
            margin: 10px 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .popup-code {
            font-size: 10px;
            font-weight: 900;
            color: #003366;
            margin-bottom: 2px;
          }
          .popup-title {
            font-size: 13px;
            font-weight: 800;
            color: #0F172A;
            margin-bottom: 4px;
          }
          .popup-specs {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = null;
          var userMarker = null;
          var userAccCircle = null;
          var projectLayers = {};
          var currentSelectedId = null;
          var hasAutoFitted = false;
          window.__pendingState = null;

          var userIcon = null;

          function initMap() {
            if (map) return;
            map = L.map('map', {
              zoomControl: false,
              attributionControl: false
            }).setView([8.2326, 124.2386], 15);

            // Esri World Street Map Tiles (Zero API key requirement)
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/' + '{z}/{y}/{x}', {
              attribution: 'Tiles © Esri',
              maxZoom: 19
            }).addTo(map);

            userIcon = L.divIcon({
              className: 'user-pulse-marker',
              html: '<div class="user-pulse-wave"></div><div class="user-pulse-dot"></div>',
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            });

            // Tap map background to deselect all
            map.on('click', function(e) {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'DESELECT_ALL'
                }));
              }
            });

            // Apply any state that arrived before map was ready
            if (window.__pendingState) {
              window.syncMapState(window.__pendingState);
              window.__pendingState = null;
            }

            // Notify React Native that Leaflet is fully initialized
            function notifyReady() {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LEAFLET_READY' }));
              } else {
                setTimeout(notifyReady, 50);
              }
            }
            notifyReady();
          }

          // Polling check ensuring Leaflet library is ready before init
          function checkLeaflet() {
            if (typeof L !== 'undefined') {
              initMap();
            } else {
              setTimeout(checkLeaflet, 50);
            }
          }
          checkLeaflet();

          // Main synchronization function invoked from React Native
          window.syncMapState = function(state) {
            if (!map) {
              window.__pendingState = state;
              return;
            }
            if (!state) return;

            currentSelectedId = state.selectedProjectId;

            // 1. User GPS Position & Accuracy Ring
            if (state.userLocation) {
              var uLat = state.userLocation.latitude;
              var uLon = state.userLocation.longitude;
              var uAcc = state.userLocation.accuracy || 15;

              if (!userMarker) {
                userMarker = L.marker([uLat, uLon], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
              } else {
                userMarker.setLatLng([uLat, uLon]);
              }

              if (!userAccCircle) {
                userAccCircle = L.circle([uLat, uLon], {
                  radius: uAcc,
                  color: '#007AFF',
                  fillColor: '#007AFF',
                  fillOpacity: 0.1,
                  weight: 1
                }).addTo(map);
              } else {
                userAccCircle.setLatLng([uLat, uLon]);
                userAccCircle.setRadius(uAcc);
              }
            }

            // 2. Render / Update All Project Circles & Markers
            if (state.projects && Array.isArray(state.projects) && state.projects.length > 0) {
              var existingIds = Object.keys(projectLayers);
              var newIds = state.projects.map(function(p) { return String(p.project_id); });
              var needsRebuild = existingIds.length !== newIds.length || !newIds.every(function(id) { return projectLayers[id]; });

              if (needsRebuild) {
                existingIds.forEach(function(id) {
                  if (projectLayers[id].circle) map.removeLayer(projectLayers[id].circle);
                  if (projectLayers[id].marker) map.removeLayer(projectLayers[id].marker);
                });
                projectLayers = {};

                state.projects.forEach(function(p) {
                  var pLat = parseFloat(p.latitude);
                  var pLon = parseFloat(p.longitude);
                  var pRad = parseFloat(p.geofence_radius) || 100;
                  if (isNaN(pLat) || isNaN(pLon)) return;

                  var pid = String(p.project_id);
                  var isSel = currentSelectedId !== null && String(currentSelectedId) === pid;

                  // Geofence Circle
                  var circle = L.circle([pLat, pLon], {
                    radius: pRad,
                    color: isSel ? (state.isInsideGeofence ? '#2e7d32' : '#003366') : '#64748B',
                    weight: isSel ? 3 : 2,
                    fillColor: isSel ? (state.isInsideGeofence ? '#4caf50' : '#003366') : '#94A3B8',
                    fillOpacity: isSel ? 0.25 : 0.15
                  }).addTo(map);

                  circle.on('click', function(e) {
                    if (e) L.DomEvent.stopPropagation(e);
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'PROJECT_SELECTED',
                        projectId: p.project_id
                      }));
                    }
                  });

                  // Marker Pin
                  var pinIcon = L.divIcon({
                    className: 'dpwh-marker-container',
                    html: '<div class="dpwh-pin ' + (isSel ? 'selected' : 'other') + '">#' + p.project_id + '</div>',
                    iconSize: [34, 34],
                    iconAnchor: [17, 17]
                  });

                  var marker = L.marker([pLat, pLon], { icon: pinIcon }).addTo(map);

                  var popupContent = '<div class="popup-code">DPWH PROJECT #' + p.project_id + '</div>' +
                                     '<div class="popup-title">' + (p.project_name || 'Project Site') + '</div>' +
                                     '<div class="popup-specs">Geofence Radius: ' + pRad + 'm</div>';
                  marker.bindPopup(popupContent, { offset: [0, -10] });

                  marker.on('click', function(e) {
                    if (e) L.DomEvent.stopPropagation(e);
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'PROJECT_SELECTED',
                        projectId: p.project_id
                      }));
                    }
                  });

                  projectLayers[pid] = { circle: circle, marker: marker, lat: pLat, lon: pLon, radius: pRad };
                });
              }

              // Update selection styling without recreating DOM nodes
              Object.keys(projectLayers).forEach(function(pid) {
                var item = projectLayers[pid];
                if (!item) return;
                var isSel = currentSelectedId !== null && String(currentSelectedId) === pid;

                if (item.circle) {
                  if (isSel) {
                    item.circle.setStyle({
                      color: state.isInsideGeofence ? '#2e7d32' : '#003366',
                      weight: 3,
                      fillColor: state.isInsideGeofence ? '#4caf50' : '#003366',
                      fillOpacity: 0.25
                    });
                    item.circle.bringToFront();
                  } else {
                    item.circle.setStyle({
                      color: '#64748B',
                      weight: 2,
                      fillColor: '#94A3B8',
                      fillOpacity: 0.15
                    });
                  }
                }

                if (item.marker) {
                  var el = item.marker.getElement();
                  if (el) {
                    var pinDiv = el.querySelector('.dpwh-pin');
                    if (pinDiv) {
                      if (isSel) {
                        pinDiv.classList.add('selected');
                        pinDiv.classList.remove('other');
                      } else {
                        pinDiv.classList.remove('selected');
                        pinDiv.classList.add('other');
                      }
                    }
                  }
                  if (isSel) {
                    item.marker.openPopup();
                  } else {
                    item.marker.closePopup();
                  }
                }
              });

              // Initial Auto-Fit bounds
              if (!hasAutoFitted && state.projects.length > 0) {
                hasAutoFitted = true;
                if (currentSelectedId && projectLayers[String(currentSelectedId)]) {
                  var targetItem = projectLayers[String(currentSelectedId)];
                  map.setView([targetItem.lat, targetItem.lon], 16);
                } else {
                  var pts = [];
                  if (state.userLocation) {
                    pts.push([state.userLocation.latitude, state.userLocation.longitude]);
                  }
                  Object.keys(projectLayers).forEach(function(pid) {
                    var item = projectLayers[pid];
                    pts.push([item.lat, item.lon]);
                  });
                  if (pts.length === 1) {
                    map.setView(pts[0], 16);
                  } else if (pts.length > 1) {
                    map.fitBounds(L.latLngBounds(pts), { padding: [60, 60] });
                  }
                }
              }
            }
          };

          window.flyToCoords = function(lat, lon) {
            if (map && !isNaN(lat) && !isNaN(lon)) {
              map.flyTo([lat, lon], 16, { animate: true, duration: 0.8 });
            }
          };

          window.fitAllBounds = function(uLat, uLon) {
            if (!map) return;
            var pts = [];
            if (uLat !== null && !isNaN(uLat) && uLon !== null && !isNaN(uLon)) {
              pts.push([uLat, uLon]);
            }
            Object.keys(projectLayers).forEach(function(pid) {
              var item = projectLayers[pid];
              if (item && item.marker) {
                pts.push([item.lat, item.lon]);
              }
            });
            if (pts.length > 0) {
              if (pts.length === 1) {
                map.flyTo(pts[0], 16, { animate: true, duration: 0.8 });
              } else {
                map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], animate: true });
              }
            }
          };
        </script>
      </body>
      </html>
    `;
  }, []);

  return (
    <View style={styles.container}>
      {/* 1. EMBEDDED LEAFLET MAP VIEW VIA REACT-NATIVE-WEBVIEW */}
      <WebView
        ref={webviewRef}
        style={StyleSheet.absoluteFillObject}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        source={{ html: leafletHtml }}
        onMessage={handleWebViewMessage}
      />

      {/* 2. TOP TACTICAL CONTROL BAR */}
      <View style={[styles.topBar, { top: insets.top + 10 }]}>
        <View style={styles.topBarLeft}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>DPWH GIS OVERSIGHT</Text>
          </View>
          {userLocation?.accuracy && (
            <View
              style={[
                styles.accuracyBadge,
                userLocation.accuracy <= 15
                  ? styles.accHigh
                  : userLocation.accuracy <= 30
                  ? styles.accMed
                  : styles.accLow,
              ]}
            >
              <MaterialCommunityIcons name="crosshairs-gps" size={13} color="#FFFFFF" />
              <Text style={styles.accuracyText}>
                ±{Math.round(userLocation.accuracy)}m GPS
              </Text>
            </View>
          )}
        </View>

        {/* Quick Map Controls (Fit bounds, target site, my location) */}
        <View style={styles.quickToolsRow}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={fitUserAndProject}
            activeOpacity={0.8}
            accessibilityLabel="Fit inspector and all sites"
          >
            <MaterialCommunityIcons
              name="arrow-expand-all"
              size={20}
              color={THEME.colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolButton}
            onPress={centerOnSelectedProject}
            activeOpacity={0.8}
            accessibilityLabel="Center on selected site"
          >
            <MaterialCommunityIcons
              name="target"
              size={21}
              color={THEME.colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolButton, styles.userLocButton]}
            onPress={centerOnUser}
            activeOpacity={0.8}
            accessibilityLabel="Center on current GPS position"
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. CONDITIONAL BOTTOM HUD: HINT PILL (WHEN NO SITE SELECTED) vs FULL HUD CARD (WHEN SELECTED) */}
      {!selectedProject ? (
        <View style={[styles.bottomHintWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.hintPill}>
            <MaterialCommunityIcons name="gesture-tap" size={18} color={THEME.colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.hintPillText}>
              {projects.length} Assigned Site{projects.length !== 1 ? 's' : ''} • Tap any circle to inspect
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.bottomCardWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.hudCard, isCardCollapsed && styles.hudCardCollapsed]}>
            {/* Card Top: Project Header, Collapse Toggle & Dismiss Button */}
            <View style={styles.hudHeader}>
              <View style={styles.hudHeaderLeft}>
                <View style={styles.hudCodeBadge}>
                  <Text style={styles.hudCodeText}>
                    CODE #{selectedProject.project_id}
                  </Text>
                </View>
                <Text style={styles.hudProjectName} numberOfLines={1}>
                  {selectedProject.project_name}
                </Text>
              </View>

              <View style={styles.hudHeaderActions}>
                {/* Collapse / Expand Toggle Button */}
                <TouchableOpacity
                  style={styles.collapseToggleBtn}
                  onPress={() => setIsCardCollapsed(!isCardCollapsed)}
                  activeOpacity={0.7}
                  accessibilityLabel={isCardCollapsed ? 'Expand HUD details' : 'Collapse HUD details'}
                >
                  <Text style={styles.collapseToggleText}>
                    {isCardCollapsed ? 'EXPAND' : 'HIDE'}
                  </Text>
                  <Ionicons
                    name={isCardCollapsed ? 'chevron-up' : 'chevron-down'}
                    size={17}
                    color={THEME.colors.primary}
                  />
                </TouchableOpacity>

                {/* Dismiss / Close Icon Button */}
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setSelectedProjectId(null)}
                  activeOpacity={0.7}
                  accessibilityLabel="Deselect project"
                >
                  <Ionicons name="close" size={18} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* CONDITIONAL BODY: COMPACT VIEW (COLLAPSED) vs FULL TELEMETRY (EXPANDED) */}
            {isCardCollapsed ? (
              <View style={styles.collapsedContentRow}>
                <View
                  style={[
                    styles.collapsedStatusBadge,
                    isInsideGeofence ? styles.ribbonInside : styles.ribbonOutside,
                  ]}
                >
                  <Ionicons
                    name={isInsideGeofence ? 'shield-checkmark' : 'alert-circle'}
                    size={15}
                    color={isInsideGeofence ? THEME.colors.success : THEME.colors.warning}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.collapsedStatusText,
                      { color: isInsideGeofence ? THEME.colors.successText : THEME.colors.warningText },
                    ]}
                  >
                    {isInsideGeofence ? 'IN GEOFENCE' : 'OUTSIDE'} • {distanceFormatted}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.collapsedCameraBtn,
                    isInsideGeofence ? styles.launchButtonInside : styles.launchButtonOutside,
                  ]}
                  onPress={handleLaunchCamera}
                  activeOpacity={0.8}
                >
                  <Ionicons name="camera" size={17} color="#FFFFFF" style={{ marginRight: 5 }} />
                  <Text style={styles.collapsedCameraBtnText}>INSPECT</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Dynamic Geofence Status Ribbon */}
                <View
                  style={[
                    styles.geofenceRibbon,
                    isInsideGeofence ? styles.ribbonInside : styles.ribbonOutside,
                  ]}
                >
                  <Ionicons
                    name={isInsideGeofence ? 'shield-checkmark' : 'alert-circle'}
                    size={22}
                    color={isInsideGeofence ? THEME.colors.success : THEME.colors.warning}
                    style={{ marginRight: 8 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.ribbonTitle,
                        { color: isInsideGeofence ? THEME.colors.successText : THEME.colors.warningText },
                      ]}
                    >
                      {isInsideGeofence ? 'INSIDE GEOFENCE - READY TO INSPECT' : 'OUTSIDE GEOFENCE PERIMETER'}
                    </Text>
                    <Text
                      style={[
                        styles.ribbonSubtitle,
                        { color: isInsideGeofence ? THEME.colors.successText : THEME.colors.warningText },
                      ]}
                    >
                      {isInsideGeofence
                        ? `Within authorized site radius (${geofenceRadius}m)`
                        : distance !== null
                        ? `${Math.max(0, Math.round(distance - geofenceRadius))}m to site boundary`
                        : 'Acquiring satellite signal...'}
                    </Text>
                  </View>
                </View>

                {/* Proximity Telemetry Row */}
                <View style={styles.telemetryRow}>
                  <View style={styles.telemetryItem}>
                    <Text style={styles.telemetryLabel}>DISTANCE TO SITE</Text>
                    <Text style={styles.telemetryValue}>{distanceFormatted}</Text>
                  </View>

                  <View style={styles.telemetryDivider} />

                  <View style={styles.telemetryItem}>
                    <Text style={styles.telemetryLabel}>SITE PERIMETER</Text>
                    <Text style={styles.telemetryValue}>{geofenceRadius} METERS</Text>
                  </View>

                  <View style={styles.telemetryDivider} />

                  <View style={styles.telemetryItem}>
                    <Text style={styles.telemetryLabel}>GPS ACCURACY</Text>
                    <Text style={styles.telemetryValue}>
                      {userLocation?.accuracy ? `±${Math.round(userLocation.accuracy)}m` : 'SEARCHING'}
                    </Text>
                  </View>
                </View>

                {/* Action Button: Launch Camera */}
                <TouchableOpacity
                  style={[
                    styles.launchButton,
                    isInsideGeofence ? styles.launchButtonInside : styles.launchButtonOutside,
                  ]}
                  onPress={handleLaunchCamera}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isInsideGeofence ? 'camera' : 'camera-outline'}
                    size={22}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.launchButtonText}>
                    {isInsideGeofence ? 'LAUNCH CAMERA • READY' : 'LAUNCH CAMERA (OVERRIDE)'}
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#FFFFFF" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },

  // 1. TOP TACTICAL CONTROL BAR
  topBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  topBarLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  brandBadge: {
    backgroundColor: THEME.colors.primaryDark,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 4,
  },
  brandBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  accuracyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.metrics.borderRadiusSm,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  accHigh: { backgroundColor: THEME.colors.success },
  accMed: { backgroundColor: THEME.colors.warning },
  accLow: { backgroundColor: THEME.colors.danger },
  accuracyText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  quickToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  userLocButton: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primaryDark,
  },

  // 2. BOTTOM HINT PILL (WHEN NO SITE IS SELECTED)
  bottomHintWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 15,
    alignItems: 'center',
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 5,
  },
  hintPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.primaryDark,
    letterSpacing: 0.3,
  },

  // 3. FLOATING HUD CARD (WHEN SITE IS SELECTED)
  bottomCardWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 15,
  },
  hudCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.metrics.borderRadiusLg,
    padding: 16,
    borderWidth: THEME.metrics.borderWidthRugged,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 6,
    elevation: 8,
  },
  hudCardCollapsed: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  hudHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  hudHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  hudCodeBadge: {
    backgroundColor: THEME.colors.primarySurface,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  hudCodeText: {
    fontSize: 10,
    fontWeight: '900',
    color: THEME.colors.primary,
    letterSpacing: 0.5,
  },
  hudProjectName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    letterSpacing: 0.2,
  },
  hudHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // COLLAPSE TOGGLE BUTTON & CLOSE BUTTON
  collapseToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    gap: 4,
  },
  collapseToggleText: {
    fontSize: 11,
    fontWeight: '900',
    color: THEME.colors.primary,
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },

  // COLLAPSED CONTENT ROW
  collapsedContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  collapsedStatusBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1,
  },
  collapsedStatusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  collapsedCameraBtn: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: THEME.metrics.borderRadiusSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  collapsedCameraBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  // GEOFENCE STATUS RIBBON
  geofenceRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  ribbonInside: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.successBorder,
  },
  ribbonOutside: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.warningBorder,
  },
  ribbonTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  ribbonSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },

  // TELEMETRY
  telemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.metrics.borderRadiusSm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    marginBottom: 12,
  },
  telemetryItem: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  telemetryValue: {
    fontSize: 12,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  telemetryDivider: {
    width: 1,
    height: 24,
    backgroundColor: THEME.colors.borderLight,
  },

  // LAUNCH BUTTON
  launchButton: {
    height: 50,
    borderRadius: THEME.metrics.borderRadiusMd,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 2,
    elevation: 3,
  },
  launchButtonInside: {
    backgroundColor: THEME.colors.success,
    borderColor: THEME.colors.successBorder,
  },
  launchButtonOutside: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primaryDark,
  },
  launchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
