// backend/db.js
// Manages a single shared MongoDB client connection for the entire application.
// This avoids opening multiple unnecessary connections and allows transaction session reuse.
// The connection string is loaded securely from environment variables, never hardcoded.

const { MongoClient } = require("mongodb");

let client = null;
let db = null;

/**
 * Initializes the MongoDB client and connects to the waterTracker database.
 * @returns {Promise<Db>} The connected database instance.
 */
async function connectDB() {
  if (db) return db;

  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.DB_NAME || "waterTracker";

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log(`[Database] Connected successfully to MongoDB (${dbName}) at ${uri}`);
    return db;
  } catch (err) {
    console.error("[Database] Connection failed:", err.message);
    process.exit(1);
  }
}

/**
 * Returns the active database instance.
 * Throws an error if connectDB() has not been called yet.
 */
function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return db;
}

/**
 * Returns the MongoClient instance, needed for multi-document transaction sessions.
 */
function getClient() {
  if (!client) {
    throw new Error("MongoClient not initialized. Call connectDB() first.");
  }
  return client;
}

/**
 * Closes the database connection on graceful shutdown.
 */
async function closeDB() {
  if (client) {
    await client.close();
    console.log("[Database] Connection closed.");
  }
}

module.exports = {
  connectDB,
  getDB,
  getClient,
  closeDB
};
