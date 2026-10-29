import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_URLS } from '../config';
import { THEME } from '../theme';

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function VerificationRow({ verified, title, verifiedText, pendingText, detail }) {
  return (
    <View style={[styles.verificationRow, verified ? styles.verifiedRow : styles.pendingRow]}>
      <View style={[styles.statusDot, verified ? styles.verifiedDot : styles.pendingDot]} />
      <View style={styles.verificationCopy}>
        <Text style={styles.verificationTitle}>{title}</Text>
        <Text style={[styles.verificationStatus, verified ? styles.verifiedText : styles.pendingText]}>
          {verified ? verifiedText : pendingText}
        </Text>
        <Text style={styles.verificationDetail}>{detail}</Text>
      </View>
    </View>
  );
}

export default function PublicVerificationFilesScreen({ navigation, route }) {
  const project = route.params?.project || null;
  const publicId = project?.public_id || route.params?.publicId;
  const [verification, setVerification] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadVerification = useCallback(async ({ refreshing = false } = {}) => {
    if (!publicId) {
      setErrorMessage('This project does not have a public reference.');
      setIsLoading(false);
      return;
    }
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage('');

    try {
      const [verificationResponse, documentsResponse] = await Promise.all([
        fetch(`${API_URLS.PUBLIC_PROJECTS}${publicId}/verification/`),
        fetch(`${API_URLS.PUBLIC_PROJECTS}${publicId}/documents/`),
      ]);
      if (!verificationResponse.ok || !documentsResponse.ok) {
        throw new Error('The verification service returned an error.');
      }
      const [verificationData, documentData] = await Promise.all([
        verificationResponse.json(),
        documentsResponse.json(),
      ]);
      setVerification(verificationData);
      setDocuments(Array.isArray(documentData.results) ? documentData.results : []);
    } catch (error) {
      console.error('[PublicVerificationFiles] Failed to load:', error);
      setErrorMessage('Verification details and public files could not be loaded. Pull down to try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [publicId]);

  useEffect(() => {
    loadVerification();
  }, [loadVerification]);

  const openDocument = async (url) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      Alert.alert('Unavailable file', 'This public document link is invalid.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('[PublicVerificationFiles] Could not open document:', error);
      Alert.alert('Unable to open file', 'No compatible viewer could open this public document.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.stateScreen}>
        <ActivityIndicator size="large" color={THEME.colors.primary} />
        <Text style={styles.stateTitle}>Loading verification details</Text>
      </View>
    );
  }

  const photoCount = Number(verification?.approved_photo_count) || 0;
  const committedCount = Number(verification?.committed_photo_count) || 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityLabel="Back to progress and evidence">
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerLogoFrame}>
          <Image source={require('../assets/dpwh-logo.png')} style={styles.headerLogo} resizeMode="contain" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Verification & Files</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{project?.project_name || 'Public project'}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadVerification({ refreshing: true })}
            colors={[THEME.colors.primary]}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {!!errorMessage && <Text style={styles.errorBox}>{errorMessage}</Text>}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification status</Text>
          <Text style={styles.sectionSubtitle}>Based only on photos selected for public release.</Text>

          <View style={styles.verificationList}>
            <VerificationRow
              verified={!!verification?.location_verified}
              title="Location verification"
              verifiedText="Verified inside the approved geofence"
              pendingText={photoCount ? 'Verification incomplete' : 'No public photos selected'}
              detail={photoCount ? `${photoCount} public inspection photo${photoCount === 1 ? '' : 's'} checked.` : 'The reviewer has not released an inspection photo for this project.'}
            />
            <VerificationRow
              verified={!!verification?.blockchain_committed}
              title="Image integrity"
              verifiedText="All public images have committed records"
              pendingText={photoCount ? 'Some records are not committed' : 'No public images to verify'}
              detail={`${committedCount} of ${photoCount} public photo${photoCount === 1 ? '' : 's'} have committed blockchain records.`}
            />
          </View>
        </View>

        <View style={styles.explanation}>
          <Text style={styles.explanationTitle}>What this verification means</Text>
          <Text style={styles.explanationText}>
            Location verification confirms that the released evidence was captured inside the configured project geofence. Image integrity confirms that each released image hash matches a committed ledger record.
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.documentHeading}>
            <View>
              <Text style={styles.sectionTitle}>Public project documents</Text>
              <Text style={styles.sectionSubtitle}>Files approved for resident access.</Text>
            </View>
            <Text style={styles.documentCount}>{documents.length} files</Text>
          </View>

          {documents.length ? documents.map((document) => (
            <View key={String(document.id)} style={styles.documentRow}>
              <View style={styles.fileTypeBadge}>
                <Text style={styles.fileTypeText}>PDF</Text>
              </View>
              <View style={styles.documentCopy}>
                <Text style={styles.documentTitle}>{document.title}</Text>
                <Text style={styles.documentMeta}>{formatBytes(document.size)} · {formatDate(document.uploaded_at)}</Text>
              </View>
              <View style={styles.documentActions}>
                <TouchableOpacity style={styles.viewButton} onPress={() => openDocument(document.url)}>
                  <Text style={styles.viewButtonText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.downloadButton} onPress={() => openDocument(document.download_url)} accessibilityLabel={`Download ${document.title}`}>
                  <Text style={styles.downloadButtonText}>Download</Text>
                </TouchableOpacity>
              </View>
            </View>
          )) : (
            <View style={styles.emptyFiles}>
              <Text style={styles.emptyFilesTitle}>No public files yet</Text>
              <Text style={styles.emptyFilesText}>Internal documents remain hidden until an administrator marks them public.</Text>
            </View>
          )}
        </View>

        <View style={styles.readOnlyNote}>
          <Text style={styles.readOnlyTitle}>Public read-only access</Text>
          <Text style={styles.readOnlyText}>Opening or downloading a file does not allow changes to the official project record.</Text>
        </View>
      </ScrollView>
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
  scrollContent: { padding: 14, paddingBottom: 34, gap: 14 },
  errorBox: { color: THEME.colors.dangerText, backgroundColor: THEME.colors.dangerBg, borderRadius: 9, padding: 12, fontSize: 12, fontWeight: '700' },
  section: { backgroundColor: THEME.colors.card, borderRadius: 12, padding: 15, borderWidth: 1, borderColor: THEME.colors.borderLight },
  sectionTitle: { color: THEME.colors.textPrimary, fontSize: 17, fontWeight: '900' },
  sectionSubtitle: { color: THEME.colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 3 },
  verificationList: { gap: 10, marginTop: 14 },
  verificationRow: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, padding: 14, borderWidth: 1 },
  verifiedRow: { backgroundColor: THEME.colors.successBg, borderColor: THEME.colors.successBorder },
  pendingRow: { backgroundColor: THEME.colors.surfaceAlt, borderColor: THEME.colors.borderLight },
  statusDot: { width: 11, height: 11, borderRadius: 6, marginTop: 4, marginRight: 11 },
  verifiedDot: { backgroundColor: THEME.colors.success },
  pendingDot: { backgroundColor: THEME.colors.border },
  verificationCopy: { flex: 1 },
  verificationTitle: { color: THEME.colors.textPrimary, fontSize: 13, fontWeight: '900' },
  verificationStatus: { fontSize: 12, fontWeight: '800', marginTop: 3 },
  verifiedText: { color: THEME.colors.successText },
  pendingText: { color: THEME.colors.textSecondary },
  verificationDetail: { color: THEME.colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
  explanation: { backgroundColor: THEME.colors.primarySurface, borderRadius: 11, padding: 15, borderWidth: 1, borderColor: THEME.colors.primary },
  explanationTitle: { color: THEME.colors.primary, fontSize: 13, fontWeight: '900' },
  explanationText: { color: THEME.colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },
  documentHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 13 },
  documentCount: { color: THEME.colors.primary, backgroundColor: THEME.colors.primarySurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  documentRow: { borderTopWidth: 1, borderTopColor: THEME.colors.borderLight, paddingVertical: 13 },
  fileTypeBadge: { alignSelf: 'flex-start', backgroundColor: THEME.colors.dangerBg, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4 },
  fileTypeText: { color: THEME.colors.dangerText, fontSize: 9, fontWeight: '900' },
  documentCopy: { marginTop: 7 },
  documentTitle: { color: THEME.colors.textPrimary, fontSize: 14, fontWeight: '900' },
  documentMeta: { color: THEME.colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 3 },
  documentActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  viewButton: { minHeight: 40, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1.5, borderColor: THEME.colors.primary },
  viewButtonText: { color: THEME.colors.primary, fontSize: 12, fontWeight: '900' },
  downloadButton: { minHeight: 40, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: THEME.colors.primary },
  downloadButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  emptyFiles: { backgroundColor: THEME.colors.surfaceAlt, borderRadius: 9, padding: 16, borderWidth: 1, borderColor: THEME.colors.borderLight },
  emptyFilesTitle: { color: THEME.colors.textPrimary, fontSize: 13, fontWeight: '900' },
  emptyFilesText: { color: THEME.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  readOnlyNote: { paddingHorizontal: 3, paddingVertical: 6 },
  readOnlyTitle: { color: THEME.colors.textPrimary, fontSize: 12, fontWeight: '900' },
  readOnlyText: { color: THEME.colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 3 },
});
