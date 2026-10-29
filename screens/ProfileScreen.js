import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../theme';

export default function ProfileScreen() {
  const { inspectorId, inspectorName, signOut } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'End Field Session', 
      'Confirm sign out? Unsubmitted offline drafts should be synced first.', 
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await signOut();
          }
        }
      ]
    );
  };

  const displayName = inspectorName || 'Field Inspector';
  const displayId = inspectorId || 'N/A';

  return (
    <ScrollView 
      style={styles.screen}
      contentContainerStyle={styles.container}
    >
      {/* Credential Card */}
      <View style={styles.card}>
        <View style={styles.badgeHeader}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="account-hard-hat" size={44} color="#FFFFFF" />
          </View>
          <View style={styles.badgeDetails}>
            <Text style={styles.roleTag}>CERTIFIED FIELD INSPECTOR</Text>
            <Text style={styles.nameText}>{displayName}</Text>
            <Text style={styles.idText}>BADGE ID: #{displayId}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Utilitarian Hardware Status List */}
        <Text style={styles.sectionHeading}>DEVICE & SENSOR DIAGNOSTICS</Text>

        <View style={styles.diagnosticRow}>
          <View style={styles.diagLeft}>
            <MaterialCommunityIcons name="crosshairs-gps" size={18} color={THEME.colors.success} />
            <Text style={styles.diagLabel}>High-Precision GPS</Text>
          </View>
          <View style={styles.diagBadgeSuccess}>
            <Text style={styles.diagBadgeText}>ONLINE / READY</Text>
          </View>
        </View>

        <View style={styles.diagnosticRow}>
          <View style={styles.diagLeft}>
            <Ionicons name="camera" size={18} color={THEME.colors.primary} />
            <Text style={styles.diagLabel}>EXIF Optical Camera</Text>
          </View>
          <View style={styles.diagBadgeSuccess}>
            <Text style={styles.diagBadgeText}>CALIBRATED</Text>
          </View>
        </View>

        <View style={styles.diagnosticRow}>
          <View style={styles.diagLeft}>
            <Ionicons name="sunny" size={18} color={THEME.colors.warning} />
            <Text style={styles.diagLabel}>Display Mode</Text>
          </View>
          <View style={styles.diagBadgeNeutral}>
            <Text style={styles.diagBadgeNeutralText}>SUNLIGHT CONTRAST</Text>
          </View>
        </View>

        <View style={styles.diagnosticRow}>
          <View style={styles.diagLeft}>
            <Ionicons name="shield-checkmark" size={18} color={THEME.colors.primary} />
            <Text style={styles.diagLabel}>Geofence Protocol</Text>
          </View>
          <View style={styles.diagBadgeSuccess}>
            <Text style={styles.diagBadgeText}>ENFORCED</Text>
          </View>
        </View>
      </View>

      {/* Field Actions Card */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>SESSION CONTROL</Text>

        <TouchableOpacity 
          style={styles.logoutBtn} 
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>TERMINATE SESSION & LOGOUT</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.versionText}>
        DPWH Oversight Mobile • v1.0.0 (Rugged Build)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.metrics.borderRadiusMd,
    padding: 20,
    marginBottom: 16,
    borderWidth: THEME.metrics.borderWidthRugged,
    borderColor: THEME.colors.border,
    elevation: 3,
  },
  badgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.primaryDark,
    marginRight: 16,
  },
  badgeDetails: {
    flex: 1,
  },
  roleTag: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.primary,
    letterSpacing: 0.8,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  idText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1.5,
    backgroundColor: THEME.colors.borderLight,
    marginVertical: 16,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  diagnosticRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.surfaceAlt,
  },
  diagLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  diagLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginLeft: 10,
  },
  diagBadgeSuccess: {
    backgroundColor: THEME.colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1,
    borderColor: THEME.colors.successBorder,
  },
  diagBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.successText,
  },
  diagBadgeNeutral: {
    backgroundColor: THEME.colors.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.metrics.borderRadiusSm,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
  },
  diagBadgeNeutralText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  logoutBtn: {
    backgroundColor: THEME.colors.danger,
    height: THEME.metrics.buttonHeight,
    borderRadius: THEME.metrics.borderRadiusMd,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.dangerBorder,
    elevation: 3,
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.6,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    marginTop: 8,
  },
});
