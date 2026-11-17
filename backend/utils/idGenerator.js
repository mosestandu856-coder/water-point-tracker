// backend/utils/idGenerator.js
// Utility to safely generate sequential string IDs in the 'rpt_NNN' format.
// Scans existing report IDs, extracts the highest numeric suffix, and increments by 1.

/**
 * Finds the highest rpt_NNN ID in the reports collection and returns the next ID string.
 * For example: if rpt_005 is the highest, returns "rpt_006".
 *
 * @param {import("mongodb").Db} db - The MongoDB database instance.
 * @returns {Promise<string>} Next formatted report ID string.
 */
async function getNextReportId(db) {
  // Find the report with the highest string _id matching rpt_XXX
  const highestReport = await db
    .collection("reports")
    .find({ _id: { $regex: /^rpt_\d+$/ } })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();

  if (!highestReport || highestReport.length === 0) {
    return "rpt_001";
  }

  // Extract the numeric portion (e.g. "005" -> 5)
  const match = highestReport[0]._id.match(/^rpt_(\d+)$/);
  const currentNum = match ? parseInt(match[1], 10) : 0;
  const nextNum = currentNum + 1;

  // Format with leading zeros (e.g. 6 -> "rpt_006")
  return `rpt_${String(nextNum).padStart(3, "0")}`;
}

module.exports = {
  getNextReportId
};

