# Usability Test Plan & Viva Defense Guide

**Student:** Moses Tandu Zachariah Hissen  
**Registration Number:** 24/BCC/BU/R/0016  
**Course:** Bachelor of Science in Cloud Computing / Computer Science  
**Institution:** Bugema University, School of Science and Technology  
**Project:** Community Water Point Tracker — Upgrade to Role-Based Infrastructure Monitoring  
**Target Environment:** Kalagala Sub-county, Luweero District, Uganda  

---

## SECTION 1: USABILITY TEST PLAN (FIELD SIMULATION)

### 1.1 Context & Objectives
In rural and peri-urban communities across Luweero District, water infrastructure systems frequently fail due to prolonged dispatch latency, lack of visibility into mechanic availability, and absence of verifiable maintenance histories. 

This usability test evaluates how effectively real-world actors can operate the web app on **low-cost Android smartphones (360px–412px wide)** across **intermittent mobile data (2G/3G/EDGE)**.

### 1.2 Target Participant Profiles (3–5 Test Users)

| Persona / Role | Representative User | Location / Context | Primary Device | Technical Literacy |
| :--- | :--- | :--- | :--- | :--- |
| **Community Contact** | Esther Nakato (`user_01`) | Chairperson, Kalagala Village (`com_01`) | Tecno Pop 7 (Android 12 Go) | Basic smartphone user (WhatsApp, Mobile Money) |
| **Local Technician** | John Mugisha (`user_06`) | Certified Pump Mechanic, Ziroobwe (`tech_01`) | Itel A60 (Android 11 Go) | Basic mechanic; needs quick tap targets & direct phone calls |
| **Student Volunteer** | Brian Mugabi (`user_11`) | Bugema University Water Volunteer | Infinix Smart 7 | Moderate literacy; frequent field reporter |
| **District Officer** | Eng. Charles Kibalama (`user_12`) | District Water Office, Luweero | Laptop & Samsung Galaxy A14 | High literacy; analyzes backlogs, MTA/MTTR, and CSV reports |

---

### 1.3 Field Testing Protocols & Scenario Tasks

#### Task 1: Incident Reporting by Community Chairperson (Esther Nakato)
- **Goal:** Report that Kalagala Central Borehole (`wp_01`) has suffered a cracked discharge pipe.
- **Protocol:**
  1. Login using one-click demo persona or phone `0700 000 101`.
  2. Observe that only Kalagala water points (`wp_01`, `wp_02`) are visible.
  3. Click **"Report Breakdown"**, select severity **"High"**, and submit.
  4. Verify the report appears in the active list with a 4-step progress timeline: **"Report Filed &bull; Awaiting Technician"**.
- **Success Criteria:** Task completed in < 60 seconds without validation errors.

#### Task 2: Technician Dispatch & Skill Ranking (Eng. Charles Kibalama)
- **Goal:** Assign the best-matched, available mechanic covering Kalagala.
- **Protocol:**
  1. Login as District Officer (`0700 000 100`).
  2. Review the **Oldest-Open Alert Banner** and navigate to the **Action Queue**.
  3. Click **"Assign Technician"** on the newly filed high-priority incident.
  4. Verify that the modal queries `/api/technicians/ranked-for-report/:id` and highlights John Mugisha (`tech_01`) with the green **"Recommended Skill Match"** badge.
  5. Confirm assignment.
- **Success Criteria:** Dispatch completed in < 45 seconds; technician receives in-app notification.

#### Task 3: On-Site Job Progression & Repair Closure (John Mugisha)
- **Goal:** Acknowledge job arrival, mark in progress, and execute repair closure.
- **Protocol:**
  1. Login as Technician John Mugisha (`0772 100 201`).
  2. Check **"My Assigned Repair Jobs"** — verify phone link to Esther Nakato is clickable via `tel:`.
  3. Click **"Start Work"** &rarr; verify status transitions to `in_progress` on the timeline.
  4. Click **"Mark Repaired"**, enter expenditure `75,000 UGX` and replacement notes (`"Replaced cracked cylinder gasket"`).
  5. Confirm closure &rarr; verify multi-document transaction restores `wp_01` to `working`.
- **Success Criteria:** Atomic closure completed with zero duplicate submissions and immediate receipt modal.

