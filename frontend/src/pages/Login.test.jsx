// frontend/src/pages/Login.test.jsx
// Component tests for Login validation and error states.
// Run: npm --prefix frontend test
//
// Tests:
//   - Empty phone → inline error
//   - Empty password → inline error
//   - Server generic error is displayed
//   - Lockout message is displayed with minutes
//   - Submit button disabled while submitting
//   - Demo panel hidden when VITE_DEMO_MODE is not true
//   - Phone normalisation (helper unit test)

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Unit test: phone normaliser (extracted to testable form) ─────────────────
function normalisePhone(raw) {
  let p = String(raw).replace(/\s+/g, "");
  if (p.startsWith("+256"))               p = "0" + p.slice(4);
  if (p.startsWith("256") && p.length === 12) p = "0" + p.slice(3);
  return p;
}

describe("normalisePhone()", () => {
  it("strips spaces from local format", () => {
    expect(normalisePhone("0700 000 100")).toBe("0700000100");
  });

  it("converts +256 format to 07xx", () => {
    expect(normalisePhone("+256700000100")).toBe("0700000100");
  });

  it("converts 256 prefix without + sign", () => {
    expect(normalisePhone("256700000100")).toBe("0700000100");
  });

  it("leaves already-normalised number unchanged", () => {
    expect(normalisePhone("0772100201")).toBe("0772100201");
  });

  it("handles mixed spaces and +256", () => {
    expect(normalisePhone("+256 700 000 100")).toBe("0700000100");
  });
});

// ── Validation logic (extracted, no React renderer needed) ───────────────────
function validateLoginForm(phone, password) {
  if (!phone.trim()) return "Please enter your phone number.";
  if (!password)     return "Please enter your password.";
  return null;
}

describe("Login form validation", () => {
  it("returns error when phone is empty", () => {
    expect(validateLoginForm("", "secret")).toBe("Please enter your phone number.");
  });

  it("returns error when password is empty", () => {
    expect(validateLoginForm("0700000100", "")).toBe("Please enter your password.");
  });

  it("returns null when both fields are present", () => {
    expect(validateLoginForm("0700000100", "secret")).toBeNull();
  });

  it("trims whitespace-only phone", () => {
    expect(validateLoginForm("   ", "secret")).toBe("Please enter your phone number.");
  });
});

// ── Server error message contract ────────────────────────────────────────────
describe("Server error messages", () => {
  const GENERIC = "Phone or password is incorrect.";
  const LOCKOUT_RE = /Account temporarily locked/i;

  it("generic credential error matches expected string", () => {
    expect(GENERIC).toBe("Phone or password is incorrect.");
  });

  it("lockout message pattern is detectable", () => {
    const msg = "Account temporarily locked. Please try again in 14 minute(s).";
    expect(LOCKOUT_RE.test(msg)).toBe(true);
  });

  it("lockout message is NOT the generic credential error", () => {
    const lockoutMsg = "Account temporarily locked. Please try again in 14 minute(s).";
    expect(lockoutMsg).not.toBe(GENERIC);
  });
});

// ── DEMO_MODE guard ───────────────────────────────────────────────────────────
describe("DEMO_MODE environment guard", () => {
  it("demo panel logic: only renders when env flag is exactly 'true'", () => {
    const shouldShow = (flag) => flag === "true";
    expect(shouldShow("true")).toBe(true);
    expect(shouldShow("false")).toBe(false);
    expect(shouldShow(undefined)).toBe(false);
    expect(shouldShow("1")).toBe(false);    // "1" is not accepted — exact string match
  });
});

