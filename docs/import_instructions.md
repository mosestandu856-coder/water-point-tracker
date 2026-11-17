# Manual Import Instructions for MongoDB Compass

## Prerequisites
- MongoDB Server running locally on `mongodb://localhost:27017`
- MongoDB Compass opened and connected to `mongodb://localhost:27017`
- Seed JSON files located in `data/`:
  - `data/communities.json`
  - `data/waterPoints.json`
  - `data/technicians.json`
  - `data/reports.json`

---

## Step 1: Create Database & Collections
1. In MongoDB Compass, in the left navigation sidebar or main screen, click the **"+"** next to **Databases** (or click **Create database**).
2. Set:
   - **Database Name:** `waterTracker`
   - **Collection Name:** `communities`
3. Click **Create Database**.
4. Inside `waterTracker`, create the remaining 3 collections by clicking **Create collection**:
   - `waterPoints`
   - `technicians`
   - `reports`

---

## Step 2: Import Seed Data (Repeat for each Collection)
For each collection:
1. Click the collection name in Compass (e.g. `communities`).
2. Click the green **Add Data** dropdown button at the top of the document view.
3. Select **Import JSON or CSV file**.
4. Browse to the matching file in your project folder:
   - For `communities` → select `data/communities.json`
   - For `waterPoints` → select `data/waterPoints.json`
   - For `technicians` → select `data/technicians.json`
   - For `reports` → select `data/reports.json`
5. Ensure the file format detected is **JSON**.
6. Click **Import**.
7. Observe the green confirmation toast: **"Import completed"** (Take a screenshot here for Phase 5 evidence!).

---

## Step 3: Verification
Verify the document counts displayed on the database overview page:
- `communities`: 5 documents
- `waterPoints`: 6 documents
- `technicians`: 5 documents
- `reports`: 5 documents
- **Total:** 21 documents
