# MongoDB Compass Screenshot Evidence Checklist

To satisfy the university assignment requirement for visual proof, capture the following screenshots directly inside **MongoDB Compass**. Save the captured image files into the [`screenshots/`](file:///c:/Users/Moses.DESKTOP-T41CS8K/Desktop/NOSQL%20PROJECT/screenshots) folder using the recommended filenames below.

---

### Screenshot 1: Database Overview & Collection Document Counts
- **Filename:** `screenshots/01_database_overview.png`
- **Compass View:** Click on the database name **`waterTracker`** in the left sidebar or databases list.
- **What to capture:** The main panel showing all 4 collections and their document counts:
  - `communities`: **5**
  - `waterPoints`: **6**
  - `technicians`: **5**
  - `reports`: **5**
  - Total: **21 documents**

---

### Screenshots 2 – 5: Import Completion Toasts ("Import completed")
Capture each collection immediately after importing its corresponding JSON file from [`data/`](file:///c:/Users/Moses.DESKTOP-T41CS8K/Desktop/NOSQL%20PROJECT/data):

1. **`screenshots/02_import_communities.png`**
   - Click `communities` collection &rarr; Add Data &rarr; Import JSON file &rarr; select `data/communities.json`.
   - Capture the green notification toast at the bottom/top: *"Import completed" (5 documents imported)*.
2. **`screenshots/03_import_waterPoints.png`**
   - Click `waterPoints` collection &rarr; Add Data &rarr; Import JSON file &rarr; select `data/waterPoints.json`.
   - Capture green toast: *"Import completed" (6 documents imported)*.
3. **`screenshots/04_import_technicians.png`**
   - Click `technicians` collection &rarr; Add Data &rarr; Import JSON file &rarr; select `data/technicians.json`.
   - Capture green toast: *"Import completed" (5 documents imported)*.
4. **`screenshots/05_import_reports.png`**
   - Click `reports` collection &rarr; Add Data &rarr; Import JSON file &rarr; select `data/reports.json`.
   - Capture green toast: *"Import completed" (5 documents imported)*.

---

### Screenshot 6: Query 1 — Broken Water Points
- **Filename:** `screenshots/06_query1_broken_waterpoints.png`
- **Compass View:** Open collection **`waterPoints`** &rarr; Documents tab.
- **Filter bar entry:**
  ```json
  { "status": "broken" }
  ```
- **What to capture:** The filter bar with the green **Find** button clicked, displaying the 2 matching documents (`wp_02` and `wp_05`).

---

### Screenshot 7: Query 2 — Available Technicians in Kalagala
- **Filename:** `screenshots/07_query2_available_technicians.png`
- **Compass View:** Open collection **`technicians`** &rarr; Documents tab.
- **Filter bar entry:**
  ```json
  { "coversCommunities": "com_02", "available": true }
  ```
- **What to capture:** The filter bar showing the 2 matching documents (`tech_01` Ibrahim Kalule and `tech_04` Mariam Nabirye).

---

### Screenshot 8: Query 3 — Open Reports Needing Technician (FIFO)
- **Filename:** `screenshots/08_query3_open_reports_fifo.png`
- **Compass View:** Open collection **`reports`** &rarr; Documents tab.
- **Filter bar entry:**
  - **Filter:** `{ "status": "open" }`
  - Click **Options** (dropdown) &rarr; **Sort:** `{ "reportedAt": 1 }`
- **What to capture:** The 2 open documents returned in chronological order: `rpt_002` (Oct 5) followed by `rpt_003` (Oct 11).

---

### Screenshot 9: Query 5 — Aggregation Pipeline (Broken Points Per Community)
- **Filename:** `screenshots/09_query5_aggregation_pipeline.png`
- **Compass View:** Open collection **`waterPoints`** &rarr; **Aggregations** tab.
- **Stages to build:**
  1. Stage 1: `$match` &rarr; `{ status: "broken" }`
  2. Stage 2: `$group` &rarr; `{ _id: "$communityId", brokenCount: { $sum: 1 } }`
  3. Stage 3: `$sort` &rarr; `{ _id: 1 }`
- **What to capture:** Compass Aggregation Pipeline Builder showing the stage cards and the preview showing `com_02: 1` and `com_03: 1`.

---

### Screenshot 10: Schema Tab & Validation Tab (Enhancements)
- **Filename:** `screenshots/10_compass_schema_tab.png`
- **Compass View:** Open collection **`reports`** or **`waterPoints`** &rarr; **Schema** tab &rarr; click **Analyze Schema**.
- **What to capture:** Compass visual schema breakdown showing types (`string`, `date`, `object`, `array`) and field distributions.
