// frontend/src/App.jsx
// Root application component.

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider }   from "./context/AuthContext";
import { ToastProvider }  from "./context/ToastContext";
import ErrorBoundary      from "./components/ErrorBoundary";
import ToastContainer     from "./components/ToastContainer";
import ProtectedRoute     from "./components/ProtectedRoute";
import { Navbar }         from "./components/Navbar";
import { Footer }         from "./components/Footer";

// Pages
import { Login }           from "./pages/Login";
import { SignUp }          from "./pages/SignUp";
import { PrivacyNotice }   from "./pages/PrivacyNotice";
import { Dashboard }       from "./pages/Dashboard";
import { ReportBreakdown } from "./pages/ReportBreakdown";
import { ReportsList }     from "./pages/ReportsList";
import { WaterPoints }     from "./pages/WaterPoints";
import { Statistics }      from "./pages/Statistics";

// Officer dashboard (dedicated routes so the officer never sees old generic pages)
import { OfficerDashboard } from "./pages/dashboards/OfficerDashboard";

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <ToastContainer />
          <Routes>
            {/* ── Auth routes ── */}
            <Route path="/login"   element={<Login />} />
            <Route path="/signup"  element={<SignUp />} />
            <Route path="/privacy" element={<PrivacyNotice />} />

            {/* ── App routes ── */}
            <Route
              path="/*"
              element={
                <div className="app-container">
                  <Navbar />
                  <main className="main-content">
                    <Routes>

                      {/* ── Officer dedicated routes ── */}
                      <Route path="/officer"
                        element={
                          <ProtectedRoute allowedRoles={["officer"]}>
                            <OfficerDashboard view="overview" />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/officer/queue"
                        element={
                          <ProtectedRoute allowedRoles={["officer"]}>
                            <OfficerDashboard view="queue" />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/officer/water-points"
                        element={
                          <ProtectedRoute allowedRoles={["officer"]}>
                            <OfficerDashboard view="water-points" />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/officer/reports"
                        element={
                          <ProtectedRoute allowedRoles={["officer"]}>
                            <OfficerDashboard view="reports" />
                          </ProtectedRoute>
                        }
                      />

                      {/* ── Home: role-based dashboard ── */}
                      <Route
                        path="/"
                        element={
                          <ProtectedRoute>
                            <Dashboard />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/report"
                        element={
                          <ProtectedRoute allowedRoles={["community", "volunteer"]}>
                            <ReportBreakdown />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/reports"
                        element={
                          <ProtectedRoute>
                            <ReportsList />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/water-points"
                        element={
                          <ProtectedRoute>
                            <WaterPoints />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/statistics"
                        element={
                          <ProtectedRoute allowedRoles={["officer"]}>
                            <Statistics />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                  <Footer />
                </div>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;