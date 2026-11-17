/**
 * SignUp.jsx — Community Water Point Tracker
 * Enterprise split-card layout (original, pre-Phase-2)
 *
 * - Name, phone (Uganda +256), password + confirm side-by-side
 * - Password strength meter (pwdStrength: 1=Weak, 2=Fair, 3=Good, 4=Strong)
 * - Role notice: public registrations → Volunteer
 * - Submit: "Request account"
 * - On success: confirmation card (hourglass, "Registration Submitted!", pending badge)
 * - register() sends only { name, phone, password } — no role, no linkedId
 * - Imports formatUgandaPhoneInput and normalisePhone from "./Login"
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatUgandaPhoneInput, normalisePhone } from "./Login";

// ─── Password strength scorer ─────────────────────────────────────────────────

/**
 * Returns a score 1–4:
 *   1 = Weak  (< 6 chars or only one character class)
 *   2 = Fair  (6+ chars, 2 character classes)
 *   3 = Good  (8+ chars, 3 character classes)
 *   4 = Strong (10+ chars, all 4 classes: upper, lower, digit, special)
 */
function pwdStrength(pwd = "") {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 6) score++;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 10) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) =>
    r.test(pwd)
  ).length;
  // Combine length score + class diversity
  const combined = Math.min(4, Math.floor((score + classes) / 2));
  return Math.max(1, combined);
}

const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = [
  "",
  "bg-red-500",
  "bg-amber-400",
  "bg-yellow-400",
  "bg-green-500",
];
const STRENGTH_TEXT = [
  "",
  "text-red-600 dark:text-red-400",
  "text-amber-600 dark:text-amber-400",
  "text-yellow-600 dark:text-yellow-400",
  "text-green-600 dark:text-green-400",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SignUp() {
  const { register } = useAuth();

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Dark mode
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  // About modal
  const [aboutOpen, setAboutOpen] = useState(false);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const strength = pwdStrength(password);

  const handlePhoneChange = (e) => {
    setPhone(formatUgandaPhoneInput(e.target.value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!phone) {
      setError("Please enter your phone number.");
      return;
    }
    if (!password) {
      setError("Please enter a password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const normPhone = normalisePhone(phone);
      // Original: sends only { name, phone, password } — no role, no linkedId
      await register({ name: name.trim(), phone: normPhone, password });
      setSubmitted(true);
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Confirmation card ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
        {/* Header */}
        <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between px-4 sm:px-8 py-3">
          <div className="flex items-center gap-3">
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
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
            {/* No icon */}

            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
              Registration Submitted!
            </h2>

            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
              Thank you, <span className="font-semibold text-slate-800 dark:text-slate-100">{name.trim()}</span>. Your account request has been recorded.
            </p>

            {/* Amber pending badge */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-semibold border border-amber-200 dark:border-amber-700 mb-6">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              Pending administrator approval
            </span>

            <div className="text-xs text-slate-400 dark:text-slate-500 mb-6 leading-relaxed">
              An administrator will review your request. You will be notified once your account is approved.
            </div>

            <Link
              to="/login"
              className="inline-block w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition-colors duration-150 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            >
              Back to Sign In
            </Link>
          </div>
        </main>

        <footer className="text-center text-xs text-slate-400 dark:text-slate-600 py-4 px-4">
          <p>Protected by Enterprise Telemetry Security • Bugema University © 2026</p>
        </footer>
      </div>
    );
  }

  // ── Registration form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 transition-colors duration-300">

      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between px-4 sm:px-8 py-3">
        <div className="flex items-center gap-3">
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
                Join the network protecting community water access.
              </h1>
              <p className="text-blue-100 text-sm leading-relaxed">
                Register to contribute reports, track repairs, and help ensure clean water for every community.
              </p>
            </div>

            {/* Live system indicator card */}
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-5 border border-white/20">
              <div className="flex items-center gap-2 mb-4">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400"></span>
                </span>
                <span className="text-xs font-semibold tracking-wide uppercase text-blue-100">Network Overview</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-blue-100 text-sm">Active Pumps</span>
                  <span className="text-white font-bold text-lg">142</span>
                </div>
                <div className="h-px bg-white/20" />
                <div className="flex justify-between items-center">
                  <span className="text-blue-100 text-sm">Parishes</span>
                  <span className="text-white font-bold text-lg">5</span>
                </div>
                <div className="h-px bg-white/20" />
                <div className="flex justify-between items-center">
                  <span className="text-blue-100 text-sm">Volunteers</span>
                  <span className="text-white font-bold text-lg">24+</span>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Right form panel ─────────────────────────────────────────── */}
          <section className="flex-1 flex flex-col justify-center px-6 sm:px-10 py-10">
            <div className="max-w-sm w-full mx-auto">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
                Create account
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-7">
                Request access to the CWPT platform.
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

                {/* Full name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Nakato Sarah"
                    autoComplete="name"
                    required
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Phone number
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
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

                {/* Password + Confirm (side-by-side on sm+) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Password
                    </label>
                    <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create password"
                        autoComplete="new-password"
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
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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

                    {/* Strength meter */}
                    {password.length > 0 && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4].map((lvl) => (
                            <div
                              key={lvl}
                              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                                strength >= lvl
                                  ? STRENGTH_COLOR[strength]
                                  : "bg-slate-200 dark:bg-slate-700"
                              }`}
                            />
                          ))}
                        </div>
                        <p className={`text-xs font-medium ${STRENGTH_TEXT[strength]}`}>
                          {STRENGTH_LABEL[strength]}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Confirm password
                    </label>
                    <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
                      <input
                        type={showConfirm ? "text" : "password"}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Repeat password"
                        autoComplete="new-password"
                        required
                        className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        aria-label={showConfirm ? "Hide password" : "Show password"}
                      >
                        {showConfirm ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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

                    {/* Match indicator */}
                    {confirm.length > 0 && (
                      <p
                        className={`mt-2 text-xs font-medium ${
                          password === confirm
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-500 dark:text-red-400"
                        }`}
                      >
                        {password === confirm ? "Passwords match" : "Passwords do not match"}
                      </p>
                    )}
                  </div>
                </div>

                {/* Role notice */}
                <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3">
                  <svg className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    Public registrations are automatically assigned the <span className="font-semibold">Volunteer</span> role. An administrator can update your role after approval.
                  </p>
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
                      Submitting…
                    </>
                  ) : (
                    "Request account"
                  )}
                </button>
              </form>

              {/* Sign in link */}
              <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Already have an account?{" "}
                <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="text-center text-xs text-slate-400 dark:text-slate-600 py-4 px-4 space-y-1">
        <p>Protected by Enterprise Telemetry Security • Bugema University © 2026</p>
        <p>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors underline"
          >
            About
          </button>
        </p>
      </footer>

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

export default SignUp;
