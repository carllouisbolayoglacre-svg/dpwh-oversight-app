import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  ScrollView, 
  Platform 
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { API_URLS } from '../config';
import { THEME } from '../theme';

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter your inspector username and password.');
      return;
    }

    setIsAuthenticating(true);

    try {
      const response = await fetch(API_URLS.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      let data = {};
      try {
        data = await response.json();
      } catch (parseErr) {
        console.warn('Server response was not JSON:', parseErr);
      }

      if (response.ok && data.status === 'success') {
        await signIn(data.inspector_id, data.name);
      } else {
        Alert.alert(
          'Authentication Failed', 
          data.message || `Credentials could not be verified (Status: ${response.status}).`
        );
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Network Error', 'Could not establish connection to the DPWH field authentication server.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer} 
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* Government / Department Field Emblem */}
          <View style={styles.badgeHeader}>
            <View style={styles.emblemContainer}>
              <MaterialCommunityIcons name="shield-check" size={38} color={THEME.colors.primary} />
            </View>
            <Text style={styles.agencySubtitle}>REPUBLIC OF THE PHILIPPINES</Text>
            <Text style={styles.agencyTitle}>DPWH FIELD OVERSIGHT</Text>
            <Text style={styles.portalTag}>INFRASTRUCTURE VERIFICATION PORTAL</Text>
          </View>

          <View style={styles.divider} />

          {/* Form Fields with High-Contrast Outdoor Borders */}
          <Text style={styles.fieldLabel}>INSPECTOR USERNAME / BADGE ID</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person" size={20} color={THEME.colors.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="e.g. inspector_01"
              placeholderTextColor={THEME.colors.textMuted}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              editable={!isAuthenticating}
            />
          </View>

          <Text style={styles.fieldLabel}>SECURE PASSWORD</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed" size={20} color={THEME.colors.primary} style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter field access password"
              placeholderTextColor={THEME.colors.textMuted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!isAuthenticating}
            />
            <TouchableOpacity 
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeBtn}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={showPassword ? "eye-off" : "eye"} 
                size={20} 
                color={THEME.colors.textSecondary} 
              />
            </TouchableOpacity>
          </View>

          {/* High-Contrast Primary Deep Blue Action Button */}
          <TouchableOpacity 
            style={[styles.loginBtn, isAuthenticating && styles.loginBtnDisabled]} 
            onPress={handleLogin}
            disabled={isAuthenticating}
            activeOpacity={0.8}
          >
            {isAuthenticating ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.loginBtnText}>VERIFYING CREDENTIALS...</Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.loginBtnText}>AUTHENTICATE & ENTER</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Field Protocol Footer */}
          <View style={styles.footerInfo}>
            <MaterialCommunityIcons name="satellite-uplink" size={16} color={THEME.colors.textMuted} />
            <Text style={styles.footerInfoText}>
              Requires Hardware GPS & Network Access
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: THEME.colors.background,
  },
  card: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.metrics.borderRadiusLg,
    padding: 24,
    borderWidth: THEME.metrics.borderWidthRugged,
    borderColor: THEME.colors.border,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  badgeHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  emblemContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.primary,
    marginBottom: 10,
  },
  agencySubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    letterSpacing: 1,
  },
  agencyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.primary,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  portalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.warning,
    letterSpacing: 0.8,
    marginTop: 4,
    backgroundColor: THEME.colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  divider: {
    height: 1.5,
    backgroundColor: THEME.colors.borderLight,
    marginVertical: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.colors.border,
    borderRadius: THEME.metrics.borderRadiusSm,
    backgroundColor: THEME.colors.surfaceAlt,
    paddingHorizontal: 12,
    height: THEME.metrics.inputHeight,
    marginBottom: 16,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    padding: 0,
  },
  eyeBtn: {
    padding: 6,
  },
  loginBtn: {
    backgroundColor: THEME.colors.primary,
    height: THEME.metrics.buttonHeight,
    borderRadius: THEME.metrics.borderRadiusMd,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 2,
    borderColor: THEME.colors.primaryDark,
    elevation: 4,
  },
  loginBtnDisabled: {
    backgroundColor: '#64748B',
    borderColor: '#475569',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  footerInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  footerInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textMuted,
    marginLeft: 6,
  },
});