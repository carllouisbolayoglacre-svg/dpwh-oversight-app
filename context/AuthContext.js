import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

export const AuthContext = createContext({
  userToken: null,
  inspectorName: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState(null);
  const [inspectorName, setInspectorName] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        const storedId = await SecureStore.getItemAsync('inspector_id');
        const storedName = await SecureStore.getItemAsync('inspector_name');
        if (storedId) {
          setUserToken(storedId);
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

  const signIn = async (id, name) => {
    try {
      const stringId = String(id);
      const safeName = name ? String(name) : 'Inspector';
      await SecureStore.setItemAsync('inspector_id', stringId);
      await SecureStore.setItemAsync('inspector_name', safeName);
      setUserToken(stringId);
      setInspectorName(safeName);
    } catch (error) {
      console.error('Error saving credentials to SecureStore', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await SecureStore.deleteItemAsync('inspector_id');
      await SecureStore.deleteItemAsync('inspector_name');
    } catch (error) {
      console.error('Error removing credentials from SecureStore', error);
    } finally {
      setUserToken(null);
      setInspectorName(null);
    }
  };

  return (
    <AuthContext.Provider value={{ userToken, inspectorName, isLoading, signIn, signOut }}>
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
