import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { API_URLS } from '../config';
import { THEME } from '../theme';

const COLLAPSED_PROGRESS_COUNT = 4;
const COLLAPSED_INSPECTION_COUNT = 2;

function formatDate(value, includeYear = true) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

function toCoordinate(project) {
  const latitude = Number(project?.latitude);
  const longitude = Number(project?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function progressNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

export default function PublicProgressEvidenceScreen({ navigation, route }) {
  const initialProject = route.params?.project || null;
  const publicId = initialProject?.public_id || route.params?.publicId;
  const [project, setProject] = useState(initialProject);
  const [progressUpdates, setProgressUpdates] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [showAllProgress, setShowAllProgress] = useState(false);
  const [showAllInspections, setShowAllInspections] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadEvidence = useCallback(async ({ refreshing = false } = {}) => {
    if (!publicId) {
      setErrorMessage('This project does not have a public reference.');
      setIsLoading(false);
      return;
    }

    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage('');

    try {
      const [detailResponse, progressResponse, photosResponse] = await Promise.all([
        fetch(`${API_URLS.PUBLIC_PROJECTS}${publicId}/`),
        fetch(`${API_URLS.PUBLIC_PROJECTS}${publicId}/progress/`),
        fetch(`${API_URLS.PUBLIC_PROJECTS}${publicId}/photos/`),
      ]);

      if (!detailResponse.ok || !progressResponse.ok || !photosResponse.ok) {
        throw new Error('One or more public evidence endpoints were unavailable.');
      }

      const [detail, progressData, photosData] = await Promise.all([
        detailResponse.json(),
        progressResponse.json(),
        photosResponse.json(),
      ]);

      setProject(detail);
      setProgressUpdates(
        (Array.isArray(progressData.results) ? progressData.results : [])
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date))
      );
      setPhotos(Array.isArray(photosData.results) ? photosData.results : []);
    } catch (error) {
      console.error('[PublicProgressEvidence] Failed to load evidence:', error);
      setErrorMessage('Approved progress and inspection evidence could not be loaded. Pull down to try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [publicId]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  const inspectionGroups = useMemo(() => {
    const groups = new Map();
    photos.forEach((photo) => {
      const key = photo.inspection_date || photo.captured_at || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: photo.inspection_date || photo.captured_at,
          progress: photo.progress_percentage,
          accomplishment: photo.accomplishment,
          photos: [],
        });
      }
      groups.get(key).photos.push(photo);
    });
    return Array.from(groups.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [photos]);

  const visibleUpdates = showAllProgress
    ? progressUpdates
    : progressUpdates.slice(0, COLLAPSED_PROGRESS_COUNT);
  const visibleInspections = showAllInspections
    ? inspectionGroups
    : inspectionGroups.slice(0, COLLAPSED_INSPECTION_COUNT);
  const coordinate = toCoordinate(project);
  const geofenceRadius = Math.max(1, Number(project?.geofence_radius) || 100);
  const leafletHtml = useMemo(() => {
    if (!coordinate) return '';
    const projectName = JSON.stringify(project?.project_name || 'DPWH Project');
    const location = JSON.stringify(project?.location_address || project?.barangay || 'Approved project location');
    return `<!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <style>
            html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
            body { background: #e5e7eb; }
            .leaflet-control-attribution { font-size: 8px; }
            .leaflet-popup-content { margin: 10px 12px; font-family: Arial, sans-serif; color: #0f172a; }
            .popup-title { font-weight: 700; font-size: 13px; margin-bottom: 3px; }
            .popup-copy { font-size: 11px; color: #475569; }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <script>
            const center = [${coordinate.latitude}, ${coordinate.longitude}];
            const map = L.map('map', { zoomControl: true, attributionControl: true }).setView(center, 16);
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
              maxZoom: 19,
              attribution: 'Tiles &copy; Esri'
            }).addTo(map);
            L.circle(center, {
              radius: ${geofenceRadius},
              color: '#003366',
              weight: 2,
              fillColor: '#0A4A8F',
              fillOpacity: 0.2
            }).addTo(map);
            L.marker(center).addTo(map).bindPopup(
              '<div class="popup-title">' + ${projectName} + '</div>' +
              '<div class="popup-copy">' + ${location} + '<br>Approved geofence: ${Math.round(geofenceRadius)} m</div>'
            ).openPopup();
          </script>
        </body>
      </html>`;
  }, [coordinate?.latitude, coordinate?.longitude, geofenceRadius, project?.project_name, project?.location_address, project?.barangay]);

  if (isLoading) {
    return (
      <View style={styles.stateScreen}>
        <ActivityIndicator size="large" color={THEME.colors.primary} />
        <Text style={styles.stateTitle}>Loading approved evidence</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityLabel="Back to project overview">
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerLogoFrame}>
          <Image source={require('../assets/dpwh-logo.png')} style={styles.headerLogo} resizeMode="contain" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Progress & Evidence</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{project?.project_name || 'Public project'}</Text>
        </View>
        <View style={styles.readOnlyBadge}><Text style={styles.readOnlyText}>READ-ONLY</Text></View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadEvidence({ refreshing: true })}
            colors={[THEME.colors.primary]}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {!!errorMessage && <Text style={styles.errorBox}>{errorMessage}</Text>}

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Approved progress</Text>
              <Text style={styles.sectionSubtitle}>Latest approved inspection first</Text>
            </View>
            <Text style={styles.sectionCount}>{progressUpdates.length} updates</Text>
          </View>

          {visibleUpdates.length ? (
            <View style={styles.timeline}>
              {visibleUpdates.map((update, index) => {
                const progress = progressNumber(update.progress_percentage);
                const isLatest = index === 0;
                return (
                  <View key={`${update.date}-${index}`} style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, isLatest && styles.timelineDotLatest]} />
                      {index < visibleUpdates.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineTopRow}>
                        <Text style={styles.timelineDate}>{formatDate(update.date)}</Text>
                        <Text style={[styles.timelineProgress, progress === 100 && styles.timelineComplete]}>{Math.round(progress)}%</Text>
                      </View>
                      <Text style={styles.timelineDescription}>{update.accomplishment || 'Approved inspection update'}</Text>
                      <View style={styles.miniProgressTrack}>
                        <View style={[styles.miniProgressFill, { width: `${progress}%` }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.emptyText}>No approved progress reports are public yet.</Text>
          )}

          {progressUpdates.length > COLLAPSED_PROGRESS_COUNT && (
            <TouchableOpacity style={styles.textButton} onPress={() => setShowAllProgress((current) => !current)}>
              <Text style={styles.textButtonLabel}>
                {showAllProgress ? 'Show latest updates only' : `Show all ${progressUpdates.length} updates`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Project location</Text>
              <Text style={styles.sectionSubtitle}>Approved geofence area</Text>
            </View>
            {coordinate && <Text style={styles.verifiedLabel}>Location verified</Text>}
          </View>

          {coordinate ? (
            <View style={styles.mapFrame}>
              <WebView
                style={styles.map}
                source={{ html: leafletHtml }}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                scrollEnabled={false}
                nestedScrollEnabled
                setSupportMultipleWindows={false}
              />
              <View style={styles.mapCaption}>
                <Text style={styles.mapCaptionTitle}>{project?.location_address || project?.barangay || 'Approved project location'}</Text>
                <Text style={styles.mapCaptionText}>{Math.round(geofenceRadius)} m approved radius</Text>
              </View>
            </View>
          ) : (
            <View style={styles.mapUnavailable}>
              <Text style={styles.mapUnavailableTitle}>Map not available</Text>
              <Text style={styles.mapUnavailableText}>Coordinates have not been published for this project.</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Approved inspection photos</Text>
              <Text style={styles.sectionSubtitle}>Grouped by approved inspection</Text>
            </View>
            <Text style={styles.sectionCount}>{photos.length} photos</Text>
          </View>

          {visibleInspections.length ? visibleInspections.map((inspection) => (
            <View key={inspection.key} style={styles.inspectionGroup}>
              <View style={styles.inspectionHeading}>
                <Text style={styles.inspectionDate}>{formatDate(inspection.date)}</Text>
                {inspection.progress != null && <Text style={styles.inspectionProgress}>{Math.round(progressNumber(inspection.progress))}% progress</Text>}
              </View>
              {!!inspection.accomplishment && <Text style={styles.inspectionDescription}>{inspection.accomplishment}</Text>}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                {inspection.photos.map((photo, index) => (
                  <TouchableOpacity key={`${photo.url}-${index}`} onPress={() => setSelectedPhoto(photo)} activeOpacity={0.85}>
                    <Image source={{ uri: photo.url }} style={styles.photo} resizeMode="cover" />
                    <View style={styles.photoVerification}>
                      <Text style={styles.photoVerificationText}>{photo.image_verified ? 'Image verified' : 'Approved photo'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )) : (
            <Text style={styles.emptyText}>No approved inspection photos are public yet.</Text>
          )}

          {inspectionGroups.length > COLLAPSED_INSPECTION_COUNT && (
            <TouchableOpacity style={styles.textButton} onPress={() => setShowAllInspections((current) => !current)}>
              <Text style={styles.textButtonLabel}>
                {showAllInspections ? 'Show recent inspections only' : `Show all ${inspectionGroups.length} inspections`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.publicNote}>
          <Text style={styles.publicNoteTitle}>How evidence becomes public</Text>
          <Text style={styles.publicNoteText}>
            Inspectors may submit many reports and photos, but this page only displays reports approved by the office. Pending or rejected submissions remain private.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.verificationButton}
          onPress={() => navigation.navigate('PublicVerificationFiles', { project })}
          activeOpacity={0.84}
        >
          <View style={styles.verificationButtonCopy}>
            <Text style={styles.verificationButtonTitle}>Verification & files</Text>
            <Text style={styles.verificationButtonText}>Integrity status and approved public documents</Text>
          </View>
          <Text style={styles.verificationButtonArrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedPhoto(null)} accessibilityLabel="Close photo">
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          {!!selectedPhoto && <Image source={{ uri: selectedPhoto.url }} style={styles.fullPhoto} resizeMode="contain" />}
          {!!selectedPhoto && (
            <Text style={styles.modalCaption}>
              {formatDate(selectedPhoto.inspection_date || selectedPhoto.captured_at)} · {selectedPhoto.image_verified ? 'Image verified' : 'Approved inspection photo'}
            </Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  stateScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background },
  stateTitle: { color: THEME.colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 13 },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.colors.primaryDark, paddingHorizontal: 12, borderBottomWidth: 3, borderBottomColor: THEME.colors.warningBorder },
  backButton: { width: 42, height: 46, alignItems: 'center', justifyContent: 'center' },
  headerLogoFrame: { width: 38, height: 38, borderRadius: 7, backgroundColor: '#FFFFFF', padding: 3, marginRight: 9 },
  headerLogo: { width: '100%', height: '100%' },
  headerCopy: { flex: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  headerSubtitle: { color: '#DCE8F5', fontSize: 11, fontWeight: '600', marginTop: 2 },
  readOnlyBadge: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 6 },
  readOnlyText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  scrollContent: { padding: 14, paddingBottom: 34, gap: 14 },
  errorBox: { color: THEME.colors.dangerText, backgroundColor: THEME.colors.dangerBg, borderRadius: 9, padding: 12, fontSize: 12, fontWeight: '700' },
  section: { backgroundColor: THEME.colors.card, borderRadius: 12, padding: 15, borderWidth: 1, borderColor: THEME.colors.borderLight },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  sectionTitle: { color: THEME.colors.textPrimary, fontSize: 17, fontWeight: '900' },
  sectionSubtitle: { color: THEME.colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 3 },
  sectionCount: { color: THEME.colors.primary, backgroundColor: THEME.colors.primarySurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  timeline: { paddingTop: 2 },
  timelineRow: { flexDirection: 'row', minHeight: 92 },
  timelineRail: { width: 25, alignItems: 'center' },
  timelineDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: THEME.colors.border, marginTop: 4, zIndex: 2 },
  timelineDotLatest: { width: 14, height: 14, borderRadius: 7, backgroundColor: THEME.colors.success, borderWidth: 3, borderColor: THEME.colors.successBg, marginTop: 2 },
  timelineLine: { position: 'absolute', top: 15, bottom: -4, width: 2, backgroundColor: THEME.colors.borderLight },
  timelineContent: { flex: 1, paddingLeft: 7, paddingBottom: 18 },
  timelineTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineDate: { color: THEME.colors.textPrimary, fontSize: 13, fontWeight: '900' },
  timelineProgress: { color: THEME.colors.primary, backgroundColor: THEME.colors.primarySurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: '900' },
  timelineComplete: { color: THEME.colors.successText, backgroundColor: THEME.colors.successBg },
  timelineDescription: { color: THEME.colors.textSecondary, fontSize: 12, fontWeight: '600', lineHeight: 17, marginTop: 5 },
  miniProgressTrack: { height: 4, borderRadius: 2, backgroundColor: '#D9E1EA', overflow: 'hidden', marginTop: 8 },
  miniProgressFill: { height: '100%', borderRadius: 2, backgroundColor: THEME.colors.primary },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: THEME.colors.borderLight, marginTop: 5, paddingTop: 8 },
  textButtonLabel: { color: THEME.colors.primary, fontSize: 13, fontWeight: '900' },
  emptyText: { color: THEME.colors.textMuted, fontSize: 13, fontWeight: '600', lineHeight: 19, paddingVertical: 12 },
  verifiedLabel: { color: THEME.colors.successText, backgroundColor: THEME.colors.successBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  mapFrame: { borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: THEME.colors.borderLight },
  map: { width: '100%', height: 220 },
  mapCaption: { backgroundColor: THEME.colors.surfaceAlt, padding: 11 },
  mapCaptionTitle: { color: THEME.colors.textPrimary, fontSize: 12, fontWeight: '900' },
  mapCaptionText: { color: THEME.colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  mapUnavailable: { backgroundColor: THEME.colors.surfaceAlt, borderRadius: 9, padding: 18, borderWidth: 1, borderColor: THEME.colors.borderLight },
  mapUnavailableTitle: { color: THEME.colors.textPrimary, fontSize: 14, fontWeight: '900' },
  mapUnavailableText: { color: THEME.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  inspectionGroup: { borderTopWidth: 1, borderTopColor: THEME.colors.borderLight, paddingTop: 12, marginTop: 2, marginBottom: 14 },
  inspectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  inspectionDate: { color: THEME.colors.textPrimary, fontSize: 13, fontWeight: '900' },
  inspectionProgress: { color: THEME.colors.primary, fontSize: 11, fontWeight: '900' },
  inspectionDescription: { color: THEME.colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 },
  photoRow: { gap: 9, paddingTop: 10, paddingRight: 2 },
  photo: { width: 132, height: 105, borderRadius: 8, backgroundColor: THEME.colors.borderLight },
  photoVerification: { position: 'absolute', left: 5, right: 5, bottom: 5, backgroundColor: 'rgba(0,34,68,0.84)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4 },
  photoVerificationText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', textAlign: 'center' },
  publicNote: { backgroundColor: THEME.colors.primarySurface, borderRadius: 11, padding: 15, borderWidth: 1, borderColor: THEME.colors.primary },
  publicNoteTitle: { color: THEME.colors.primary, fontSize: 13, fontWeight: '900' },
  publicNoteText: { color: THEME.colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },
  verificationButton: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: THEME.colors.primary, borderRadius: 11, paddingHorizontal: 15, paddingVertical: 12 },
  verificationButtonCopy: { flex: 1 },
  verificationButtonTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  verificationButtonText: { color: '#DCE8F5', fontSize: 11, fontWeight: '600', marginTop: 3 },
  verificationButtonArrow: { color: '#FFFFFF', fontSize: 30, fontWeight: '400', marginLeft: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  modalClose: { position: 'absolute', top: 48, right: 18, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)', zIndex: 2 },
  fullPhoto: { width: '100%', height: '75%' },
  modalCaption: { position: 'absolute', bottom: 42, color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 24 },
});
