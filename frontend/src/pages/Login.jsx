/**
 * Login.jsx — Community Water Point Tracker
 * Enterprise split-card layout (original, pre-Phase-2)
 *
 * Exports:
 *   normalisePhone          — strips formatting, ensures +256… or raw digits
 *   formatUgandaPhoneInput  — live input formatter for Uganda numbers
 *   formatPhoneInput        — alias of formatUgandaPhoneInput
 *   default Login           — the page component
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// ─── Phone helpers ────────────────────────────────────────────────────────────

/**
 * Normalise a Uganda phone string so the backend always receives +2567XXXXXXXX.
 * Accepts:
 *   07XXXXXXXX  → +2567XXXXXXXX
 *   7XXXXXXXX   → +2567XXXXXXXX
 *   +2567…      → +2567XXXXXXXX  (pass-through)
 *   2567…       → +2567XXXXXXXX
 */
export function normalisePhone(raw = "") {
  const digits = (raw || "").replace(/\D/g, "");
  // Strip country code prefix and return 07XXXXXXXX format
  // (matches what the server stores and the seed script uses)
  if (digits.startsWith("256") && digits.length >= 12) return "0" + digits.slice(3);
  if (digits.startsWith("0") && digits.length >= 9) return digits.slice(0, 10);
  if (digits.length === 9) return "0" + digits;
  return digits;
}

/**
 * Format a Uganda phone number for display while typing.
 * The left badge already shows "UG +256", so this function returns
 * only the subscriber digits grouped as: 7XX XXX XXX
 * (no +256 prefix in the input field itself).
 */
export function formatUgandaPhoneInput(raw = "") {
  // Strip everything except digits
  let digits = raw.replace(/\D/g, "");

  // Remove leading country code if the user pastes a full number
  if (digits.startsWith("256")) digits = digits.slice(3);
  if (digits.startsWith("0"))   digits = digits.slice(1);

  // Cap at 9 subscriber digits (7XX XXX XXX)
  digits = digits.slice(0, 9);

  // Build display — subscriber digits only, grouped with spaces
  if (digits.length === 0) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + " " + digits.slice(3);
  return (
    digits.slice(0, 3) +
    " " +
    digits.slice(3, 6) +
    " " +
    digits.slice(6)
  );
}

/** Alias kept for backward-compat */
export const formatPhoneInput = formatUgandaPhoneInput;

// Default pre-seeded demo accounts for instant availability during testing and viva defense
const DEFAULT_DEMO_ACCOUNTS = [
  { role: "admin",      name: "Moses Tandu",   phone: "0726 986 218", canonical: "0726986218" },
  { role: "officer",    name: "Mohamed Abdi",  phone: "0765 924 113", canonical: "0765924113" },
  { role: "technician", name: "Moses Zach",    phone: "0726 927 445", canonical: "0726927445" },
  { role: "volunteer",  name: "Zachariah",     phone: "0765 924 114", canonical: "0765924114" },
  { role: "community",  name: "Hissen",        phone: "0765 924 115", canonical: "0765924115" }
];
const DEFAULT_DEMO_PASSWORD = "WaterTracker@2026";