#### Task 4: Offline / Unstable Network Drop Resilience
- **Goal:** Test behavior when connectivity drops midway through dispatch.
- **Protocol:**
  1. Throttle network in Chrome DevTools to **"Slow 3G"** or **"Offline"**.
  2. Attempt to file a report.
  3. Observe UI feedback: button disables, spinner displays, and error alert displays a clear retry button without page crash.
- **Success Criteria:** Zero blank screens (Error Boundary catches unhandled exceptions); state is preserved on retry.

---

### 1.4 Usability Evaluation Metrics (SUS Framework)
Participants score the system across the standard 10-question **System Usability Scale (SUS)**:
1. *I think that I would like to use this system frequently.*
2. *I found the system unnecessarily complex.*
3. *I thought the system was easy to use.*
4. *I think that I would need the support of a technical person to be able to use this system.*
5. *I found the various functions in this system were well integrated.*
6. *I thought there was too much inconsistency in this system.*
7. *I would imagine that most people would learn to use this system very quickly.*
8. *I found the system very cumbersome to use.*
9. *I felt very confident using the system.*
10. *I needed to learn a lot of things before I could get going with this system.*

**Target Benchmark:** **SUS Score &ge; 82/100** (Grade A, Exceptional Usability for civic field applications).

---

## SECTION 2: VIVA DEFENSE PREPARATION GUIDE

### 2.1 Core Architectural Decisions

#### Q1: Why did you use the official MongoDB Node.js driver instead of Mongoose?
**Candidate Answer:**  
> *"Mongoose is an Object Data Modeling (ODM) abstraction library built on top of the native driver. In production civic systems with strict data sovereignty and low memory overhead, Mongoose introduces unnecessary abstraction layers, prototype pollution risks, and internal schema casting overhead.  
> 
> By using the official `mongodb` driver directly:
> 1. We execute native database commands (`runCommand`, `collMod`, `aggregate`, `startSession`).
> 2. We define JSON Schema validation directly inside the MongoDB engine via `$jsonSchema` validators, guaranteeing that validation rules are enforced even if documents are inserted via Compass, Mongo shell, or external scripts.
> 3. We maintain full control over multi-document ACID transactions with explicit session management."*

---

#### Q2: Why are collection `_id` values strings like `com_01` and `wp_01` instead of MongoDB default `ObjectId`?
**Candidate Answer:**  
> *"In a multi-stakeholder municipal system, human operators communicate IDs over low-fidelity VHF radios, SMS messages, and paper logbooks. An `ObjectId` like `671fca29e4b0123456789abc` is error-prone to dictate over a radio in Kalagala.  
> 
> String IDs like `wp_01` (Water Point 1) and `tech_01` (Technician 1) are deterministic, mnemonic, and instantly identifiable by district engineers and community chairpersons. Furthermore, MongoDB indexes string `_id` values as B-tree keys with equivalent performance to `ObjectId`."*

---

#### Q3: How is Row-Level Security (RLS) enforced, and why not just hide elements in the React UI?
**Candidate Answer:**  
> *"Client-side hiding in React is purely cosmetic. Any malicious user can open DevTools and issue `fetch('/api/reports')` directly against the backend.  
> 
> In our architecture, **the backend is the sole authority**. Every endpoint passes through `requireAuth` and `requireRole` middleware. Row-level scoping is enforced directly inside the database query:
> - When a **Community Chairperson** calls `GET /api/water-points`, the route injects `{ communityId: req.user.linkedId }` into the MongoDB filter.
> - When a **Technician** calls `GET /api/reports`, the server injects `{ assignedTo: req.user.linkedId }`.
> - When a **Volunteer** queries reports, the query injects `{ 'reportedBy.phone': req.user.phone }`.
> 
> Even if an attacker manipulates client requests, MongoDB will never return documents outside their cryptographic token scope."*

---

#### Q4: How does your repair-closure transaction work, and what happens if the network fails midway?
**Candidate Answer:**  
> *"Repair closure involves updating two distinct collections: setting the report status to `resolved` and resetting the linked water point status to `working`.
> 
> 1. On a **replica set**, we start a MongoDB ClientSession and execute a multi-document ACID transaction (`session.startTransaction()`). Both the report update and water point update are committed atomically via `session.commitTransaction()`. If either fails, `session.abortTransaction()` rolls back all writes.
> 2. On a **standalone node** (common in local student testing), we implemented a **compensating rollback pattern**: if updating the water point fails, the route immediately executes a compensating update resetting the report back to its prior state. This satisfies the durability and consistency requirements."*

