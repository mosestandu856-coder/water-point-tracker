# Comprehensive Screenshot Checklist — PDF Submission & Viva Defense

**Student:** Moses Tandu Zachariah Hissen  
**Registration Number:** 24/BCC/BU/R/0016  
**Course:** Bachelor of Science in Cloud Computing / Computer Science  
**Institution:** Bugema University, School of Science and Technology  
**Project:** Community Water Point Tracker — Role-Based Infrastructure Monitoring  
**Target Environment:** Kalagala Sub-county, Luweero District, Uganda  

> Save all screenshots into the `screenshots/` directory at the project root using the exact numbered filenames below so they directly align with your final coursework submission and viva presentation slides.

---

## PART A: MongoDB Compass Evidence (Database Architecture)

Start MongoDB (`mongod`) and connect MongoDB Compass to `mongodb://localhost:27017`. Select the `waterTracker` database.

### A1 · Database Overview & Collection Counts
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/01_database_overview.png` |
| **Location** | Compass &rarr; click `waterTracker` in the left navigation panel |
| **What to Show** | All collections listed with their document counts: `communities` (5), `waterPoints` (6), `technicians` (5), `reports` (5), `users` (12), `notifications` (0+), `auditLog` (0+). |
| **Viva Talking Point** | Proves the 4 original collections remain exactly at 5/6/5/5, with the 5th collection (`users`, 12 accounts) cleanly added without breaking backward compatibility. |

---

### A2 · Core Collection Documents
| # | File Name | Collection | Key Fields & Details to Highlight |
| :--- | :--- | :--- | :--- |
| **02** | `screenshots/02_communities_docs.png` | `communities` | All 5 documents (`com_01` to `com_05`), showing parish/village names, contact names, and phone numbers. |
| **03** | `screenshots/03_waterPoints_docs.png` | `waterPoints` | All 6 documents (`wp_01` to `wp_06`), showing technology `type`, `status` (`working`, `broken`, `low_yield`), and `householdsServed`. |
| **04** | `screenshots/04_technicians_docs.png` | `technicians` | All 5 documents (`tech_01` to `tech_05`), highlighting `coversCommunities[]`, `skills[]`, and boolean `available`. |
| **05** | `screenshots/05_reports_docs.png` | `reports` | All 5 documents (`rpt_001` to `rpt_005`), showing `statusHistory[]` array, `status`, and `severity`. |
| **06** | `screenshots/06_users_docs.png` | `users` | The 12 user accounts showing string IDs (`user_01`..`user_12`), `role` (`officer`, `community`, `technician`, `volunteer`), `linkedId`, and bcrypt `passwordHash`. |

---

### A3 · Index Architecture & EXPLAIN Evidence
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/07_indexes_waterPoints.png` |
| **Location** | Compass &rarr; `waterPoints` collection &rarr; **Indexes** tab |
| **What to Show** | `{ status: 1 }`, `{ communityId: 1, status: 1 }`, `{ location: "2dsphere" }`. |
| **Viva Talking Point** | Demonstrates single-field, compound, and geospatial indexes avoiding COLLSCAN. |

| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/08_indexes_reports_fifo.png` |
| **Location** | Compass &rarr; `reports` collection &rarr; **Indexes** tab |
| **What to Show** | Compound index `{ status: 1, reportedAt: 1 }` and `{ assignedTo: 1, status: 1 }`. |
| **Viva Talking Point** | Pre-sorted B-tree eliminates in-memory RAM sorting on Query 3 FIFO dispatch queues. |

---

### A4 · Five Required Database Queries

#### Query 1: Broken Water Points
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/09_query1_broken_waterpoints.png` |
| **Collection** | `waterPoints` |
| **Filter** | `{ status: "broken" }` |
| **Expected Result** | Exactly 2 documents: `wp_02` (Kisozi Spring) and `wp_05` (Kiwenda Borehole). |

#### Query 2: Free Technicians in Community
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/10_query2_free_technicians.png` |
| **Collection** | `technicians` |
| **Filter** | `{ coversCommunities: "com_02", available: true }` |
| **Expected Result** | Exactly 2 technicians: `tech_01` (John Mugisha) and `tech_04` (Grace Nalwoga). |

#### Query 3: Open Breakdown Reports (FIFO Queue)
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/11_query3_fifo_open_reports.png` |
| **Collection** | `reports` |
| **Filter & Sort** | Filter: `{ status: "open" }` &bull; Sort: `{ reportedAt: 1 }` |
| **Expected Result** | `rpt_002` first (oldest), followed by `rpt_003`. |

#### Query 4: Repair Closure Multi-Document ACID Transaction
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/12_query4_atomic_closure.png` |
| **Collections** | Compass side-by-side or consecutive views of `reports` and `waterPoints` |
| **What to Show** | `reports` document showing `status: "resolved"`, `costUGX: 60000`, `statusHistory` appended, and `waterPoints` document showing `status: "working"`. |

#### Query 5: Broken Water Points per Community (Aggregation)
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/13_query5_broken_by_community.png` |
| **Location** | Compass &rarr; `waterPoints` collection &rarr; **Aggregations** tab |
| **Pipeline** | `$match { status: "broken" }` &rarr; `$group { _id: "$communityId", count: { $sum: 1 } }` &rarr; `$lookup communities` &rarr; `$sort` |
| **Expected Result** | Kalagala (`com_01`, 1 broken) and Ziroobwe (`com_02`, 1 broken). |

---

