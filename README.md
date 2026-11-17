# Community Water Point Tracker

**Student:** Moses Tandu Zachariah Hissen · Reg. No. 24/BCC/BU/R/0016  
**Course:** NoSQL Databases — Bugema University  
**Location context:** Kalagala Sub-county, Luweero District, Uganda

A mobile-first web application that lets community volunteers report broken water points,
dispatch the nearest available technician, and confirm repairs — all tracked in MongoDB.

> **Privacy notice:** This system stores personal contact information (reporter names, phone
> numbers, technician details). Any real-world deployment requires user consent, role-based
> access control, authentication, and HTTPS, in compliance with the
> **Uganda Data Protection and Privacy Act (2019)**.

---

## Table of Contents

1. [Project structure](#project-structure)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Seed / reset the database](#seed--reset-the-database)
5. [Running the app](#running-the-app)
6. [Running the tests](#running-the-tests)
7. [API reference](#api-reference)
8. [The five required queries](#the-five-required-queries)
9. [ACID transaction note](#acid-transaction-note)
10. [Screenshot checklist for PDF submission](#screenshot-checklist-for-pdf-submission)

---

## Project structure

```
NOSQL PROJECT/
├── backend/
│   ├── .env               ← secrets (not committed to git)
│   ├── .env.example       ← safe template (committed)
│   ├── server.js          ← Express app, middleware, route mounting
│   ├── db.js              ← singleton MongoClient
│   ├── routes/
│   │   ├── communities.js
│   │   ├── waterPoints.js
│   │   ├── technicians.js
│   │   ├── reports.js
│   │   └── stats.js
│   └── utils/
│       ├── idGenerator.js ← safe rpt_NNN ID generation
│       └── rateLimiter.js ← in-memory rate limiting
├── frontend/
│   ├── vite.config.js     ← port 3000, /api proxy to :5000
│   └── src/
│       ├── App.jsx         ← routing
│       ├── services/api.js ← all fetch calls (no secrets here)
│       ├── pages/          ← Dashboard, ReportBreakdown, ReportsList,
│       │                      WaterPoints, Statistics
│       └── components/     ← Navbar, Footer, StatusBadge, modals
├── scripts/
│   ├── seed_data.js              ← (re)seeds all four collections
│   ├── reset_transaction.js      ← resets only the docs used in demos
│   ├── test_phase1_endpoints.js  ← 13 read-endpoint tests
│   ├── test_phase2_endpoints.js  ← 9 write-endpoint tests
│   └── test_phase4_end_to_end.js ← full report→assign→resolve flow
└── README.md
```

---

## Prerequisites

| Tool | Minimum version | Check with |
|------|-----------------|------------|
| Node.js | v18+ | `node --version` |
| npm | v9+ | `npm --version` |
| MongoDB Community | v6+ | `mongod --version` |
| mongosh | any | `mongosh --version` |

MongoDB must be **running locally** before you start the backend.

---

## Installation

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Install frontend dependencies
cd ../frontend
npm install

# 3. Copy the environment template (first time only)
cd ../backend
copy .env.example .env
# Edit .env if your MongoDB runs on a different port or host.
```

---

## Seed / reset the database

### Complete reset for repeated viva demonstrations

Restores the original 4 collections to pristine seed data (5/6/5/5), seeds the 12 RBAC user accounts, applies the `statusHistory` audit trail, and clears transient notification/audit records:

```bash
node scripts/reset_all.js
```

Expected collection counts:
- `communities`: 5
- `waterPoints`: 6
- `technicians`: 5
- `reports`: 5
- `users`: 13 (1 admin, 1 officer, 5 community contacts, 5 technicians, 1 volunteer)
- `notifications`: 0
- `auditLog`: 0

---

## Role-Based Demo User Accounts & Passwords (For Local Testing Only)

> **Universal Demo Password:** `WaterTracker@2026` *(configured in `.env` as `DEMO_PASSWORD`)*  
> **Security Notice:** Fictional telephone numbers serve as unique login IDs in accordance with Uganda's **Data Protection and Privacy Act (2019)**. All passwords are encrypted using **bcrypt (cost 12)**.
>
> 💡 **Quick Login:** On the Web UI Login Page (`http://localhost:3000`), click the **`[ ⚡ Quick Demo Accounts ▾ ]`** professional dropdown menu to auto-fill any user's credentials in one click.

---

### 1. Administrative & District Management

| ID | Role | Name | Phone (Login) | Password | Email | Access Scope |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `user_13` | **System Administrator** | **Moses Tandu** | `0726 986 218` | `WaterTracker@2026` | `mosestandu856@gmail.com` | User management, approve/reject access, password resets, activity audit trail |
| `user_12` | **District Water Officer** | **Mohamed Abdi** | `0765 924 113` | `WaterTracker@2026` | `mohamed.abdi@luweero.go.ug` | Full district oversight, dispatch mechanics, repair closure, analytics, CSV exports |

---

### 2. Field Technicians (Water Mechanics)

| ID | Linked Tech | Name | Phone (Login) | Password | Email | Coverage & Skills |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `user_06` | `tech_01` | **Moses Zach** | `0726 927 445` | `WaterTracker@2026` | `moses.zach@watertech.ug` | Covers Bugema (`com_01`) & Kalagala (`com_02`) · Borehole, Hand pump |
| `user_07` | `tech_02` | **Gatrude** | `0782 200 302` | `WaterTracker@2026` | `gatrude@watertech.ug` | Covers Ziroobwe (`com_03`) & Wobulenzi (`com_05`) · Piped water, Tap stand |
| `user_08` | `tech_03` | **Joseph** | `0701 300 403` | `WaterTracker@2026` | `joseph@watertech.ug` | Covers Bamunanika (`com_04`) · Hand pump, Shallow well *(Off-duty)* |
| `user_09` | `tech_04` | **Brian Erick** | `0752 400 504` | `WaterTracker@2026` | `brian.erick@watertech.ug` | Covers Kalagala (`com_02`), Ziroobwe (`com_03`), Bamunanika (`com_04`) · Borehole, Testing |
| `user_10` | `tech_05` | **Dominic Lopir** | `0774 500 605` | `WaterTracker@2026` | `dominic.lopir@watertech.ug` | Covers Bugema (`com_01`) · Hand pump |

---

### 3. Student Volunteers

| ID | Role | Name | Phone (Login) | Password | Email | Field Responsibilities |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `user_11` | **Student Volunteer** | **Zachariah** | `0765 924 114` | `WaterTracker@2026` | `zachariah@bugema.ac.ug` | Mobile fault reporting across all settlements, public water status, filed reports history |

---

### 4. Community Contacts (Settlement Level)

| ID | Community | Name | Phone (Login) | Password | Email | Community Role & Scope |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `user_01` | **Bugema (`com_01`)** | **Hissen** | `0765 924 115` | `WaterTracker@2026` | `hissen@bugema.ac.ug` | Local Council Chairperson · Scoped strictly to Bugema water points & reports |
| `user_02` | **Kalagala (`com_02`)** | **Fahad** | `0700 000 102` | `WaterTracker@2026` | `fahad@kalagala.org` | Market Committee Chairperson · Scoped strictly to Kalagala water points & reports |
| `user_03` | **Ziroobwe (`com_03`)** | **Solomon** | `0700 000 103` | `WaterTracker@2026` | `solomon@health.go.ug` | Health Volunteer · Scoped strictly to Ziroobwe water points & reports |
| `user_04` | **Bamunanika (`com_04`)** | **Kitumba** | `0700 000 104` | `WaterTracker@2026` | `kitumba@bamunanika.org` | Local Council Chairperson · Scoped strictly to Bamunanika water points & reports |
| `user_05` | **Wobulenzi (`com_05`)** | **Ryder Kunar** | `0700 000 105` | `WaterTracker@2026` | `ryder.kunar@schools.ug` | School Administrator · Scoped strictly to Wobulenzi water points & reports |

---

## Production Hardening & Activity Log Integrity (Check D6)

The application activity log is **append-only by design**. To strictly enforce this at the database engine layer in production, configure a dedicated database user restricted exclusively to `insert` and `find` privileges on `auditLog`:

```javascript
// Run in mongosh against the admin database:
use waterTracker;

// 1. Create a custom role with append-only access to auditLog and standard RW access elsewhere:
db.createRole({
  role: "waterTrackerAppRole",
  privileges: [
    {
      resource: { db: "waterTracker", collection: "auditLog" },
      actions: ["find", "insert"] // Strictly no update, no remove
    },
    {
      resource: { db: "waterTracker", collection: "" },
      actions: ["find", "insert", "update", "remove"]
    }
  ],
  roles: []
});

// 2. Create the application user:
db.createUser({
  user: "waterAppUser",
  pwd: passwordPrompt(),
  roles: [{ role: "waterTrackerAppRole", db: "waterTracker" }]
});
```

> **Important Deployment Note:** Database-level role enforcement is active only when MongoDB authentication (`--auth`) is enabled and the application connects with that specific credentials pair. In the local development demo without `--auth`, append-only behavior is guaranteed by the Express API, which exposes zero `PUT`, `PATCH`, or `DELETE` endpoints on `/api/audit`.

### Honest Production Readiness Assessment
This project was constructed as an academic assignment. While security-hardened (bcrypt cost 12, httpOnly JWT cookies, strict RBAC, NoSQL operator sanitization, rate limiting), the following production components remain intentionally out of scope:
- **Phone Ownership Verification**: Registration does not verify handset possession via SMS OTP.
- **Out-of-Band Delivery**: No physical SMS gateway or email service is connected.
- **CAPTCHA**: Public forms rely on rate limiting rather than bot challenges.
- **Penetration Testing**: An independent professional security audit has not been conducted.

---

## Running the app

Open **two terminals** side by side:

**Terminal 1 — Backend API**

```bash
cd backend
npm start
# → http://localhost:5000
# Healthcheck: http://localhost:5000/api/health
```

**Terminal 2 — Frontend (development)**

```bash
cd frontend
npm run dev
# → http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Running the tests

The backend must be running (`npm start` in `/backend`) before you run tests.

```bash
# Phase 1 — all read endpoints (13 tests)
node scripts/test_phase1_endpoints.js

# Phase 2 — write endpoints: create, assign, resolve (9 tests)
node scripts/test_phase2_endpoints.js

# Phase 4 — end-to-end flow: report → assign → resolve (3 steps)
node scripts/test_phase4_end_to_end.js
```

All tests should print `PASS`. The Phase 2 and Phase 4 tests modify data;
run `reset_transaction.js` afterwards to restore the seed state.

---

## API reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | DB connection check + collection counts |
| GET | `/api/communities` | All communities |
| GET | `/api/water-points` | All water points (filter: `status`, `communityId`, `type`) |
| GET | `/api/water-points/:id` | One water point + community name + report history |
| GET | `/api/technicians` | All technicians (filter: `communityId`, `available`, `skill`) |
| GET | `/api/reports` | All reports (filter: `status`, `severity`; open reports sorted oldest-first) |
| POST | `/api/reports` | Create a new breakdown report |
| PATCH | `/api/reports/:id/assign` | Assign an available technician (409 if not eligible) |
| GET | `/api/reports/:id/messages` | Fetch in-system job chat messages |
| POST | `/api/reports/:id/messages` | Post a message on the job negotiation thread |
| PATCH | `/api/reports/:id/quote` | Technician submits agreed price quote before work starts |
| PATCH | `/api/reports/:id/approve-quote` | District Officer approves quote & authorizes commencement |
| POST | `/api/reports/:id/resolve` | Mark repaired — **ACID transaction** (or compensating rollback) |
| PATCH | `/api/reports/:id/payment` | District Officer disburses Mobile Money payment |
| GET | `/api/stats/summary` | KPI counts: working/broken/low-yield WPs, open/assigned/resolved reports |
| GET | `/api/stats/broken-by-community` | Aggregation: broken WPs grouped by community with household impact |
| GET | `/api/stats/mta-mttr` | Mean Time to Assign and Mean Time to Resolve |
| GET | `/api/stats/cost-by-type` | Total repair cost grouped by water point type |

---

## The five required queries

These map directly to the five required mongosh queries in the assignment:

| # | Query | API endpoint | mongosh equivalent |
|---|-------|-------------|-------------------|
| 1 | Broken water points | `GET /api/water-points?status=broken` | `db.waterPoints.find({ status:"broken" })` |
| 2 | Free technicians in a community | `GET /api/technicians?communityId=com_02&available=true` | `db.technicians.find({ coversCommunities:"com_02", available:true })` |
| 3 | Open reports, oldest first | `GET /api/reports?status=open` | `db.reports.find({ status:"open" }).sort({ reportedAt:1 })` |
| 4 | Record a finished repair | `POST /api/reports/:id/resolve` | Multi-document transaction (see below) |
| 5 | Broken points per community | `GET /api/stats/broken-by-community` | `$match → $group → $lookup → $sort` aggregation pipeline |

---

## ACID transaction note

The resolve endpoint (`POST /api/reports/:id/resolve`) must atomically:

1. Set the report to `status: "resolved"`, record `resolvedAt`, `costUGX`, and `notes`.
2. Set the linked water point to `status: "working"`.

**If MongoDB is running as a replica set**, the endpoint uses a true multi-document
ACID transaction (`session.startTransaction()` / `session.commitTransaction()`).
Both updates succeed together or both are rolled back.

**If MongoDB is running as a standalone node** (the default for a local development
install), transactions are not supported. The endpoint falls back to a *compensating
rollback*: it attempts both updates sequentially, and if the second fails it manually
reverses the first. This is clearly logged in the server console.

To enable true transactions, start MongoDB as a replica set:
```
# In mongod.cfg, uncomment:
replication:
  replSetName: "rs0"
# Then in mongosh:
rs.initiate()
```

---

## Screenshot checklist for PDF submission

### Compass — static data evidence

| # | File name | What to show |
|---|-----------|-------------|
| 01 | `screenshots/01_database_overview.png` | `waterTracker` DB with 4 collections, counts 5 / 6 / 5 / 5 |
| 02 | `screenshots/02_communities_docs.png` | Documents tab of `communities` — all 5 documents |
| 03 | `screenshots/03_waterPoints_docs.png` | Documents tab of `waterPoints` — all 6 documents |
| 04 | `screenshots/04_technicians_docs.png` | Documents tab of `technicians` — all 5 documents |
| 05 | `screenshots/05_reports_docs.png` | Documents tab of `reports` — all 5 documents |
| 06 | `screenshots/06_query1_broken.png` | Filter `{ "status": "broken" }` on `waterPoints` → wp_02, wp_05 |
| 07 | `screenshots/07_query2_technicians.png` | Filter `{ "coversCommunities": "com_02", "available": true }` → tech_01, tech_04 |
| 08 | `screenshots/08_query3_fifo.png` | Filter `{ "status": "open" }`, Sort `{ "reportedAt": 1 }` → rpt_002, rpt_003 |
| 09 | `screenshots/09_query4_resolved.png` | After resolve: `reports` showing `rpt_001` with `status:"resolved"`; `waterPoints` showing `wp_01` with `status:"working"` |
| 10 | `screenshots/10_query5_aggregation.png` | Aggregations tab with `$match { status:"broken" }` → `$group` → `$lookup` stages |
| 11 | `screenshots/11_schema_analysis.png` | Schema tab on `reports` showing field types |

### Web UI — app screenshots

| # | File name | What to show |
|---|-----------|-------------|
| 12 | `screenshots/12_dashboard.png` | Dashboard with KPI cards (working/broken/low-yield/open) and broken points list |
| 13 | `screenshots/13_report_form.png` | Report Breakdown form with community and water point selected |
| 14 | `screenshots/14_reports_list.png` | Reports list showing open + assigned + resolved tabs |
| 15 | `screenshots/15_assign_modal.png` | Assign Technician modal — filtered list of available mechanics with phone |
| 16 | `screenshots/16_mark_repaired_form.png` | Mark Repaired form with costUGX and notes filled in |
| 17 | `screenshots/17_resolved_report.png` | Reports list after resolve — showing the resolved report with cost in UGX |
| 18 | `screenshots/18_water_points_catalog.png` | Water Points page with status filter applied |
| 19 | `screenshots/19_water_point_detail.png` | Water point detail modal showing report history |
| 20 | `screenshots/20_statistics.png` | Statistics page — broken-by-community bars + MTA/MTTR cards |

---

*Generated for NoSQL Databases assignment — Bugema University, 2024/2025.*
