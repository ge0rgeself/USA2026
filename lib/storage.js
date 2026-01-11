/**
 * Storage abstraction for itinerary files
 * Uses GCS in production (USE_GCS=true), local filesystem otherwise
 */
const fs = require('fs');

// Lazy-load GCS to avoid errors when not needed
let bucket = null;

const BUCKET_NAME = 'nyc-trip-data-glexpenses';
const ITINERARY_FILE = 'itinerary.txt';

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
 * Write itinerary.json locally (cache only, not persisted to GCS)
 * @param {Object} json - Parsed and enriched itinerary
 */
function writeItineraryJson(json) {
  fs.writeFileSync('./itinerary.json', JSON.stringify(json, null, 2));
}

module.exports = {
  readItinerary,
  writeItinerary,
  writeItineraryJson,
  isGcsEnabled
};
