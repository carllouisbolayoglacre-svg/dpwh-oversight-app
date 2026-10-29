import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { API_URLS } from '../config';
import { THEME } from '../theme';

const STATUS_FILTERS = ['All', 'Ongoing', 'Completed', 'Delayed', 'Not started'];

const STATUS_STYLES = {
  Ongoing: { background: THEME.colors.warningBg, text: THEME.colors.warningText },
  Completed: { background: THEME.colors.successBg, text: THEME.colors.successText },
  Delayed: { background: THEME.colors.dangerBg, text: THEME.colors.dangerText },
  'Not started': { background: THEME.colors.primarySurface, text: THEME.colors.primary },
};

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Budget pending';
  return `₱${number.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return 'No approved update';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No approved update';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normaliseProgress(value) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

export default function PublicBrowseScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchProjects = useCallback(async ({ refreshing = false } = {}) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage('');

    try {
      const firstResponse = await fetch(`${API_URLS.PUBLIC_PROJECTS}?page=1`);
      if (!firstResponse.ok) {
        throw new Error(`The public portal returned status ${firstResponse.status}.`);
      }

      const firstPage = await firstResponse.json();
      const pageCount = Math.max(1, Number(firstPage.pages) || 1);
      let results = Array.isArray(firstPage.results) ? firstPage.results : [];

      if (pageCount > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, index) => index + 2).map(async (page) => {
            const response = await fetch(`${API_URLS.PUBLIC_PROJECTS}?page=${page}`);
            if (!response.ok) return [];
            const data = await response.json();
            return Array.isArray(data.results) ? data.results : [];
          })
        );
        results = results.concat(...remainingPages);
      }

      setProjects(results);
    } catch (error) {
      console.error('[PublicBrowse] Failed to load published projects:', error);
      setErrorMessage('Published projects could not be loaded. Check that the web server is running, then try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesStatus = statusFilter === 'All' || project.status === statusFilter;
      const searchableText = [
        project.project_name,
        project.project_reference,
        project.contractor,
        project.barangay,
        project.location_address,
        project.district,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchesStatus && (!query || searchableText.includes(query));
    });
  }, [projects, searchQuery, statusFilter]);

  const renderProject = ({ item }) => {
    const progress = normaliseProgress(item.progress_percentage);
    const statusStyle = STATUS_STYLES[item.status] || STATUS_STYLES['Not started'];
    const location = item.barangay || item.location_address || 'Location pending';

    return (
      <TouchableOpacity
        style={styles.projectCard}
        onPress={() => navigation.navigate('PublicProjectDetail', { project: item })}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.project_name}`}
      >
        <View style={styles.cardTopRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.background }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{item.status || 'Not started'}</Text>
          </View>
          <Text style={styles.projectType} numberOfLines={1}>{item.project_type || 'Infrastructure'}</Text>
        </View>

        <Text style={styles.projectName}>{item.project_name}</Text>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={18} color={THEME.colors.primary} />
          <Text style={styles.locationText} numberOfLines={2}>{location}</Text>
        </View>

        <View style={styles.progressMeta}>
          <Text style={styles.progressLabel}>Verified progress</Text>
          <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress}%`,
                backgroundColor: item.status === 'Completed' ? THEME.colors.success : THEME.colors.primary,
              },
            ]}
          />
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <MaterialCommunityIcons name="cash-multiple" size={18} color={THEME.colors.textMuted} />
            <View style={styles.footerCopy}>
              <Text style={styles.footerLabel}>Approved budget</Text>
              <Text style={styles.footerValue}>{formatCurrency(item.budget)}</Text>
            </View>
          </View>
          <View style={[styles.footerItem, styles.updatedItem]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={THEME.colors.textMuted} />
            <View style={styles.footerCopy}>
              <Text style={styles.footerLabel}>Last approved</Text>
              <Text style={styles.footerValue}>{formatDate(item.last_updated)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.viewDetailsRow}>
          <Text style={styles.viewDetailsText}>View project overview</Text>
          <Ionicons name="chevron-forward" size={17} color={THEME.colors.primary} />
        </View>
      </TouchableOpacity>
    );
  };

  const listHeader = (
    <View>
      <View style={styles.introRow}>
        <View style={styles.introCopy}>
          <Text style={styles.eyebrow}>PROJECT DIRECTORY</Text>
          <Text style={styles.pageTitle}>Browse projects</Text>
          <Text style={styles.pageSubtitle}>Approved public information. No login required.</Text>
        </View>
        <View style={styles.readOnlyBadge}>
          <Ionicons name="eye-outline" size={16} color={THEME.colors.primary} />
          <Text style={styles.readOnlyText}>READ-ONLY</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={21} color={THEME.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Project, contractor, or location"
          placeholderTextColor={THEME.colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear project search">
            <Ionicons name="close-circle" size={20} color={THEME.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
      >
        {STATUS_FILTERS.map((status) => {
          const selected = statusFilter === status;
          return (
            <TouchableOpacity
              key={status}
              style={[styles.filterChip, selected && styles.filterChipSelected]}
              onPress={() => setStatusFilter(status)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{status}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!isLoading && !errorMessage && (
        <Text style={styles.resultCount}>
          {filteredProjects.length} published {filteredProjects.length === 1 ? 'project' : 'projects'}
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.brandHeader}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Image source={require('../assets/dpwh-logo.png')} style={styles.brandLogo} resizeMode="contain" />
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandTitle}>DPWH Oversight</Text>
            <Text style={styles.brandSubtitle}>Public Project Portal</Text>
          </View>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color="#FFFFFF" />
            <Text style={styles.loginButtonText}>Inspector Login</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.stateTitle}>Loading published projects</Text>
          <Text style={styles.stateMessage}>Retrieving approved information from the public portal.</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.stateContainer}>
          <View style={styles.errorIcon}>
            <Ionicons name="cloud-offline-outline" size={32} color={THEME.colors.danger} />
          </View>
          <Text style={styles.stateTitle}>Unable to reach the public portal</Text>
          <Text style={styles.stateMessage}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchProjects()}>
            <Ionicons name="refresh" size={19} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          renderItem={renderProject}
          keyExtractor={(item, index) => String(item.public_id || item.project_reference || index)}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchProjects({ refreshing: true })}
              colors={[THEME.colors.primary]}
              tintColor={THEME.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={42} color={THEME.colors.textMuted} />
              <Text style={styles.stateTitle}>No matching projects</Text>
              <Text style={styles.stateMessage}>Try a different keyword or project status.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  brandHeader: {
    backgroundColor: THEME.colors.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: THEME.colors.warningBorder,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 10,
    padding: 3,
  },
  brandLogo: { width: '100%', height: '100%' },
  brandCopy: { flex: 1 },
  brandTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.2 },
  brandSubtitle: { color: '#DCE8F5', fontSize: 12, fontWeight: '600', marginTop: 1 },
  loginButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.primaryLight,
    borderWidth: 1,
    borderColor: '#6FA5D8',
    borderRadius: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  loginButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  listContent: { padding: 16, paddingBottom: 36 },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  introCopy: { flex: 1, paddingRight: 8 },
  eyebrow: { color: THEME.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  pageTitle: { color: THEME.colors.textPrimary, fontSize: 27, fontWeight: '900', marginTop: 3 },
  pageSubtitle: { color: THEME.colors.textSecondary, fontSize: 13, fontWeight: '600', lineHeight: 19, marginTop: 4 },
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: THEME.colors.primarySurface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  readOnlyText: { color: THEME.colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  searchBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: THEME.colors.card,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    borderRadius: THEME.metrics.borderRadiusMd,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, color: THEME.colors.textPrimary, fontSize: 15, fontWeight: '600', paddingVertical: 0 },
  filtersRow: { paddingVertical: 14, gap: 8 },
  filterChip: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 17,
    borderRadius: 21,
    backgroundColor: THEME.colors.card,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderLight,
  },
  filterChipSelected: { backgroundColor: THEME.colors.primary, borderColor: THEME.colors.primaryDark },
  filterText: { color: THEME.colors.textSecondary, fontSize: 13, fontWeight: '800' },
  filterTextSelected: { color: '#FFFFFF' },
  resultCount: { color: THEME.colors.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 10 },
  projectCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.metrics.borderRadiusLg,
    borderWidth: 1.5,
    borderColor: THEME.colors.borderLight,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '900' },
  projectType: { flex: 1, textAlign: 'right', color: THEME.colors.textMuted, fontSize: 11, fontWeight: '800' },
  projectName: { color: THEME.colors.textPrimary, fontSize: 19, fontWeight: '900', lineHeight: 25, marginTop: 12 },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  locationText: { flex: 1, color: THEME.colors.textSecondary, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  progressLabel: { color: THEME.colors.textSecondary, fontSize: 12, fontWeight: '700' },
  progressValue: { color: THEME.colors.textPrimary, fontSize: 14, fontWeight: '900' },
  progressTrack: { height: 9, borderRadius: 5, backgroundColor: '#D9E1EA', overflow: 'hidden', marginTop: 7 },
  progressFill: { height: '100%', borderRadius: 5 },
  cardFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: THEME.colors.borderLight, marginTop: 16, paddingTop: 13 },
  footerItem: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  updatedItem: { justifyContent: 'flex-end', paddingLeft: 8 },
  footerCopy: { flexShrink: 1 },
  footerLabel: { color: THEME.colors.textMuted, fontSize: 10, fontWeight: '700' },
  footerValue: { color: THEME.colors.textPrimary, fontSize: 11, fontWeight: '900', marginTop: 2 },
  viewDetailsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 13 },
  viewDetailsText: { color: THEME.colors.primary, fontSize: 12, fontWeight: '900' },
  stateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  errorIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.dangerBg },
  stateTitle: { color: THEME.colors.textPrimary, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 14 },
  stateMessage: { color: THEME.colors.textSecondary, fontSize: 14, fontWeight: '500', lineHeight: 21, textAlign: 'center', marginTop: 7 },
  retryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.metrics.borderRadiusMd,
    paddingHorizontal: 20,
    marginTop: 18,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  emptyState: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
});
