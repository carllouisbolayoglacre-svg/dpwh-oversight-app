import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { API_URLS } from '../config';
import { THEME } from '../theme';

const STATUS_STYLES = {
  Ongoing: { background: THEME.colors.warningBg, text: THEME.colors.warningText },
  Completed: { background: THEME.colors.successBg, text: THEME.colors.successText },
  Delayed: { background: THEME.colors.dangerBg, text: THEME.colors.dangerText },
  'Not started': { background: THEME.colors.primarySurface, text: THEME.colors.primary },
};

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not specified';
  return `₱${number.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return 'Not specified';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Not specified';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function DetailRow({ label, value, last }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value || 'Not specified'}</Text>
      </View>
    </View>
  );
}

export default function PublicProjectDetailScreen({ navigation, route }) {
  const initialProject = route.params?.project || null;
  const publicId = initialProject?.public_id || route.params?.publicId;
  const [project, setProject] = useState(initialProject);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(!initialProject);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadProject = useCallback(async ({ refreshing = false } = {}) => {
    if (!publicId) {
      setErrorMessage('This project does not have a public reference.');
      setIsLoading(false);
      return;
    }

    if (refreshing) setIsRefreshing(true);
    else if (!project) setIsLoading(true);
    setErrorMessage('');

    try {
      const [detailResponse, photosResponse] = await Promise.all([
        fetch(`${API_URLS.PUBLIC_PROJECTS}${publicId}/`),
        fetch(`${API_URLS.PUBLIC_PROJECTS}${publicId}/photos/`),
      ]);

      if (!detailResponse.ok) {
        throw new Error(`The public portal returned status ${detailResponse.status}.`);
      }

      const detail = await detailResponse.json();
      setProject(detail);

      if (photosResponse.ok) {
        const photos = await photosResponse.json();
        const firstApprovedPhoto = Array.isArray(photos.results) ? photos.results[0] : null;
        setPhotoUrl(firstApprovedPhoto?.url || null);
      }
    } catch (error) {
      console.error('[PublicProjectDetail] Failed to load project:', error);
      setErrorMessage('The latest approved project information could not be loaded.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [publicId, project]);

  useEffect(() => {
    loadProject();
  }, [publicId]);

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={THEME.colors.primary} />
        <Text style={styles.loadingText}>Loading project overview</Text>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.loadingScreen}>
        <Ionicons name="alert-circle-outline" size={44} color={THEME.colors.danger} />
        <Text style={styles.errorTitle}>Project unavailable</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>Back to projects</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progress = Math.min(100, Math.max(0, Number(project.progress_percentage) || 0));
  const statusStyle = STATUS_STYLES[project.status] || STATUS_STYLES['Not started'];
  const location = project.location_address || project.barangay || 'Location pending';
  const schedule = `${formatDate(project.start_date)} — ${formatDate(project.expected_completion)}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Back to public projects"
        >
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerMark}>
          <Image source={require('../assets/dpwh-logo.png')} style={styles.headerLogo} resizeMode="contain" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>DPWH Oversight</Text>
          <Text style={styles.headerSubtitle}>Public Project Portal</Text>
        </View>
        <View style={styles.readOnlyIcon}>
          <Ionicons name="eye-outline" size={20} color="#FFFFFF" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadProject({ refreshing: true })}
            colors={[THEME.colors.primary]}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroFallback}>
            <View style={styles.heroRoadLine} />
            <MaterialCommunityIcons name="bridge" size={70} color="#FFFFFF" />
            <Text style={styles.heroFallbackText}>Approved project overview</Text>
          </View>
        )}

        <View style={styles.contentCard}>
          <View style={styles.titleRow}>
            <Text style={styles.projectName}>{project.project_name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.background }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>{project.status || 'Not started'}</Text>
            </View>
          </View>

          <View style={styles.locationRow}>
            <Text style={styles.locationText}>{location}</Text>
          </View>

          <View style={styles.noticeBox}>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>Approved public information only</Text>
              <Text style={styles.noticeText}>This page shows verified project details as officially recorded. Read-only.</Text>
            </View>
          </View>

          {!!errorMessage && <Text style={styles.inlineError}>{errorMessage}</Text>}

          <View style={styles.detailsPanel}>
            <DetailRow label="Approved project budget" value={formatCurrency(project.budget)} />
            <DetailRow label="Contractor" value={project.contractor} />
            <DetailRow label="Schedule" value={schedule} />
            <DetailRow label="District" value={project.district} last />
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressHeading}>
              <View style={styles.progressTitleRow}>
                <Text style={styles.progressTitle}>Latest approved progress</Text>
              </View>
              <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: project.status === 'Completed' ? THEME.colors.success : THEME.colors.primary,
                  },
                ]}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.evidenceButton}
            onPress={() => navigation.navigate('PublicProgressEvidence', { project })}
            activeOpacity={0.84}
          >
            <View>
              <Text style={styles.evidenceButtonTitle}>Progress & evidence</Text>
              <Text style={styles.evidenceButtonText}>Approved timeline, location, and inspection photos</Text>
            </View>
            <Text style={styles.evidenceButtonArrow}>›</Text>
          </TouchableOpacity>

          <View style={styles.referenceRow}>
            <Text style={styles.referenceLabel}>PROJECT TYPE</Text>
            <Text style={styles.referenceValue}>{project.project_type || 'Infrastructure'}</Text>
            {!!project.project_reference && (
              <Text style={styles.referenceCode}>Reference: {project.project_reference}</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background, paddingHorizontal: 28 },
  loadingText: { color: THEME.colors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 14 },
  errorTitle: { color: THEME.colors.textPrimary, fontSize: 20, fontWeight: '900', marginTop: 12 },
  errorMessage: { color: THEME.colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 7 },
  primaryButton: { minHeight: 48, justifyContent: 'center', backgroundColor: THEME.colors.primary, borderRadius: 9, paddingHorizontal: 20, marginTop: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primaryDark,
    paddingHorizontal: 12,
    borderBottomWidth: 3,
    borderBottomColor: THEME.colors.warningBorder,
  },
  backButton: { width: 42, height: 46, alignItems: 'center', justifyContent: 'center' },
  headerMark: { width: 38, height: 38, borderRadius: 7, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 9, padding: 3 },
  headerLogo: { width: '100%', height: '100%' },
  headerCopy: { flex: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  headerSubtitle: { color: '#DCE8F5', fontSize: 11, fontWeight: '600', marginTop: 1 },
  readOnlyIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 30 },
  heroImage: { width: '100%', height: 220, backgroundColor: THEME.colors.borderLight },
  heroFallback: { height: 180, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: THEME.colors.primaryLight },
  heroRoadLine: { position: 'absolute', width: '130%', height: 4, backgroundColor: THEME.colors.warningBorder, transform: [{ rotate: '-8deg' }] },
  heroFallbackText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.7, marginTop: 8 },
  contentCard: { backgroundColor: THEME.colors.card, margin: 14, marginTop: -18, borderRadius: THEME.metrics.borderRadiusLg, padding: 17, borderWidth: 1.5, borderColor: THEME.colors.borderLight, elevation: 4, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  projectName: { flex: 1, color: THEME.colors.textPrimary, fontSize: 23, fontWeight: '900', lineHeight: 29 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 2 },
  statusText: { fontSize: 11, fontWeight: '900' },
  locationRow: { marginTop: 10 },
  locationText: { flex: 1, color: THEME.colors.textSecondary, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  noticeBox: { backgroundColor: THEME.colors.primary, borderRadius: 10, padding: 13, marginTop: 18 },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  noticeText: { color: '#DCE8F5', fontSize: 11, fontWeight: '500', lineHeight: 16, marginTop: 2 },
  inlineError: { color: THEME.colors.dangerText, backgroundColor: THEME.colors.dangerBg, borderRadius: 7, padding: 10, fontSize: 12, fontWeight: '700', marginTop: 12 },
  detailsPanel: { marginTop: 15, borderWidth: 1, borderColor: THEME.colors.borderLight, borderRadius: 10, overflow: 'hidden' },
  detailRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: THEME.colors.borderLight },
  detailRowLast: { borderBottomWidth: 0 },
  detailCopy: { flex: 1, paddingVertical: 10 },
  detailLabel: { color: THEME.colors.textMuted, fontSize: 11, fontWeight: '700' },
  detailValue: { color: THEME.colors.textPrimary, fontSize: 14, fontWeight: '900', lineHeight: 19, marginTop: 3 },
  progressSection: { backgroundColor: THEME.colors.surfaceAlt, borderRadius: 10, padding: 14, marginTop: 15, borderWidth: 1, borderColor: THEME.colors.borderLight },
  progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTitle: { color: THEME.colors.textSecondary, fontSize: 13, fontWeight: '800' },
  progressValue: { color: THEME.colors.textPrimary, fontSize: 17, fontWeight: '900' },
  progressTrack: { height: 11, borderRadius: 6, backgroundColor: '#D9E1EA', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', borderRadius: 6 },
  evidenceButton: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: THEME.colors.primary, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 12, marginTop: 15 },
  evidenceButtonTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  evidenceButtonText: { color: '#DCE8F5', fontSize: 11, fontWeight: '600', marginTop: 3 },
  evidenceButtonArrow: { color: '#FFFFFF', fontSize: 30, fontWeight: '400', marginLeft: 8 },
  referenceRow: { alignItems: 'center', marginTop: 17 },
  referenceLabel: { color: THEME.colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  referenceValue: { color: THEME.colors.primary, fontSize: 13, fontWeight: '900', marginTop: 3 },
  referenceCode: { color: THEME.colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
});
