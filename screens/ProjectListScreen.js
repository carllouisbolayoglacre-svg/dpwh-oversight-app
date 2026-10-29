import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TouchableOpacity, 
  TextInput,
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  RefreshControl 
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { API_URLS } from '../config';
import { THEME } from '../theme';
import { fetchWithTimeout } from '../utils';

export default function ProjectListScreen({ navigation }) {
  const { userToken, inspectorId, inspectorName, signOut } = useAuth();
  const [projects, setProjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProjects = async () => {
    try {
      if (!userToken) {
        Alert.alert('Session Error', 'Could not find Inspector ID. Please log in again.');
        return;
      }

      const response = await fetchWithTimeout(API_URLS.PROJECTS, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
      });
      let data = {};
      try {
        data = await response.json();
      } catch (parseErr) {
        console.warn('Non-JSON response from projects endpoint', parseErr);
      }

      if (response.ok && data.success) {
        setProjects((data.projects || []).map((project) => ({
          ...project,
          project_id: project.project_id ?? project.id,
        })));
      } else {
        if (response.status === 401) {
          await signOut();
        }
        Alert.alert('Fetch Error', data.message || `Failed to load projects (status ${response.status}).`);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      Alert.alert('Assignment Sync Failed', error.message || 'Could not connect to the backend server.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchProjects();
  };

  const handleProjectPress = (project) => {
    navigation.navigate('Camera', { projectData: project });
  };

  const handleViewMap = (project) => {
    navigation.navigate('ProjectMap', { projectData: project });
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.project_name && p.project_name.toLowerCase().includes(q)) ||
      (p.project_id && String(p.project_id).includes(q))
    );
  });

  const renderProjectCard = ({ item }) => (
    <View style={styles.card}>
      {/* Card Header: Project ID & Status Badge */}
      <View style={styles.cardHeader}>
        <View style={styles.idContainer}>
          <Text style={styles.idLabel}>CODE</Text>
          <Text style={styles.projectIdText}>#{item.project_id}</Text>
        </View>

        <View style={styles.activeBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.activeBadgeText}>ACTIVE ASSIGNMENT</Text>
        </View>
      </View>

      {/* Project Title */}
      <Text style={styles.projectName}>{item.project_name}</Text>

      {/* Rugged Spec Grid (High-Contrast Outdoor Chips) */}
      <View style={styles.specsContainer}>
        <View style={styles.specChip}>
          <MaterialCommunityIcons name="crosshairs-gps" size={16} color={THEME.colors.primary} />
          <Text style={styles.specLabel}>GPS COORDS:</Text>
          <Text style={styles.specValue}>
            {parseFloat(item.latitude).toFixed(4)}, {parseFloat(item.longitude).toFixed(4)}
          </Text>
        </View>

        <View style={styles.specChip}>
          <MaterialCommunityIcons name="radius-outline" size={16} color={THEME.colors.primary} />
          <Text style={styles.specLabel}>GEOFENCE:</Text>
          <Text style={styles.specValue}>
            {item.geofence_radius || 100} METERS
          </Text>
        </View>
      </View>

      {/* Dual Action Controls: Geofence Map & Camera Inspection */}
      <View style={styles.actionRow}>
        <TouchableOpacity 
          style={styles.mapButton} 
          onPress={() => handleViewMap(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={18} color={THEME.colors.primary} style={{ marginRight: 6 }} />
          <Text style={styles.mapButtonText}>VIEW GEOFENCE</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.inspectButton} 
          onPress={() => handleProjectPress(item)}
          activeOpacity={0.8}
        >
          <Ionicons name="camera" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.inspectButtonText}>INSPECT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Sunlight Operational Header */}
      <View style={styles.bannerHeader}>
        <View style={styles.bannerRow}>
          <View>
            <Text style={styles.bannerSubtitle}>FIELD ASSIGNMENTS</Text>
            <Text style={styles.bannerInspector}>
              {inspectorName || 'INSPECTOR'} • ID #{inspectorId || '---'}
            </Text>
          </View>
          <View style={styles.modeBadge}>
            <Ionicons name="sunny" size={14} color={THEME.colors.hudAccent} />
            <Text style={styles.modeBadgeText}>SUNLIGHT MODE</Text>
          </View>
        </View>

        {/* High-Contrast Quick Search Field */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={THEME.colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by project name or ID..."
            placeholderTextColor={THEME.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color={THEME.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Content Area */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>SYNCHRONIZING ASSIGNMENTS...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={(item) => String(item.project_id)}
          renderItem={renderProjectCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl 
              refreshing={isRefreshing} 
              onRefresh={onRefresh} 
              colors={[THEME.colors.primary]} 
              tintColor={THEME.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={54} color={THEME.colors.textMuted} />
              <Text style={styles.emptyTitle}>No Assignments Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? 'Try matching a different keyword or ID.' : 'You have completed all assigned inspections.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  bannerHeader: {
    backgroundColor: THEME.colors.card,
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: THEME.metrics.borderWidthRugged,
    borderBottomColor: THEME.colors.border,
    elevation: 2,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bannerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.primary,
    letterSpacing: 0.8,
  },
  bannerInspector: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.primaryDark,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: THEME.metrics.borderRadiusSm,
  },
  modeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 5,
    letterSpacing: 0.5,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceAlt,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    borderRadius: THEME.metrics.borderRadiusSm,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    padding: 0,
  },
  clearBtn: {
    padding: 4,
  },

  listContent: {
    padding: 16,
    paddingBottom: 30,
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
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  idContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  idLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    marginRight: 4,
  },
  projectIdText: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.primary,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1,
    borderColor: THEME.colors.successBorder,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: THEME.colors.success,
    marginRight: 5,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.successText,
    letterSpacing: 0.4,
  },
  projectName: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    lineHeight: 24,
    marginBottom: 14,
  },
  specsContainer: {
    backgroundColor: THEME.colors.surfaceAlt,
    borderRadius: THEME.metrics.borderRadiusSm,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.colors.borderLight,
    marginBottom: 16,
  },
  specChip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  specLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    marginLeft: 6,
    marginRight: 6,
  },
  specValue: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mapButton: {
    flex: 1,
    height: THEME.metrics.buttonHeight,
    borderRadius: THEME.metrics.borderRadiusMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: THEME.colors.primarySurface,
    borderWidth: 2,
    borderColor: THEME.colors.primary,
  },
  mapButtonText: {
    color: THEME.colors.primary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  inspectButton: {
    flex: 1,
    backgroundColor: THEME.colors.primary,
    height: THEME.metrics.buttonHeight,
    borderRadius: THEME.metrics.borderRadiusMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: THEME.colors.primaryDark,
    elevation: 3,
  },
  inspectButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 14,
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 12,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
});
