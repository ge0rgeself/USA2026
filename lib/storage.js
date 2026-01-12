/**
 * Storage abstraction for itinerary files
 * Uses GCS in production (USE_GCS=true), local filesystem otherwise
 */
const fs = require('fs');

// Lazy-load GCS to avoid errors when not needed
let bucket = null;

const BUCKET_NAME = 'nyc-trip-data-glexpenses';
const ITINERARY_FILE = 'itinerary.txt';
const ITINERARY_JSON_FILE = 'itinerary.json';

function isGcsEnabled() {
  return process.env.USE_GCS === 'true';
}

function getGcsBucket() {
  if (!bucket) {
    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage();
    bucket = storage.bucket(BUCKET_NAME);
  }
  return bucket;
}

/**
 * Read itinerary.txt from storage
 * @returns {Promise<string>} File contents
 */
async function readItinerary() {
  if (isGcsEnabled()) {
    try {
      const [contents] = await getGcsBucket().file(ITINERARY_FILE).download();
      console.log('Loaded itinerary from GCS');
      return contents.toString('utf-8');
    } catch (err) {
      console.error('GCS read failed, falling back to local:', err.message);
    }
  }

  // Local filesystem (default or fallback)
  return fs.readFileSync('./itinerary.txt', 'utf-8');
}

/**
 * Write itinerary.txt to storage
 * @param {string} content - File contents
 */
async function writeItinerary(content) {
  // Always write locally first (fast, reliable)
  fs.writeFileSync('./itinerary.txt', content, 'utf-8');

  if (isGcsEnabled()) {
    try {
      await getGcsBucket().file(ITINERARY_FILE).save(content, {
        contentType: 'text/plain',
        metadata: { cacheControl: 'no-cache' }
      });
      console.log('Saved itinerary to GCS');
    } catch (err) {
      console.error('GCS write failed (data preserved locally):', err.message);
    }
  }
}

/**
 * Read itinerary.json from GCS
 */
async function readItineraryJson() {
  if (isGcsEnabled()) {
    try {
      const [contents] = await getGcsBucket().file(ITINERARY_JSON_FILE).download();
      console.log('Loaded itinerary.json from GCS');
      return JSON.parse(contents.toString('utf-8'));
    } catch (err) {
      console.error('GCS JSON read failed:', err.message);
    }
  }

  // Local fallback
  try {
    const local = fs.readFileSync('./itinerary.json', 'utf-8');
    return JSON.parse(local);
  } catch (err) {
    return null;
  }
}

/**
 * Write itinerary.json to GCS (and local)
 */
async function writeItineraryJson(json) {
  const content = JSON.stringify(json, null, 2);

  // Always write locally
  fs.writeFileSync('./itinerary.json', content, 'utf-8');

  if (isGcsEnabled()) {
    try {
      await getGcsBucket().file(ITINERARY_JSON_FILE).save(content, {
        contentType: 'application/json',
        metadata: { cacheControl: 'no-cache' }
      });
      console.log('Saved itinerary.json to GCS');
    } catch (err) {
      console.error('GCS JSON write failed:', err.message);
    }
  }
}

module.exports = {
  readItinerary,
  writeItinerary,
  readItineraryJson,
  writeItineraryJson,
  isGcsEnabled
};
