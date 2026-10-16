import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  FlatList,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { THEME } from '../theme';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

export default function PhotoGalleryScreen({ route, navigation }) {
  const { projectData, photos: initialPhotos = [] } = route.params || {};
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = React.useState(initialPhotos);

  React.useEffect(() => {
    if (route.params?.photos) {
      setPhotos(route.params.photos);
    }
  }, [route.params?.photos]);

  const handleDeletePhoto = (photoId, index) => {
    Alert.alert(
      'Remove Photo',
      `Are you sure you want to remove Photo #${index + 1} from this inspection batch?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPhotos((prev) =>
              prev.filter((item, idx) => (item.id ? item.id !== photoId : idx !== index))
            );
          },
        },
      ]
    );
  };

  const handleTakeMorePhotos = () => {
    navigation.navigate('Camera', {
      projectData,
      existingPhotos: photos,
    });
  };

  const handleProceedToForm = () => {
    if (photos.length === 0) {
      Alert.alert(
        'No Photos In Batch',
        'At least 1 geo-verified inspection photo is required before proceeding to the report form.'
      );
      return;
    }

    navigation.navigate('ReportForm', {
      project: projectData,
      photos: photos,
      locationData: photos[0],
    });
  };

  const renderPhotoItem = ({ item, index }) => {
    const photoId = item.id || item.uri;
    const lat = item.latitude != null ? item.latitude.toFixed(5) : '0.00000';
    const lon = item.longitude != null ? item.longitude.toFixed(5) : '0.00000';
    const time = item.capturedAt
      ? new Date(item.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
      <View style={styles.gridCard}>
        <View style={styles.thumbnailWrapper}>
          <Image source={{ uri: item.uri }} style={styles.thumbnailImage} />

          {/* Sequence index badge */}
          <View style={styles.badgeIndex}>
            <Text style={styles.badgeIndexText}>#{index + 1}</Text>
          </View>

          {/* Delete touch target */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDeletePhoto(photoId, index)}
            activeOpacity={0.7}
            accessibilityLabel={`Delete photo ${index + 1}`}
          >
            <Ionicons name="trash" size={16} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Bottom telemetry overlay */}
          <View style={styles.telemetryOverlay}>
            <View style={styles.telemetryRow}>
              <Ionicons name="location" size={10} color={THEME.colors.hudAccent} />
              <Text style={styles.telemetryText} numberOfLines={1}>
                {lat}, {lon}
              </Text>
            </View>
            <View style={styles.telemetryRow}>
              <Ionicons name="time" size={10} color="#FFFFFF" />
              <Text style={styles.telemetryText} numberOfLines={1}>
                {time} • ±{Math.round(item.accuracy || 0)}m
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      {/* --- TOP HEADER BANNER --- */}
      <View style={styles.headerBanner}>
        <View style={styles.headerInfo}>
          <View style={styles.headerTagRow}>
            <Text style={styles.headerTag}>FIELD INSPECTION BATCH</Text>
            <View style={styles.counterPill}>
              <Text style={styles.counterPillText}>
                {photos.length} {photos.length === 1 ? 'PHOTO' : 'PHOTOS'}
              </Text>
            </View>
          </View>
          <Text style={styles.projectName} numberOfLines={1}>
            {projectData?.project_name || 'Project Site Inspection'}
          </Text>
          <Text style={styles.projectId}>ID #{projectData?.project_id || '---'}</Text>
        </View>
      </View>

      {/* --- PHOTO GRID / EMPTY STATE --- */}
      {photos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="camera-burst"
            size={64}
            color={THEME.colors.borderStrong}
          />
          <Text style={styles.emptyTitle}>NO PHOTOS IN CURRENT BATCH</Text>
          <Text style={styles.emptyDesc}>
            All captured photos were removed. DPWH compliance requires at least 1 verified geo-tagged photo for report submission.
          </Text>
          <TouchableOpacity
            style={styles.emptyActionBtn}
            onPress={handleTakeMorePhotos}
            activeOpacity={0.8}
          >
            <Ionicons name="camera" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.emptyActionBtnText}>RETURN TO CAMERA</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item, index) => item.id || `${item.uri}_${index}`}
          renderItem={renderPhotoItem}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.noticeBar}>
              <Ionicons name="information-circle" size={16} color={THEME.colors.primary} />
              <Text style={styles.noticeBarText}>
                Review captured frames. Tap trash icon to remove unneeded shots.
              </Text>
            </View>
          }
        />
      )}

      {/* --- BOTTOM ACTION BAR --- */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.takeMoreBtn}
          onPress={handleTakeMorePhotos}
          activeOpacity={0.8}
        >
          <Ionicons name="camera-outline" size={20} color={THEME.colors.primary} />
          <Text style={styles.takeMoreBtnText}>TAKE MORE PHOTOS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.proceedBtn,
            photos.length === 0 && styles.proceedBtnDisabled,
          ]}
          onPress={handleProceedToForm}
          disabled={photos.length === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.proceedBtnText}>PROCEED TO FORM</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  headerBanner: {
    backgroundColor: THEME.colors.card,
    borderBottomWidth: THEME.metrics.borderWidthRugged,
    borderBottomColor: THEME.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  headerInfo: {
    width: '100%',
  },
  headerTagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerTag: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.primary,
    letterSpacing: 0.8,
  },
  counterPill: {
    backgroundColor: THEME.colors.primarySurface,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: THEME.metrics.borderRadiusSm,
  },
  counterPillText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  projectName: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  projectId: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primarySurface,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: THEME.metrics.borderRadiusSm,
    marginBottom: 12,
  },
  noticeBarText: {
    color: THEME.colors.primaryDark,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
    flex: 1,
  },
  gridContent: {
    padding: 16,
    paddingBottom: 20,
  },
  gridCard: {
    width: COLUMN_WIDTH,
    marginRight: 16,
    marginBottom: 16,
  },
  thumbnailWrapper: {
    width: '100%',
    height: COLUMN_WIDTH * 1.15,
    borderRadius: THEME.metrics.borderRadiusMd,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    borderWidth: THEME.metrics.borderWidthRugged,
    borderColor: THEME.colors.border,
    position: 'relative',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  badgeIndex: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.hudAccent,
  },
  badgeIndexText: {
    color: THEME.colors.hudAccent,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: THEME.colors.danger,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  telemetryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  telemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 1,
  },
  telemetryText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
    marginLeft: 3,
    letterSpacing: 0.2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  emptyDesc: {
    marginTop: 8,
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: THEME.metrics.borderRadiusMd,
    borderWidth: 1.5,
    borderColor: THEME.colors.primaryDark,
    elevation: 3,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.card,
    borderTopWidth: THEME.metrics.borderWidthRugged,
    borderTopColor: THEME.colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  takeMoreBtn: {
    flex: 1,
    flexDirection: 'row',
    height: THEME.metrics.buttonHeight,
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.metrics.borderRadiusMd,
    borderWidth: 2,
    borderColor: THEME.colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  takeMoreBtnText: {
    color: THEME.colors.primary,
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 6,
    letterSpacing: 0.4,
  },
  proceedBtn: {
    flex: 1.2,
    flexDirection: 'row',
    height: THEME.metrics.buttonHeight,
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.metrics.borderRadiusMd,
    borderWidth: 2,
    borderColor: THEME.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  proceedBtnDisabled: {
    backgroundColor: '#94A3B8',
    borderColor: '#64748B',
    elevation: 0,
  },
  proceedBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.6,
  },
});
