import React, { useEffect } from 'react';
import { View, ActivityIndicator, Image, StyleSheet, Platform, AppState } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginScreen from './screens/LoginScreen';
import PublicBrowseScreen from './screens/PublicBrowseScreen';
import PublicProjectDetailScreen from './screens/PublicProjectDetailScreen';
import PublicProgressEvidenceScreen from './screens/PublicProgressEvidenceScreen';
import PublicVerificationFilesScreen from './screens/PublicVerificationFilesScreen';
import ProjectListScreen from './screens/ProjectListScreen';
import ProjectMapScreen from './screens/ProjectMapScreen';
import CameraScreen from './screens/CameraScreen';
import ProfileScreen from './screens/ProfileScreen';
import PhotoGalleryScreen from './screens/PhotoGalleryScreen';
import ReportFormScreen from './screens/ReportFormScreen';
import { THEME } from './theme';
import { initDatabase } from './services/offlineDatabase';
import { startNetworkSyncWatcher, stopNetworkSyncWatcher } from './services/syncService';

// --- NAVIGATORS ---
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Utilitarian Rugged Bottom Tabs
function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: {
          backgroundColor: THEME.colors.primary,
          elevation: 4,
          shadowOpacity: 0.2,
        },
        headerTitleStyle: {
          color: '#FFFFFF',
          fontWeight: '900',
          fontSize: 18,
          letterSpacing: 0.5,
        },
        headerLeft: () => (
          <View style={styles.headerLogoFrame}>
            <Image source={require('./assets/dpwh-logo.png')} style={styles.headerLogo} resizeMode="contain" />
          </View>
        ),
        tabBarActiveTintColor: THEME.colors.primary,
        tabBarInactiveTintColor: THEME.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '800',
          marginBottom: 4,
        },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 2,
          borderTopColor: THEME.colors.borderLight,
          height: 64,
          paddingTop: 6,
        },
        tabBarIcon: ({ color, size, focused }) => {
          let iconName;
          if (route.name === 'Projects') {
            iconName = focused ? 'file-tray-full' : 'file-tray-full-outline';
          } else if (route.name === 'SiteMap') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'shield' : 'shield-outline';
          }
          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Projects" 
        component={ProjectListScreen} 
        options={{ 
          title: 'Field Assignments',
          headerTitle: 'DPWH FIELD OVERSIGHT',
        }} 
      />
      <Tab.Screen 
        name="SiteMap" 
        component={ProjectMapScreen} 
        options={{ 
          title: 'Site Map',
          headerTitle: 'GIS SITE & GEOFENCE MONITOR',
        }} 
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{ 
          title: 'Inspector ID',
          headerTitle: 'INSPECTOR CREDENTIALS',
        }} 
      />
    </Tab.Navigator>
  );
}

// Navigation Root reacting to authentication state
function NavigationRoot() {
  const { userToken, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={THEME.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" backgroundColor={THEME.colors.primaryDark} />
      <Stack.Navigator 
        screenOptions={{ 
          headerShown: false,
          headerStyle: {
            backgroundColor: THEME.colors.primary,
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: '900',
            fontSize: 18,
            letterSpacing: 0.5,
          },
        }}
      >
        {userToken == null ? (
          <>
            <Stack.Screen name="PublicBrowse" component={PublicBrowseScreen} />
            <Stack.Screen name="PublicProjectDetail" component={PublicProjectDetailScreen} />
            <Stack.Screen name="PublicProgressEvidence" component={PublicProgressEvidenceScreen} />
            <Stack.Screen name="PublicVerificationFiles" component={PublicVerificationFilesScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} />
            <Stack.Screen 
              name="ProjectMap" 
              component={ProjectMapScreen} 
              options={{ 
                headerShown: true,
                title: 'Project Geofence Map',
                headerBackTitle: 'Assignments',
              }} 
            />
            <Stack.Screen 
              name="Camera" 
              component={CameraScreen} 
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="PhotoGallery" 
              component={PhotoGalleryScreen} 
              options={{ 
                headerShown: false,
              }} 
            />
            <Stack.Screen 
              name="ReportForm" 
              component={ReportFormScreen} 
              options={{ 
                headerShown: true,
                title: 'Field Inspection Log',
                headerBackTitle: 'Gallery',
              }} 
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() {
  useEffect(() => {
    // 1. Initialize SQLite database & offline_reports table on app boot
    initDatabase().catch((err) => {
      console.error('[App] Failed to initialize SQLite offline database:', err);
    });

    // 2. Start automatic network state sync watcher
    startNetworkSyncWatcher((result) => {
      console.log(`[App] Background sync completed. Synced: ${result?.synced || 0}, Remaining: ${result?.remaining || 0}`);
    });

    // 3. Configure Android Sticky Immersive Fullscreen Mode (hides navigation/home buttons)
    let appStateSub = null;
    if (Platform.OS === 'android') {
      const applyImmersiveMode = async () => {
        try {
          await NavigationBar.setVisibilityAsync('hidden');
          if (typeof NavigationBar.setBehaviorAsync === 'function') {
            await NavigationBar.setBehaviorAsync('overlay-swipe');
          }
        } catch (navErr) {
          console.warn('[App] Could not set NavigationBar visibility:', navErr);
        }
      };

      applyImmersiveMode();

      // Ensure navigation bar stays hidden when returning from background or screen unlock
      appStateSub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          applyImmersiveMode();
        }
      });
    }

    return () => {
      stopNetworkSyncWatcher();
      appStateSub?.remove?.();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationRoot />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  headerLogoFrame: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    padding: 3,
    marginRight: 9,
  },
  headerLogo: {
    width: '100%',
    height: '100%',
  },
  center: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: THEME.colors.background 
  },
});
