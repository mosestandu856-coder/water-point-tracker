// frontend/src/context/AuthContext.jsx
// Manages global user authentication state, role-based access, and session recovery.

import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Check if session cookie is already active on initial page load
  useEffect(() => {
    async function checkCurrentSession() {
      try {
        const data = await api.getMe();
        if (data && data.user) {
          setUser(data.user);
        }
      } catch (err) {
        // User is not authenticated; keep user as null
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    checkCurrentSession();
  }, []);

  // login accepts an optional keepSignedIn flag.
  // When true, the frontend stores a hint in sessionStorage so the UX can inform
  // the user; the actual cookie duration is controlled by the server.
  const login = async (phone, password, keepSignedIn = false) => {
    setAuthError(null);
    try {
      const data = await api.login(phone, password, keepSignedIn);
      setUser(data.user);
      if (keepSignedIn) {
        sessionStorage.setItem("wt_keep", "1");
      } else {
        sessionStorage.removeItem("wt_keep");
      }
      return data.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  const register = async (userData) => {
    setAuthError(null);
    try {
      const data = await api.register(userData);
      setUser(data.user);
      return data.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn("Logout error:", err.message);
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    role: user?.role || null,
    loading,
    authError,
    login,
    register,
    logout,
    isAuthenticated: !!user
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

