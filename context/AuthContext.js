import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

export const AuthContext = createContext({
  userToken: null,
  inspectorId: null,
  inspectorName: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState(null);
  const [inspectorId, setInspectorId] = useState(null);
  const [inspectorName, setInspectorName] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync('inspector_token');
        const storedId = await SecureStore.getItemAsync('inspector_id');
        const storedName = await SecureStore.getItemAsync('inspector_name');
        if (storedToken && storedId) {
          setUserToken(storedToken);
          setInspectorId(storedId);
          setInspectorName(storedName || 'Inspector');
        }
      } catch (error) {
        console.error('Failed to load credentials from SecureStore', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredAuth();
  }, []);

  const signIn = async (token, id, name) => {
    try {
      const stringId = String(id);
      const safeToken = String(token);
      const safeName = name ? String(name) : 'Inspector';
      await SecureStore.setItemAsync('inspector_token', safeToken);
      await SecureStore.setItemAsync('inspector_id', stringId);
      await SecureStore.setItemAsync('inspector_name', safeName);
      setUserToken(safeToken);
      setInspectorId(stringId);
      setInspectorName(safeName);
    } catch (error) {
      console.error('Error saving credentials to SecureStore', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await SecureStore.deleteItemAsync('inspector_id');
      await SecureStore.deleteItemAsync('inspector_token');
      await SecureStore.deleteItemAsync('inspector_name');
    } catch (error) {
      console.error('Error removing credentials from SecureStore', error);
    } finally {
      setUserToken(null);
      setInspectorId(null);
      setInspectorName(null);
    }
  };

  return (
    <AuthContext.Provider value={{ userToken, inspectorId, inspectorName, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
