# Comprehensive Authentication UI & Component Guide (Login & Sign-Up)

**Project:** Community Water Point Tracker  
**Target Environment:** Kalagala Sub-county, Luweero District, Uganda &bull; Bugema University  
**Student:** Moses Tandu Zachariah Hissen (Reg. No. 24/BCC/BU/R/0016)  
**Standard:** WCAG 2.1 Level AA Accessible, Non-Compact Civic Tech Interface  

---

## 1. Executive Summary & Design Philosophy

The authentication architecture for the Community Water Point Tracker provides a **spacious, uncompact, and accessible** user interface supporting both non-technical community members (LC1 chairpersons, local artisans) and expert evaluators (district water engineers, oral defense examiners).

### Key Design Principles:
1. **Uncompact Visual Spacing:** Eliminates dense or cluttered inputs. Form groups maintain `1.65rem` vertical spacing, inputs have a minimum height of `50px`, and line-heights are set to `1.6–1.75` for effortless legibility.
2. **Clear Information Architecture:** Fieldsets clearly delineate *Personal Identification*, *System Role Authorization*, and *Security Credentials*.
3. **Dual Audience Optimization:**
   - **Everyday Civic Users:** Plain language microcopy, Ugandan phone format helpers, visible error states, and clear password confirmation match indicators.
   - **Expert & Examiner Users:** Direct keyboard hotkeys (`Alt + 1` through `Alt + 4`), instant viva demo personas, and live password strength metering.
4. **Data Sovereignty Compliance:** Formulated in accordance with the **Uganda Data Protection and Privacy Act (2019)**, ensuring citizen phone numbers and names are collected solely for utility dispatch and encrypted via bcrypt (cost 12).

---

## 2. Component Directory & Routing Architecture