---

#### Q5: Explain the 'Hybrid Status Rule' on report creation.
**Candidate Answer:**  
> *"When a breakdown report is filed, our business rules dictate:
> - If the water point is currently `working`, its status is updated to `broken`.
> - If the water point is already `low_yield`, its status is **strictly preserved as `low_yield`**.
> 
> This prevents severe logistical errors: a borehole with low seasonal aquifer yield should never be masked as completely broken, nor should seasonal low yield be erased by an auxiliary valve leak report."*

---

#### Q6: How do your compound indexes optimize Query 3 (FIFO queue) and avoid in-memory sorting?
**Candidate Answer:**  
> *"Our FIFO queue executes `reports.find({ status: 'open' }).sort({ reportedAt: 1 })`.
> 
> Without an index, MongoDB must perform a full collection scan (`COLLSCAN`) and load all documents into RAM to execute an in-memory sort stage (`SORT`). If RAM exceeds 100MB, MongoDB aborts the query.
> 
> We created a compound index `{ status: 1, reportedAt: 1 }`. The B-tree is organized first by `status`, and within each status, keys are already pre-sorted chronologically. MongoDB scans only the matching index keys (`IXSCAN`) and streams documents directly from disk in sorted order, resulting in:
> - `0 ms` execution time
> - Zero in-memory sorting
> - `totalDocsExamined === nReturned`."*

---

#### Q7: How does the application defend against NoSQL Operator Injection?
**Candidate Answer:**  
> *"NoSQL injection occurs when attackers send JSON payloads containing MongoDB query operators like `{"phone": {"$gt": ""}}`, causing authentication bypass or data leakage.
> 
> We mitigate this via three layers:
> 1. **Centralized Sanitizer Middleware (`backend/middleware/sanitizer.js`)**: Recursively inspects `req.body`, `req.query`, and `req.params`. Any payload key beginning with `$` or containing a `.` is immediately rejected with HTTP 400.
> 2. **Zod Strict Validation**: All route inputs are validated against strict schemas that reject non-string types.
> 3. **Parameterized Queries**: Queries only use explicit field equality (e.g. `{ phone: String(phone).trim() }`), never arbitrary evaluated objects."*

---

### 2.2 Production Gaps & Regulatory Compliance

#### Q8: Is this system ready for live field deployment? What gaps remain?
**Candidate Answer:**  
> *"While the application is built to production standards in its architecture, code quality, and security model, real-world deployment in Luweero District requires addressing three specific gaps:
> 
> 1. **SMS Gateway Integration**: Rural community contacts often have feature phones without continuous web access. The system requires an SMS provider (e.g. Africa's Talking) to broadcast dispatch notifications via SMS.
> 2. **HTTPS & TLS Encryption**: In production, cookies must include the `secure: true` flag and traffic must terminate on TLS 1.3 to prevent credential sniffing on public Wi-Fi or cellular networks.
> 3. **Automated Backup Strategy**: MongoDB Atlas automated snapshot backups with point-in-time recovery to survive server hardware failures.
> 4. **Uganda Data Protection and Privacy Act (2019) Compliance**:
>    - Citizen names and phone numbers constitute personal data under Section 10.
>    - The system must obtain consent upon submission, restrict officer access to legitimate public utility oversight, and implement data retention schedules."*

---

## SECTION 3: KEY DEMO CREDENTIALS CHEAT SHEET

| Role | Name | Phone (Username) | Password | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Officer** | Eng. Charles Kibalama | `0700 000 100` | `WaterTracker@2026` | Full district oversight, queue dispatch, analytics |
| **Community** | Esther Nakato | `0700 000 101` | `WaterTracker@2026` | Kalagala (`com_01`) local points & timeline |
| **Technician** | John Mugisha | `0772 100 201` | `WaterTracker@2026` | Assigned jobs (`tech_01`), start work, resolve |
| **Volunteer** | Brian Mugabi | `0700 000 106` | `WaterTracker@2026` | Mobile report form & public catalog |

*(All accounts are equipped with 1-click persona shortcut buttons on the `/login` screen for fast, seamless viva demonstrations.)*