### A5 · JSON Schema Validation Engine
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/14_schema_validation_users.png` |
| **Location** | Compass &rarr; `users` collection &rarr; **Validation** tab |
| **What to Show** | Native `$jsonSchema` validator enforcing required fields (`_id`, `name`, `phone`, `role`, `passwordHash`) and role enum restrictions. |

---

## PART B: Web Application User Interface (Role-Based Dashboards)

Start backend (`cd backend && npm start`) and frontend (`cd frontend && npm run dev`), then navigate to `http://localhost:3000`.

### B1 · Authentication & Demo Personas
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/15_login_screen_personas.png` |
| **URL** | `http://localhost:3000/login` |
| **What to Show** | Clean login form with the 4 one-click demo persona cards (District Officer, Community Contact, Technician, Student Volunteer). |

---

### B2 · Role 1: District Officer Console (`user_12`)
| # | File Name | Screen / Tab | What to Show |
| :--- | :--- | :--- | :--- |
| **16** | `screenshots/16_officer_overview_kpi.png` | **District Overview** | Summary KPI cards (Working, Broken, Low Yield, Open, Assigned, Resolved, Affected Households), Oldest-Open Alert banner, MTA & MTTR metric cards. |
| **17** | `screenshots/17_officer_broken_by_community.png` | **District Overview** | Query 5 horizontal progress bars showing broken points and affected population per settlement. |
| **18** | `screenshots/18_officer_cost_by_tech.png` | **District Overview** | Cost expenditure breakdown table grouped by extraction technology (Borehole, Protected Spring, etc.). |
| **19** | `screenshots/19_officer_action_queue_sla.png` | **Action Queue** | Priority-sorted reports queue showing dynamic priority score (`points`) and red **SLA Overdue (>24h)** badges. |
| **20** | `screenshots/20_officer_dispatch_modal.png` | **Action Queue** | Click **"Assign"** &rarr; modal displaying **"Recommended Skill Match"** and active technician workloads. |
| **21** | `screenshots/21_officer_preventive_backlog.png` | **Preventive Maintenance** | Chronic Recurrence list (2+ breakdowns) and Service Backlog table (points never serviced or > 12 months overdue). |
| **22** | `screenshots/22_officer_fleet_workload.png` | **Technician Fleet** | Full roster of mechanics showing active jobs, completed jobs, total billed UGX, and availability toggles. |
| **23** | `screenshots/23_officer_user_mgmt_audit.png` | **User Accounts & Audit** | Registered user accounts table and immutable system audit log entries. |

---

### B3 · Role 2: Community Contact Dashboard (`user_01`, Esther Nakato)
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/24_community_contact_dashboard.png` |
| **Login** | Esther Nakato (`0700 000 101`) &rarr; Kalagala Village (`com_01`) |
| **What to Show** | Strictly scoped view showing Kalagala's water points (`wp_01`, `wp_02`), local contact information, and prominent **"Report Breakdown"** button. |

| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/25_community_timeline_progress.png` |
| **What to Show** | 4-step progress timeline on active report (`Reported` &rarr; `Assigned` &rarr; `In Progress` &rarr; `Resolved`) with plain-language status messages. |

---

### B4 · Role 3: Technician Dashboard (`user_06`, John Mugisha)
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/26_technician_my_jobs.png` |
| **Login** | John Mugisha (`0772 100 201`) |
| **What to Show** | **"My Assigned Repair Jobs"** queue, self-availability toggle switch, and direct `tel:` link to the community chairperson. |

| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/27_technician_start_work.png` |
| **What to Show** | Job transitioning to **"In Progress"** upon mechanic arrival. |

| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/28_technician_mark_repaired_modal.png` |
| **What to Show** | Repair closure modal with repair cost input (`UGX`) and replacement component notes before multi-document atomic commit. |

---

### B5 · Role 4: Student Volunteer Dashboard (`user_11`, Brian Mugabi)
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/29_volunteer_field_dashboard.png` |
| **Login** | Brian Mugabi (`0700 000 106`) |
| **What to Show** | Mobile-first field reporting form, **"My Filed Breakdown Reports"** tracking list, and read-only searchable directory of sub-county water points. |

---

### B6 · Notifications & In-App Alerts
| Item | Details |
| :--- | :--- |
| **File Name** | `screenshots/30_in_app_notifications_bell.png` |
| **What to Show** | Header notification bell showing unread badge count and dropdown listing chronological dispatch alerts (`report_filed`, `report_assigned`, `repair_resolved`). |

---

## Suggested PDF Layout Order for Coursework Submission

1. **Title Page**: Student Name, Registration Number (24/BCC/BU/R/0016), Course, Date, and Luweero District Map Context.
2. **Executive Architecture Overview**: Database diagram, 5 collections + 2 operational collections, RBAC permission matrix.
3. **Compass Evidence (Part A)**: Screenshots 01 through 14 (Overview, Collections, Indexes, Queries 1–5, Schema validation).
4. **Web UI Evidence (Part B)**: Screenshots 15 through 30 (Login, Officer Console, Community Contact, Technician, Volunteer, Notifications).
5. **EXPLAIN Verification Table**: Terminal output of `scripts/verify_indexes_explain.js` demonstrating 0ms `IXSCAN` performance.
6. **Code Listing Excerpts**: 
   - Multi-document ACID transaction block (`backend/routes/reports.js`)
   - Row-level database scoping middleware (`backend/middleware/auth.js`)
   - Query 5 aggregation pipeline (`backend/routes/stats.js`)
   - NoSQL injection sanitizer (`backend/middleware/sanitizer.js`)
7. **Viva Defense Summary**: Answers to Core Architectural Questions (Section 2 of `USABILITY_TEST_PLAN_AND_VIVA_GUIDE.md`).