| Route | Component | Purpose | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **`/login`** | [`frontend/src/pages/Login.jsx`](file:///c:/Users/Moses.DESKTOP-T41CS8K/Desktop/NOSQL%20PROJECT/frontend/src/pages/Login.jsx) | Dedicated Sign-In Portal | Password visibility toggle, `Alt+1..4` keyboard shortcuts, one-click demo personas, session cookie authentication. |
| **`/signup`** | [`frontend/src/pages/SignUp.jsx`](file:///c:/Users/Moses.DESKTOP-T41CS8K/Desktop/NOSQL%20PROJECT/frontend/src/pages/SignUp.jsx) | Dedicated Registration Portal | Interactive role cards, dynamic settlement picker, real-time password strength meter, auto-login. |
| **Global** | [`frontend/src/context/AuthContext.jsx`](file:///c:/Users/Moses.DESKTOP-T41CS8K/Desktop/NOSQL%20PROJECT/frontend/src/context/AuthContext.jsx) | Authentication State Provider | Exposes `login()`, `register()`, `logout()`, `user`, `role`, and `isAuthenticated`. |

---

## 3. Component Detailed Developer Specifications

### 3.1 Sign-In Component (`Login.jsx`)

#### Visual Structure & Layout:
- **Container (`.auth-container-spacious`):** Centered card, `max-width: 820px`, `2.75rem` vertical padding, soft shadow elevation (`0 10px 25px -5px rgba(0,0,0,0.08)`).
- **Header Section:**
  - Civic pill badge with glowing green status indicator: `"KALAGALA SUB-COUNTY INFRASTRUCTURE DESK • LUWEERO DISTRICT"`.
  - Main Title: `1.85rem` font weight 800 with `-0.025em` tracking.
  - Subtitle: `0.95rem` with `1.65` line height explaining role-based dispatch.
- **Form Groups:**
  - Telephone Input: `type="tel"`, `min-height: 50px`, with accessible aria-help hint.
  - Password Input: Includes an accessible `<button>` toggle for **"Show Password" / "Hide Password"**.
  - Submit Button: Full-width, `50px` min-height, disabled during in-flight network requests.
- **Viva Demo Oral Defense Section:**
  - Pre-configured grid of 4 role cards with prominent **`[Alt + X]`** hotkey tags.
  - Includes a global `keydown` event listener: pressing `Alt + 1` automatically logs in as the District Officer, `Alt + 2` as Community Contact, `Alt + 3` as Field Technician, and `Alt + 4` as Student Volunteer.

#### Developer Code Snippet (Keyboard Listener):
```jsx
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.altKey && !submitting) {
      const found = demoPersonas.find((p) => p.key === e.key);
      if (found) {
        e.preventDefault();
        executePersonaLogin(found.phone, found.name, found.title);
      }
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [submitting]);
```

---

### 3.2 Registration Component (`SignUp.jsx`)

#### Step-by-Step Sections:

#### Step 1: Personal Identification
- **Full Legal Name:** String, required.
- **Telephone Number:** String (10 digits), required. Serves as unique login identifier in MongoDB `users` collection (`{ phone: 1 }`, unique index).

#### Step 2: System Role Selection
- **Interactive Choice Cards (`.role-choice-card`):**
  - **Volunteer (`volunteer`):** Field reporter across all sub-county water points.
  - **Community Contact (`community`):** Village chairperson. Dynamically reveals the **Community Settlement Selector**.
  - **Technician (`technician`):** Pump mechanic logging site work and repair costs.
- **Settlement Dropdown (Conditional):** Fetches active communities from `api.getCommunities()`. Scopes the user's account cryptographically to that community's `_id` (`com_01` to `com_05`).

#### Step 3: Security & Passwords
- **Password Input (`type="password" | "text"`):** Includes real-time strength evaluation.
- **Live Password Strength Meter:**
  - **Weak (< 6 chars or no mix):** `#ef4444` red bar.
  - **Fair (length + numbers):** `#f59e0b` amber bar.
  - **Good (mixed case + numbers):** `#3b82f6` blue bar.
  - **Strong (length &ge; 10 + special chars):** `#10b981` green bar.
- **Confirm Password Input:** Real-time feedback (`"Passwords match perfectly"` in green, or `"Passwords do not match yet"` in red).

---

## 4. Design System Tokens (Non-Compact Spacing)

```css
/* Generous Whitespace Tokens */
--spacing-auth-container-padding: 2.75rem 2.5rem;
--spacing-fieldset-padding:       1.85rem 1.65rem 1.25rem 1.65rem;
--spacing-form-group-margin:      1.65rem;
--spacing-input-min-height:       50px;
--spacing-input-padding:          0.8rem 1rem;

/* Typography Scale */
--font-title-size:       1.85rem;
--font-title-line-height: 1.3;
--font-subtitle-size:    0.95rem;
--font-subtitle-line-height: 1.65;
--font-label-size:       0.88rem;
--font-label-weight:     700;
--font-helper-size:      0.78rem;
--font-helper-line-height: 1.55;

/* High-Contrast Color Palette */
--auth-border-strong: #cbd5e1;
--auth-focus-ring:    rgba(2, 132, 199, 0.22);
--auth-primary-text:  #0f172a;
--auth-muted-text:    #475569;
```

---

## 5. Accessibility (WCAG 2.1 AA) Compliance Matrix

| Criterion | Implementation in Water Tracker |
| :--- | :--- |
| **1.4.3 Contrast (Minimum)** | All label texts have contrast ratios &ge; 5.2:1 against white/card backgrounds. Badges use bold text paired with borders. |
| **2.1.1 Keyboard Navigation** | Every interactive element (role cards, inputs, toggle buttons, persona shortcuts) is focusable via `Tab` and triggers on `Enter` or `Space`. |
| **2.4.7 Focus Visible** | Active focus rings display a 3px prominent outline (`rgba(2, 132, 199, 0.22)`) with a high-contrast border. |
| **2.5.5 Target Size** | All buttons, role cards, and input controls meet or exceed the **44 &times; 44px** minimum touch boundary. |
| **3.3.1 Error Identification** | Input errors and server validation issues are announced in dedicated, high-contrast `alert-error` banners with `role="alert"`. |
| **2.3.3 Reduced Motion** | Respects `@media (prefers-reduced-motion: reduce)` by disabling transitions and animations for users with vestibular needs. |

---

## 6. Testing & Verification Checklist

To test both pages in your browser:
1. Open **`http://localhost:3000/login`**:
   - Verify uncompact layout and generous typography.
   - Click **"Show Password"** to toggle visibility.
   - Press **`Alt + 1`** on your keyboard &rarr; verifies expert hotkey logs in directly as District Officer.
2. Log out and navigate to **`http://localhost:3000/signup`**:
   - Verify spacious multi-fieldset layout.
   - Select **"Community Chairperson"** &rarr; observe settlement dropdown appears.
   - Type in the password field &rarr; observe live color-coded strength bar dynamically update.
   - Complete registration &rarr; verify account is created in MongoDB and automatically redirects to the dashboard.

