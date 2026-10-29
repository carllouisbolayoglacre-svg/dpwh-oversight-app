import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  ScrollView, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useNetworkState } from 'expo-network';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { API_URLS } from '../config';
import { THEME } from '../theme';
import {
  formatDecimal,
  getApiErrorMessage,
  getImageMimeType,
  uploadMultipartAsync,
} from '../utils';
import { initDatabase, saveOfflineReport } from '../services/offlineDatabase';
import { isDeviceOnlineAsync } from '../services/syncService';

// Standard DPWH field inspection tags for quick one-tap entry
const FIELD_ACTIVITY_TAGS = [
  'Concrete Pouring',
  'Rebar Fabrication',
  'Subgrade Compaction',
  'Drainage Excavation',
  'Formworks Setup',
  'Asphalt Paving',
  'Slope Protection',
  'Quality Compliance',
];

export default function ReportFormScreen({ route, navigation }) {
  const { project, photoUri, photos: routePhotos, locationData: routeLocationData } = route.params || {};
  const { userToken, inspectorId, inspectorName } = useAuth();
  const networkState = useNetworkState();
  const isOnlineNow = Boolean(networkState.isConnected);

  // Normalize photos array (supports both multi-photo array and legacy single photoUri)
  const initialPhotos = (routePhotos && routePhotos.length > 0)
    ? routePhotos
    : (photoUri ? [{ uri: photoUri, ...(routeLocationData || {}) }] : []);

  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  const activePhoto = photos[selectedPhotoIndex] || photos[0] || {};
  const primaryLocation = (photos.length > 0 && photos[0].latitude != null)
    ? photos[0]
    : (routeLocationData || {});

  const [progress, setProgress] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize SQLite offline database table when the screen mounts
  useEffect(() => {
    initDatabase().catch((err) => {
      console.error('[ReportFormScreen] Error initializing offline DB:', err);
    });
  }, []);

  // Sync photos if updated via route params (e.g. returning from PhotoGalleryScreen)
  useEffect(() => {
    if (route.params?.photos) {
      setPhotos(route.params.photos);
      setSelectedPhotoIndex(0);
    }
  }, [route.params?.photos]);

  // Quick progress adjustment helpers for gloved workers
  const adjustProgress = (delta) => {
    const current = parseFloat(progress) || 0;
    const updated = Math.min(100, Math.max(0, current + delta));
    setProgress(updated.toFixed(0));
  };

  const setPresetProgress = (val) => {
    setProgress(String(val));
  };

  // Quick activity tag helper: appends tag to notes
  const toggleActivityTag = (tag) => {
    if (description.includes(tag)) {
      // Remove if already present
      const cleaned = description
        .replace(new RegExp(`•\\s*${tag}\\n?`, 'g'), '')
        .replace(new RegExp(tag, 'g'), '')
        .trim();
      setDescription(cleaned);
    } else {
      // Append tag
      const prefix = description.trim().length > 0 ? '\n' : '';
      setDescription(`${description.trim()}${prefix}• ${tag}`);
    }
  };

  const handleSubmitReport = async () => {
    if (photos.length === 0) {
      Alert.alert(
        'Missing Inspection Photos',
        'Please capture at least 1 inspection photo before submitting.'
      );
      return;
    }

    if (!progress.trim() || !description.trim()) {
      Alert.alert(
        'Required Fields Incomplete', 
        'Please enter the current progress percentage and accomplishment notes before submission.'
      );
      return;
    }

    const numericProgress = parseFloat(progress);
    if (isNaN(numericProgress) || numericProgress < 0 || numericProgress > 100) {
      Alert.alert(
        'Invalid Progress Value', 
        'Progress percentage must be a number between 0% and 100%.'
      );
      return;
    }

    if (!userToken) {
      Alert.alert('Session Expired', 'Inspector identity not found. Please log in again.');
      return;
    }

    // Serialize photo URIs into JSON array for SQLite offline storage
    const serializedPhotoUris = JSON.stringify(
      photos.map((p) => (typeof p === 'string' ? p : p.uri))
    );

    const reportPayload = {
      project_id: project.project_id,
      inspector_id: inspectorId,
      progress: numericProgress,
      description: description.trim(),
      photo_uri: serializedPhotoUris,
      photos: photos,
      latitude: primaryLocation.latitude || 0,
      longitude: primaryLocation.longitude || 0,
      altitude: primaryLocation.altitude || 0,
      accuracy: primaryLocation.accuracy || 0,
      geofence_status: primaryLocation.geofenceStatus || 'Inside',
      distance: primaryLocation.distance || 0,
      captured_at: primaryLocation.capturedAt || new Date().toISOString(),
    };

    setLoading(true);

    // 1. Check network connectivity before submission
    const isOnline = await isDeviceOnlineAsync();

    // 2. OFFLINE MODE: Save serialized photo URIs to local SQLite database
    if (!isOnline) {
      try {
        console.log('[ReportFormScreen] Device is offline. Persisting batch report to SQLite...');
        await saveOfflineReport(reportPayload);
        Alert.alert(
          'Offline Mode',
          'Offline mode: Report saved locally. It will sync automatically when connection is restored.',
          [{ text: 'OK', onPress: () => navigation.popToTop() }]
        );
      } catch (dbError) {
        console.error('[ReportFormScreen] Failed to save offline report:', dbError);
        Alert.alert('Storage Error', 'Could not save report to offline database.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. ONLINE MODE: Send one report containing every captured photo.
    try {
      console.log(`[ReportFormScreen] Device is online. Transmitting batch of ${photos.length} photos to backend...`);
      const formData = new FormData();
      formData.append('project_id', String(project.project_id));
      formData.append('inspector_id', String(inspectorId));
      formData.append('progress_percentage', numericProgress.toString());
      formData.append('accomplishment_description', description.trim());
      formData.append('latitude', formatDecimal(primaryLocation.latitude, 7));
      formData.append('longitude', formatDecimal(primaryLocation.longitude, 7));
      formData.append('altitude', formatDecimal(primaryLocation.altitude, 2));
      formData.append('gps_accuracy', formatDecimal(primaryLocation.accuracy, 2));
      formData.append('geofence_status', primaryLocation.geofenceStatus || 'Inside');
      formData.append('geofence_distance', (primaryLocation.distance || 0.0).toString());
      formData.append('captured_at', primaryLocation.capturedAt || new Date().toISOString());

      // Keep each photo's GPS and capture time aligned with its uploaded file.
      const photosMetadata = photos.map((photo) => {
        const metadata = typeof photo === 'string' ? primaryLocation : photo;
        return {
          latitude: formatDecimal(metadata.latitude, 7),
          longitude: formatDecimal(metadata.longitude, 7),
          altitude: formatDecimal(metadata.altitude, 2),
          accuracy: formatDecimal(metadata.accuracy, 2),
          capturedAt: metadata.capturedAt || new Date().toISOString(),
        };
      });
      formData.append('photos_metadata', JSON.stringify(photosMetadata));

      photos.forEach((photo, index) => {
        const uri = typeof photo === 'string' ? photo : photo.uri;
        const filename = uri.split('/').pop() || `inspection_${Date.now()}_${index + 1}.jpg`;
        const mimeType = getImageMimeType(filename);
        formData.append('image_file', { uri, name: filename, type: mimeType });
      });

      const uploadResult = await uploadMultipartAsync(
        API_URLS.UPLOAD,
        formData,
        60000,
        { Authorization: `Bearer ${userToken}` }
      );
      const result = uploadResult.data || {};

      Alert.alert(
        'Report Submitted',
        result.message || `${photos.length} inspection photo(s) transmitted and verified with geo-spatial telemetry.`,
        [{ text: 'OK', onPress: () => navigation.popToTop() }]
      );
    } catch (error) {
      // HTTP errors mean the server was reached, so show its validation message.
      // Only save offline when the device genuinely cannot reach the server.
      if (error?.status) {
        console.warn('[ReportFormScreen] Server rejected the report:', error.data || error);
        Alert.alert(
          'Submission Rejected',
          getApiErrorMessage(error)
        );
        return;
      }

      console.warn('[ReportFormScreen] Network transmission failed, saving to offline queue:', error);
      // Seamless fallback: Save report locally if connection drops mid-flight
      try {
        await saveOfflineReport(reportPayload);
        Alert.alert(
          'DPWH Server Unreachable',
          'Your phone has a network connection, but it could not reach the DPWH server. The report was saved locally and will sync when the server becomes reachable.',
          [{ text: 'OK', onPress: () => navigation.popToTop() }]
        );
      } catch (fallbackError) {
        console.error('[ReportFormScreen] Fallback SQLite save failed:', fallbackError);
        Alert.alert('Submission Failed', 'Could not transmit to server or persist locally.');
      }
    } finally {
      setLoading(false);
    }
  };

  const numericProgressValue = Math.min(100, Math.max(0, parseFloat(progress) || 0));

  return (
    <ScrollView 
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* --- LIVE NETWORK & PERSISTENCE BANNER --- */}
      <View style={[
        styles.networkBanner,
        isOnlineNow ? styles.networkBannerOnline : styles.networkBannerOffline
      ]}>
        <Ionicons 
          name={isOnlineNow ? "cloud-done" : "cloud-offline"} 
          size={16} 
          color="#FFFFFF" 
        />
        <Text style={styles.networkBannerText}>
          {isOnlineNow 
            ? 'ONLINE • DIRECT CLOUD TRANSMISSION ACTIVE' 
            : 'OFFLINE MODE • AUTO-STORE TO SQLITE ACTIVE'}
        </Text>
      </View>

      {/* --- CARD 1: VERIFIED GEO-TELEMETRY & BATCH PHOTOS --- */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.tagBadgeRow}>
              <Text style={styles.cardTag}>TELEMETRY VERIFICATION</Text>
              <View style={styles.photoCountPill}>
                <Ionicons name="images" size={12} color={THEME.colors.primary} />
                <Text style={styles.photoCountPillText}>
                  {photos.length} {photos.length === 1 ? 'PHOTO' : 'PHOTOS'}
                </Text>
              </View>
            </View>
            <Text style={styles.projectTitle} numberOfLines={2}>
              {project.project_name}
            </Text>
          </View>
          <View style={styles.idBadge}>
            <Text style={styles.idBadgeText}>ID #{project.project_id}</Text>
          </View>
        </View>

        {/* Horizontal Thumbnail Strip */}
        <View style={styles.thumbnailStripWrapper}>
          <View style={styles.thumbnailStripHeader}>
            <Text style={styles.thumbnailStripLabel}>
              INSPECTION PHOTO BATCH (TAP TO PREVIEW):
            </Text>
            <TouchableOpacity 
              onPress={() => navigation.navigate('PhotoGallery', { projectData: project, photos })}
              activeOpacity={0.7}
            >
              <Text style={styles.editBatchLink}>EDIT BATCH</Text>
            </TouchableOpacity>
          </View>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailStripContent}
          >
            {photos.map((item, index) => {
              const isSelected = index === selectedPhotoIndex;
              const uri = typeof item === 'string' ? item : item.uri;
              return (
                <TouchableOpacity
                  key={item.id || `${uri}_${index}`}
                  style={[
                    styles.thumbnailBox,
                    isSelected && styles.thumbnailBoxSelected,
                  ]}
                  onPress={() => setSelectedPhotoIndex(index)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri }} style={styles.thumbnailImg} />
                  <View style={[styles.thumbnailIndexTag, isSelected && styles.thumbnailIndexTagSelected]}>
                    <Text style={styles.thumbnailIndexText}>#{index + 1}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Photo Preview with Rugged HUD Stamping */}
        {photos.length > 0 && (
          <View style={styles.imageContainer}>
            <Image 
              source={{ uri: typeof activePhoto === 'string' ? activePhoto : activePhoto.uri }} 
              style={styles.previewImage} 
            />
            <View style={styles.imageWatermarkOverlay}>
              <View style={styles.watermarkRow}>
                <Ionicons name="location" size={13} color={THEME.colors.hudAccent} />
                <Text style={styles.watermarkText}>
                  {activePhoto.latitude ? activePhoto.latitude.toFixed(5) : (primaryLocation.latitude ? primaryLocation.latitude.toFixed(5) : '0.00000')}, {activePhoto.longitude ? activePhoto.longitude.toFixed(5) : (primaryLocation.longitude ? primaryLocation.longitude.toFixed(5) : '0.00000')}
                </Text>
              </View>
              <View style={styles.watermarkRow}>
                <Ionicons name="time" size={13} color="#FFFFFF" />
                <Text style={styles.watermarkText}>
                  {activePhoto.capturedAt ? new Date(activePhoto.capturedAt).toLocaleTimeString() : new Date().toLocaleTimeString()} • ACCURACY ±{Math.round(activePhoto.accuracy || primaryLocation.accuracy || 0)}m
                </Text>
              </View>
            </View>
            <View style={styles.activePhotoIndexBadge}>
              <Text style={styles.activePhotoIndexText}>
                FRAME {selectedPhotoIndex + 1} OF {photos.length}
              </Text>
            </View>
          </View>
        )}

        {/* Telemetry Status Bar */}
        <View style={styles.telemetryStatusRow}>
          <View style={styles.statusPill}>
            <Ionicons name="shield-checkmark" size={16} color={THEME.colors.success} />
            <Text style={styles.statusPillText}>
              GEOFENCE: INSIDE ({Math.round(primaryLocation.distance || 0)}m)
            </Text>
          </View>
          <View style={styles.statusPillSecondary}>
            <MaterialCommunityIcons name="badge-account-horizontal" size={16} color={THEME.colors.primary} />
            <Text style={styles.statusPillSecondaryText}>
              {inspectorName || 'INSPECTOR'}
            </Text>
          </View>
        </View>
      </View>

      {/* --- CARD 2: PROGRESS PERCENTAGE CARD --- */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTag}>PHYSICAL COMPLETION</Text>
            <Text style={styles.cardHeading}>Progress Percentage</Text>
          </View>
          <View style={styles.largePercentDisplay}>
            <Text style={styles.largePercentText}>{numericProgressValue.toFixed(0)}%</Text>
          </View>
        </View>

        {/* Visual Progress Bar */}
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${numericProgressValue}%` }]} />
        </View>

        {/* Numeric Input & Glove Stepper Buttons */}
        <View style={styles.stepperContainer}>
          <TouchableOpacity 
            style={styles.stepperBtn} 
            onPress={() => adjustProgress(-10)}
            activeOpacity={0.7}
          >
            <Text style={styles.stepperBtnText}>-10%</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.stepperBtn} 
            onPress={() => adjustProgress(-5)}
            activeOpacity={0.7}
          >
            <Text style={styles.stepperBtnText}>-5%</Text>
          </TouchableOpacity>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.progressInput}
              placeholder="0"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="numeric"
              maxLength={4}
              value={progress}
              onChangeText={setProgress}
            />
            <Text style={styles.inputSuffix}>%</Text>
          </View>

          <TouchableOpacity 
            style={styles.stepperBtn} 
            onPress={() => adjustProgress(+5)}
            activeOpacity={0.7}
          >
            <Text style={styles.stepperBtnText}>+5%</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.stepperBtn} 
            onPress={() => adjustProgress(+10)}
            activeOpacity={0.7}
          >
            <Text style={styles.stepperBtnText}>+10%</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Milestone Chips */}
        <Text style={styles.helperLabel}>QUICK MILESTONE PRESETS:</Text>
        <View style={styles.presetChipsRow}>
          {[25, 50, 75, 100].map((preset) => {
            const isSelected = numericProgressValue === preset;
            return (
              <TouchableOpacity
                key={preset}
                style={[styles.presetChip, isSelected && styles.presetChipActive]}
                onPress={() => setPresetProgress(preset)}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                  {preset}%
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* --- CARD 3: ACCOMPLISHMENT NOTES & ACTIVITY LOG --- */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTag}>WORK COMPLIANCE</Text>
            <Text style={styles.cardHeading}>Accomplishment Notes</Text>
          </View>
          <MaterialCommunityIcons name="clipboard-text" size={24} color={THEME.colors.primary} />
        </View>

        {/* Quick Activity Tags */}
        <Text style={styles.helperLabel}>TAP TO ADD FIELD ACTIVITIES:</Text>
        <View style={styles.activityChipsContainer}>
          {FIELD_ACTIVITY_TAGS.map((tag) => {
            const active = description.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.activityChip, active && styles.activityChipActive]}
                onPress={() => toggleActivityTag(tag)}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={active ? "checkmark-circle" : "add-circle-outline"} 
                  size={15} 
                  color={active ? '#FFFFFF' : THEME.colors.primary} 
                />
                <Text style={[styles.activityChipText, active && styles.activityChipTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Detailed High-Contrast Text Area */}
        <TextInput
          style={styles.notesTextArea}
          placeholder="Enter detailed site observation, machinery active, materials inspected, or weather conditions..."
          placeholderTextColor={THEME.colors.textMuted}
          multiline={true}
          numberOfLines={5}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />
      </View>

      {/* --- CARD 4: ACTIONS --- */}
      <View style={styles.actionCard}>
        <TouchableOpacity 
          style={[styles.submitButton, loading && styles.submitButtonDisabled]} 
          onPress={handleSubmitReport}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <View style={styles.buttonLoadingRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.submitButtonText}>
                {isOnlineNow ? 'TRANSMITTING REPORT...' : 'SAVING TO LOCAL DATABASE...'}
              </Text>
            </View>
          ) : (
            <View style={styles.buttonLoadingRow}>
              <Ionicons 
                name={isOnlineNow ? "cloud-upload" : "save"} 
                size={22} 
                color="#FFFFFF" 
                style={{ marginRight: 8 }} 
              />
              <Text style={styles.submitButtonText}>
                {isOnlineNow ? 'SUBMIT INSPECTION REPORT' : 'STORE LOCALLY (OFFLINE QUEUE)'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.retakeButton} 
          onPress={() => navigation.navigate('PhotoGallery', { projectData: project, photos })}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Ionicons name="images-outline" size={20} color={THEME.colors.textSecondary} />
          <Text style={styles.retakeButtonText}>REVIEW / EDIT PHOTOS ({photos.length})</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  networkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: THEME.metrics.borderRadiusSm,
    marginBottom: 14,
    borderWidth: 1.5,
  },
  networkBannerOnline: {
    backgroundColor: '#065F46',
    borderColor: '#10B981',
  },
  networkBannerOffline: {
    backgroundColor: '#92400E',
    borderColor: '#F59E0B',
  },
  networkBannerText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.metrics.borderRadiusMd,
    padding: 18,
    marginBottom: 16,
    borderWidth: THEME.metrics.borderWidthRugged,
    borderColor: THEME.colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    marginRight: 10,
  },
  cardTag: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.primary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  projectTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  idBadge: {
    backgroundColor: THEME.colors.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
  },
  idBadgeText: {
    color: THEME.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  tagBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 8,
  },
  photoCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primarySurface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
  },
  photoCountPillText: {
    color: THEME.colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  thumbnailStripWrapper: {
    marginBottom: 12,
  },
  thumbnailStripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  thumbnailStripLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    letterSpacing: 0.5,
  },
  editBatchLink: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.primary,
    letterSpacing: 0.4,
    textDecorationLine: 'underline',
  },
  thumbnailStripContent: {
    gap: 8,
    paddingVertical: 2,
  },
  thumbnailBox: {
    width: 68,
    height: 68,
    borderRadius: THEME.metrics.borderRadiusSm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: THEME.colors.borderLight,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  thumbnailBoxSelected: {
    borderColor: THEME.colors.primary,
    borderWidth: 2.5,
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailIndexTag: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  thumbnailIndexTagSelected: {
    backgroundColor: THEME.colors.primary,
  },
  thumbnailIndexText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  activePhotoIndexBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.hudAccent,
  },
  activePhotoIndexText: {
    color: THEME.colors.hudAccent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  /* Image & HUD watermark */
  imageContainer: {
    borderRadius: THEME.metrics.borderRadiusSm,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderStrong,
  },
  previewImage: {
    width: '100%',
    height: 190,
    resizeMode: 'cover',
  },
  imageWatermarkOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  watermarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  watermarkText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 5,
    letterSpacing: 0.3,
  },

  /* Status Bar */
  telemetryStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.successBg,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1.5,
    borderColor: THEME.colors.successBorder,
  },
  statusPillText: {
    color: THEME.colors.successText,
    fontWeight: '800',
    fontSize: 11,
    marginLeft: 6,
  },
  statusPillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primarySurface,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  statusPillSecondaryText: {
    color: THEME.colors.primary,
    fontWeight: '700',
    fontSize: 11,
    marginLeft: 5,
  },

  /* Progress Section */
  largePercentDisplay: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: THEME.metrics.borderRadiusSm,
  },
  largePercentText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  progressBarTrack: {
    height: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    overflow: 'hidden',
    marginVertical: 14,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.primary,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  stepperBtn: {
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: THEME.metrics.borderRadiusSm,
    minHeight: THEME.metrics.touchTargetMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: {
    color: THEME.colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.metrics.borderRadiusSm,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    height: THEME.metrics.inputHeight,
    minWidth: 85,
    justifyContent: 'center',
  },
  progressInput: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    minWidth: 40,
    padding: 0,
  },
  inputSuffix: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.primary,
    marginLeft: 2,
  },

  helperLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  presetChipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  presetChip: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 10,
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderLight,
    borderRadius: THEME.metrics.borderRadiusSm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  presetChipActive: {
    backgroundColor: THEME.colors.primarySurface,
    borderColor: THEME.colors.primary,
    borderWidth: 2,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
  },
  presetChipTextActive: {
    color: THEME.colors.primary,
  },

  /* Notes & Tags */
  activityChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  activityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderLight,
    borderRadius: THEME.metrics.borderRadiusSm,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 8,
    minHeight: 36,
  },
  activityChipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primaryDark,
  },
  activityChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
    marginLeft: 5,
  },
  activityChipTextActive: {
    color: '#FFFFFF',
  },
  notesTextArea: {
    borderWidth: 2,
    borderColor: THEME.colors.border,
    borderRadius: THEME.metrics.borderRadiusSm,
    backgroundColor: '#FFFFFF',
    padding: 12,
    fontSize: 15,
    fontWeight: '500',
    color: THEME.colors.textPrimary,
    minHeight: 110,
    lineHeight: 22,
  },

  /* Action Buttons */
  actionCard: {
    marginTop: 6,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: THEME.colors.primary,
    height: 60,
    borderRadius: THEME.metrics.borderRadiusMd,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.primaryDark,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    marginBottom: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#64748B',
    borderColor: '#475569',
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  retakeButton: {
    height: 50,
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.metrics.borderRadiusMd,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retakeButtonText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
});