// ─── Component ────────────────────────────────────────────────────────────────

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Form state
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Dark mode
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  // Demo accounts — initialized with default accounts so it appears immediately on load
  const [demoAccounts, setDemoAccounts] = useState(DEFAULT_DEMO_ACCOUNTS);
  const [demoPassword, setDemoPassword] = useState(DEFAULT_DEMO_PASSWORD);
  const [demoDropdownOpen, setDemoDropdownOpen] = useState(false);
  const [selectedDemoRole, setSelectedDemoRole] = useState(null);
  const demoDropdownRef = useRef(null);

  // Close demo dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (demoDropdownRef.current && !demoDropdownRef.current.contains(event.target)) {
        setDemoDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Modals
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const passwordRef = useRef(null);

  // Dark mode toggle
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Caps Lock detection
  const handleKeyUp = (e) => {
    if (e.getModifierState) setCapsLock(e.getModifierState("CapsLock"));
  };

  // Phone input handler
  const handlePhoneChange = (e) => {
    setPhone(formatUgandaPhoneInput(e.target.value));
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const normPhone = normalisePhone(phone);
    if (!normPhone || !password) {
      setError("Please enter your phone number and password.");
      return;
    }
    setLoading(true);
    try {
      // Original: does NOT pass keepSignedIn to api.login
      await login(normPhone, password, keepSignedIn);
      const dest = location.state?.from?.pathname || "/";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err?.message || "Phone or password is incorrect. Check your number and password, or contact your district officer.");
    } finally {
      setLoading(false);
    }
  };

  // Load demo accounts from server when DEMO_MODE=true
  useEffect(() => {
    fetch("/api/auth/demo-accounts")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.accounts) {
          setDemoAccounts(data.accounts);
          setDemoPassword(data.password || "");
        }
      })
      .catch(() => {});
  }, []);

  // Fill demo credentials — uses phone from server or default persona
  const fillDemo = (account) => {
    setPhone(formatUgandaPhoneInput(account.phone));
    setPassword(demoPassword || DEFAULT_DEMO_PASSWORD);
    setError("");
    setSelectedDemoRole(account.role);
    setDemoDropdownOpen(false);
    setDemoOpen(false);
  };

  const helpTel = import.meta.env.VITE_HELP_PHONE_TEL || "tel:+256700000000";
  const helpDisplay = import.meta.env.VITE_HELP_PHONE_DISPLAY || "+256 700 000 000";

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 transition-colors duration-300">

      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between px-4 sm:px-8 py-3">
        <div className="flex items-center gap-3">
          {/* Brand icon */}
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 dark:bg-blue-500 text-white font-bold text-lg select-none">
            💧
          </span>
          <div>
            <span className="block font-bold text-slate-800 dark:text-slate-100 leading-tight tracking-tight">
              CWPT
            </span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 tracking-widest uppercase leading-none">
              Enterprise Portal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            aria-label="Toggle dark mode"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {dark ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl flex rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">

          {/* ── Left hero panel (hidden on mobile) ──────────────────────── */}
          <aside className="hidden md:flex flex-col justify-between w-2/5 bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-8 text-white">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <span className="text-3xl">💧</span>
                <div>
                  <p className="font-bold text-lg leading-tight">Community Water Point Tracker</p>
                  <p className="text-blue-200 text-xs tracking-widest uppercase">Bugema University</p>
                </div>
              </div>

              <h1 className="text-2xl font-extrabold leading-snug mb-3">
                Real-time infrastructure monitoring for every community.
              </h1>
              <p className="text-blue-100 text-sm leading-relaxed">
                Track water point status, manage repairs, and coordinate field technicians — all in one secure platform.
              </p>
            </div>

            {/* Live system indicator card */}
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-5 border border-white/20">
              <div className="flex items-center gap-2 mb-4">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400"></span>
                </span>
                <span className="text-xs font-semibold tracking-wide uppercase text-blue-100">Live System Status</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-blue-100 text-sm">Active Pumps</span>
                  <span className="text-white font-bold text-lg">142</span>
                </div>
                <div className="h-px bg-white/20" />
                <div className="flex justify-between items-center">
                  <span className="text-blue-100 text-sm">Flow Rate</span>
                  <span className="text-white font-bold text-lg">98.2%</span>
                </div>
                <div className="h-px bg-white/20" />
                <div className="flex justify-between items-center">
                  <span className="text-blue-100 text-sm">Served Today</span>
                  <span className="text-white font-bold text-lg">28k+</span>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Right form panel ─────────────────────────────────────────── */}
          <section className="flex-1 flex flex-col justify-center px-6 sm:px-10 py-10">
            <div className="max-w-sm w-full mx-auto">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
                Sign in
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-7">
                Use your registered phone number and password.
              </p>

              {error && (
                <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-4 py-3 text-red-700 dark:text-red-300 text-sm">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-5.25a.75.75 0 001.5 0V9a.75.75 0 00-1.5 0v3.75zm.75-6a.75.75 0 110 1.5.75.75 0 010-1.5z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-5">

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone number
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
                    {/* Country code badge */}
                    <span className="flex items-center gap-1.5 pl-3 pr-2 text-sm font-medium text-slate-600 dark:text-slate-300 border-r border-slate-300 dark:border-slate-600 select-none bg-slate-50 dark:bg-slate-700 py-2.5 shrink-0">
                      <span className="text-base leading-none">🇺🇬</span>
                      <span>UG +256</span>
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="7XX XXX XXX"
                      autoComplete="tel"
                      required
                      className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
                    <input
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={handleKeyUp}
                      onKeyDown={handleKeyUp}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg className="w-4.5 h-4.5 w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Caps Lock warning */}
                  {capsLock && (
                    <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Caps Lock is on
                    </p>
                  )}
                </div>

                {/* Keep signed in + Forgot password */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={keepSignedIn}
                      onChange={(e) => setKeepSignedIn(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-800"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">Keep me signed in</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotOpen(true); setForgotSent(false); setForgotPhone(""); }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg shadow transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              {/* Sign up link */}
              <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No account?{" "}
                <Link to="/signup" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Request access
                </Link>
              </p>

              {/* Professional Demo Dropdown Menu */}
              {demoAccounts.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800" ref={demoDropdownRef}>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setDemoDropdownOpen((prev) => !prev)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-haspopup="true"
                      aria-expanded={demoDropdownOpen}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">⚡</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {selectedDemoRole
                            ? `Demo: ${demoAccounts.find((a) => a.role === selectedDemoRole)?.name || ""} (${selectedDemoRole})`
                            : "Quick Demo Accounts"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          {selectedDemoRole ? "Change role" : "Choose persona"}
                        </span>
                        <svg
                          className={`w-4 h-4 transition-transform duration-200 ${demoDropdownOpen ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Floating Dropdown Menu */}
                    {demoDropdownOpen && (
                      <div className="absolute left-0 right-0 bottom-full mb-2 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                            Select Demo Account
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-700 px-2 py-0.5 rounded">
                            Pass: {demoPassword || DEFAULT_DEMO_PASSWORD}
                          </span>
                        </div>

                        <div className="p-1.5 space-y-1">
                          {demoAccounts.map((acc) => {
                            const isSelected = selectedDemoRole === acc.role;
                            return (
                              <button
                                key={acc.role}
                                type="button"
                                onClick={() => fillDemo(acc)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-semibold"
                                    : "hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 truncate">
                                  <span
                                    className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                                      acc.role === "admin"
                                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                                        : acc.role === "officer"
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                        : acc.role === "technician"
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                        : acc.role === "volunteer"
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                                        : "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
                                    }`}
                                  >
                                    {acc.role}
                                  </span>
                                  <span className="font-semibold truncate">{acc.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono text-slate-400 dark:text-slate-500 text-[11px]">
                                    {acc.phone}
                                  </span>
                                  {isSelected && (
                                    <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">✓</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Help desk link */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  Need help? Contact the help desk
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="text-center text-xs text-slate-400 dark:text-slate-600 py-4 px-4 space-y-1">
        <p>Protected by Enterprise Telemetry Security • Bugema University © 2026</p>
        <p className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors underline"
          >
            About
          </button>
          <span>·</span>
          <a href="#privacy" className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors underline">
            Privacy Notice
          </a>
        </p>
      </footer>

      {/* ── Forgot Password Modal ── WhatsApp-assisted reset ── */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          role="dialog" aria-modal="true" aria-labelledby="forgot-title">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 id="forgot-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Reset your password
              </h3>
              <button onClick={() => { setForgotOpen(false); setForgotPhone(""); setForgotSent(false); }}
                className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {forgotSent ? (
              /* ── Step 2: WhatsApp opened ── */
              <div>
                {/* Green confirmation banner */}
                <div style={{
                  background: "#f0fdf4", border: "1px solid #86efac",
                  borderRadius: "10px", padding: "1rem", marginBottom: "1.25rem",
                  textAlign: "center"
                }}>
                  <div style={{ fontWeight: 800, color: "#166534", fontSize: "0.95rem", marginBottom: "0.25rem" }}>
                    WhatsApp opened
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#15803d", lineHeight: 1.5 }}>
                    Your request has been sent to the system administrator.
                    They will reset your password and reply with a temporary one.
                  </div>
                </div>

                {/* What happens next */}
                <div style={{ fontSize: "0.82rem", color: "#475569", lineHeight: 1.7, marginBottom: "1.25rem" }}>
                  <div style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: "0.4rem" }}>What happens next:</div>
                  <ol style={{ paddingLeft: "1.2rem", margin: 0 }}>
                    <li>The admin receives your WhatsApp message</li>
                    <li>They reset your password in the system</li>
                    <li>They reply on WhatsApp with your new temporary password</li>
                    <li>Sign in with the temporary password</li>
                    <li>You will be asked to set a new password of your choice</li>
                  </ol>
                </div>

                <button onClick={() => { setForgotOpen(false); setForgotPhone(""); setForgotSent(false); }}
                  style={{
                    width: "100%", padding: "0.75rem",
                    background: "linear-gradient(135deg, #0369a1, #0284c7)",
                    color: "#fff", border: "none", borderRadius: "8px",
                    fontWeight: 700, fontSize: "0.875rem", cursor: "pointer"
                  }}>
                  Back to sign in
                </button>
              </div>
            ) : (
              /* ── Step 1: Enter phone and send via WhatsApp ── */
              <div>
                <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.25rem", lineHeight: 1.6 }}>
                  Enter your registered phone number. We will open WhatsApp with a
                  ready-made message to the system administrator who will reset your
                  password and reply to you.
                </p>

                {/* Phone input */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    color: "#64748b", marginBottom: "0.4rem" }}>
                    Your registered phone number
                  </label>
                  <div style={{
                    display: "flex", alignItems: "center",
                    border: "2px solid #e2e8f0", borderRadius: "8px", overflow: "hidden"
                  }}>
                    <span style={{
                      padding: "0.65rem 0.75rem", background: "#f8fafc",
                      borderRight: "1px solid #e2e8f0", fontSize: "0.82rem",
                      fontWeight: 700, color: "#475569", whiteSpace: "nowrap"
                    }}>
                      UG +256
                    </span>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="7XX XXX XXX"
                      value={forgotPhone}
                      onChange={e => setForgotPhone(formatUgandaPhoneInput(e.target.value))}
                      autoFocus
                      style={{
                        flex: 1, padding: "0.65rem 0.75rem", border: "none",
                        outline: "none", fontSize: "0.875rem", background: "transparent",
                        color: "#0f172a"
                      }}
                    />
                  </div>
                </div>

                {/* Admin contact info box */}
                <div style={{
                  background: "#f0f9ff", border: "1px solid #bae6fd",
                  borderRadius: "8px", padding: "0.85rem 1rem",
                  marginBottom: "1.25rem", fontSize: "0.82rem", color: "#0c4a6e"
                }}>
                  <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>Administrator contact</div>
                  <div style={{ color: "#0369a1" }}>+256 765 924 113</div>
                  <div style={{ color: "#64748b", marginTop: "0.15rem", fontSize: "0.78rem" }}>
                    Your message will be pre-written. Just tap Send in WhatsApp.
                  </div>
                </div>

                {/* Send via WhatsApp button */}
                <a
                  href={(() => {
                    const digits = forgotPhone.replace(/\D/g, "");
                    const local  = digits.startsWith("0") ? digits : "0" + digits;
                    const msg = encodeURIComponent(
                      `Hello, I am a registered user of the Community Water Point Tracker system.\n\n` +
                      `I have forgotten my password and need a reset.\n\n` +
                      `My registered phone number: +256 ${forgotPhone || "___________"}\n\n` +
                      `Please reset my password and reply with a temporary one. Thank you.`
                    );
                    return `https://wa.me/256765924113?text=${msg}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { if (forgotPhone.replace(/\D/g,"").length >= 7) setForgotSent(true); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: "0.5rem", width: "100%", padding: "0.75rem",
                    background: "linear-gradient(135deg, #065f46, #16a34a)",
                    color: "#fff", borderRadius: "8px", fontWeight: 700,
                    fontSize: "0.875rem", textDecoration: "none",
                    boxShadow: "0 4px 12px rgba(22,163,74,0.35)",
                    cursor: forgotPhone.replace(/\D/g,"").length < 7 ? "not-allowed" : "pointer",
                    opacity: forgotPhone.replace(/\D/g,"").length < 7 ? 0.5 : 1
                  }}
                >
                  {/* WhatsApp SVG icon */}
                  <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <circle cx="16" cy="16" r="16" fill="#25D366"/>
                    <path d="M23.5 20.3c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6 0-.3-.2-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.7-1-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.2.2 2 3 4.8 4.2.7.3 1.2.4 1.6.5.7.2 1.3.2 1.8.1.5-.1 1.6-.7 1.9-1.3.3-.6.3-1.1.2-1.3-.1-.1-.3-.2-.5-.3z" fill="white"/>
                    <path d="M16 4.5C9.6 4.5 4.5 9.6 4.5 16c0 2 .5 4 1.5 5.7L4.5 27.5l5.9-1.5c1.7.9 3.5 1.4 5.6 1.4 6.4 0 11.5-5.1 11.5-11.5S22.4 4.5 16 4.5zm0 21c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-3.5.9.9-3.4-.2-.4C6.5 19.3 6 17.7 6 16 6 10.5 10.5 6 16 6s10 4.5 10 10-4.5 9.5-10 9.5z" fill="white"/>
                  </svg>
                  Send request on WhatsApp
                </a>

                <button onClick={() => { setForgotOpen(false); setForgotPhone(""); }}
                  style={{
                    width: "100%", marginTop: "0.65rem", padding: "0.65rem",
                    background: "transparent", border: "1px solid #e2e8f0",
                    borderRadius: "8px", color: "#64748b", fontWeight: 600,
                    fontSize: "0.875rem", cursor: "pointer"
                  }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Help Desk Modal ────────────────────────────────────────────────── */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Help Desk</h3>
              <button
                onClick={() => setHelpOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-3">
              <p>For login issues or account access problems, contact the system administrator.</p>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">📞</span>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Help desk line</p>
                  <a
                    href={helpTel}
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {helpDisplay}
                  </a>
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Available Monday–Friday, 8:00 AM – 5:00 PM EAT.
              </p>
            </div>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-5 w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── About Modal ───────────────────────────────────────────────────── */}
      {aboutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">About CWPT</h3>
              <button
                onClick={() => setAboutOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-3xl">💧</span>
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">Community Water Point Tracker</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Bugema University — NoSQL Project</p>
                </div>
              </div>
              <p>
                CWPT is an enterprise water infrastructure monitoring platform that enables real-time tracking of community water points, technician dispatch, and repair management.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Built with React, Node.js, and MongoDB. © Bugema University 2026.
              </p>
            </div>
            <button
              onClick={() => setAboutOpen(false)}
              className="mt-5 w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
