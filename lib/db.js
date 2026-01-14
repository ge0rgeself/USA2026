/**
 * Database client layer for PostgreSQL
 * Provides connection pooling and query abstractions for all data operations
 *
 * Configuration: Uses DATABASE_URL environment variable
 * Connection pooling: pg.Pool with sensible defaults
 */

const { Pool, types } = require('pg');

// Configure pg to return DATE values as strings (YYYY-MM-DD) instead of JavaScript Date objects
// This avoids timezone conversion issues where dates could shift by one day
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (val) => val);  // Return as-is, no Date conversion

// Initialize pool from DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool defaults
  max: 20,                           // Max connections in pool
  idleTimeoutMillis: 30000,          // Close idle connections after 30s
  connectionTimeoutMillis: 2000,     // Timeout on connect attempt
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Helper: Convert snake_case object to camelCase
 */
function toCamelCase(obj) {
  if (!obj) return null;
  const camelObj = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelObj[camelKey] = value;
  }
  return camelObj;
}

/**
 * Helper: Convert camelCase object to snake_case for DB insert/update
 */
function toSnakeCase(obj) {
  if (!obj) return {};
  const snakeObj = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    snakeObj[snakeKey] = value;
  }
  return snakeObj;
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function getUserByEmail(email) {
  const res = await pool.query(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

/**
 * Get user by ID
 * @param {string} userId - UUID
 * @returns {Promise<Object|null>}
 */
async function getUserById(userId) {
  const res = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

/**
 * Create user
 * @param {string} email
 * @param {string} name
 * @param {Object} preferences - Optional preferences object
 * @returns {Promise<Object>}
 */
async function createUser(email, name, preferences = {}) {
  const res = await pool.query(
    'INSERT INTO users (email, name, preferences) VALUES ($1, $2, $3) RETURNING *',
    [email.toLowerCase(), name, JSON.stringify(preferences)]
  );
  return toCamelCase(res.rows[0]);
}

/**
 * Update user preferences
 * @param {string} userId
 * @param {Object} preferences
 * @returns {Promise<Object|null>}
 */
async function updateUserPreferences(userId, preferences) {
  const res = await pool.query(
    'UPDATE users SET preferences = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(preferences), userId]
  );
  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

// ============================================================================
// DAY OPERATIONS
// ============================================================================

/**
 * Get days with their items by date range
 * @param {string} userId
 * @param {string} fromDate - ISO date string (YYYY-MM-DD)
 * @param {string} toDate - ISO date string (YYYY-MM-DD)
 * @returns {Promise<Array>} Days with nested items array
 */
async function getDaysByDateRange(userId, fromDate, toDate) {
  const res = await pool.query(`
    SELECT
      d.id, d.user_id, d.date, d.title, d.notes, d.created_at, d.updated_at,
      COALESCE(json_agg(
        json_build_object(
          'id', i.id,
          'dayId', i.day_id,
          'prompt', i.prompt,
          'description', i.description,
          'timeStart', i.time_start,
          'timeEnd', i.time_end,
          'type', i.type,
          'status', i.status,
          'sortOrder', i.sort_order,
          'enrichment', i.enrichment,
          'createdAt', i.created_at,
          'updatedAt', i.updated_at
        ) ORDER BY i.sort_order, i.created_at
      ) FILTER (WHERE i.id IS NOT NULL), '[]'::json) as items
    FROM days d
    LEFT JOIN items i ON d.id = i.day_id
    WHERE d.user_id = $1 AND d.date >= $2 AND d.date <= $3
    GROUP BY d.id, d.date
    ORDER BY d.date ASC
  `, [userId, fromDate, toDate]);

  return res.rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    date: row.date,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: row.items
  }));
}

/**
 * Get single day with items
 * @param {string} userId
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @returns {Promise<Object|null>}
 */
async function getDayByDate(userId, date) {
  const res = await pool.query(`
    SELECT
      d.id, d.user_id, d.date, d.title, d.notes, d.created_at, d.updated_at,
      COALESCE(json_agg(
        json_build_object(
          'id', i.id,
          'dayId', i.day_id,
          'prompt', i.prompt,
          'description', i.description,
          'timeStart', i.time_start,
          'timeEnd', i.time_end,
          'type', i.type,
          'status', i.status,
          'sortOrder', i.sort_order,
          'enrichment', i.enrichment,
          'createdAt', i.created_at,
          'updatedAt', i.updated_at
        ) ORDER BY i.sort_order, i.created_at
      ) FILTER (WHERE i.id IS NOT NULL), '[]'::json) as items
    FROM days d
    LEFT JOIN items i ON d.id = i.day_id
    WHERE d.user_id = $1 AND d.date = $2
    GROUP BY d.id
  `, [userId, date]);

  if (res.rows.length === 0) return null;

  const row = res.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: row.items
  };
}

/**
 * Create day
 * @param {string} userId
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @param {string} title - Optional title
 * @param {string} notes - Optional notes
 * @returns {Promise<Object>}
 */
async function createDay(userId, date, title = null, notes = null) {
  const res = await pool.query(
    'INSERT INTO days (user_id, date, title, notes) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, date, title, notes]
  );
  return toCamelCase(res.rows[0]);
}

/**
 * Update day (title, notes)
 * @param {string} dayId
 * @param {Object} updates - { title?, notes? }
 * @returns {Promise<Object|null>}
 */
async function updateDay(dayId, updates = {}) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  if ('title' in updates) {
    fields.push(`title = $${paramIndex}`);
    values.push(updates.title);
    paramIndex++;
  }
  if ('notes' in updates) {
    fields.push(`notes = $${paramIndex}`);
    values.push(updates.notes);
    paramIndex++;
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(dayId);

  const res = await pool.query(
    `UPDATE days SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

// ============================================================================
// ITEM OPERATIONS
// ============================================================================

/**
 * Get items by day
 * @param {string} dayId
 * @returns {Promise<Array>}
 */
async function getItemsByDay(dayId) {
  const res = await pool.query(
    `SELECT * FROM items WHERE day_id = $1 ORDER BY sort_order, created_at`,
    [dayId]
  );
  return res.rows.map(row => toCamelCase(row));
}

/**
 * Get items needing enrichment (where enrichment IS NULL)
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getItemsNeedingEnrichment(userId) {
  const res = await pool.query(`
    SELECT i.* FROM items i
    JOIN days d ON i.day_id = d.id
    WHERE d.user_id = $1 AND i.enrichment IS NULL
    ORDER BY d.date, i.sort_order
  `, [userId]);

  return res.rows.map(row => toCamelCase(row));
}

/**
 * Create item
 * @param {string} dayId
 * @param {Object} itemData - { prompt, description, timeStart?, timeEnd?, type, status, sortOrder }
 * @returns {Promise<Object>}
 */
async function createItem(dayId, itemData = {}) {
  const {
    prompt,
    description,
    timeStart = null,
    timeEnd = null,
    type = 'activity',
    status = 'primary',
    sortOrder = 0
  } = itemData;

  const res = await pool.query(
    `INSERT INTO items (day_id, prompt, description, time_start, time_end, type, status, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [dayId, prompt, description, timeStart, timeEnd, type, status, sortOrder]
  );

  return toCamelCase(res.rows[0]);
}

/**
 * Update item (partial update)
 * @param {string} itemId
 * @param {Object} updates - Any item fields to update
 * @returns {Promise<Object|null>}
 */
async function updateItem(itemId, updates = {}) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  const updateMap = {
    prompt: 'prompt',
    description: 'description',
    timeStart: 'time_start',
    timeEnd: 'time_end',
    type: 'type',
    status: 'status',
    sortOrder: 'sort_order'
  };

  for (const [camelKey, dbKey] of Object.entries(updateMap)) {
    if (camelKey in updates) {
      fields.push(`${dbKey} = $${paramIndex}`);
      values.push(updates[camelKey]);
      paramIndex++;
    }
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(itemId);

  const res = await pool.query(
    `UPDATE items SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

/**
 * Delete item
 * @param {string} itemId
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteItem(itemId) {
  const res = await pool.query(
    'DELETE FROM items WHERE id = $1',
    [itemId]
  );
  return res.rowCount > 0;
}

/**
 * Update item enrichment (set enrichment JSONB field)
 * @param {string} itemId
 * @param {Object} enrichment - Enrichment data object
 * @returns {Promise<Object|null>}
 */
async function updateItemEnrichment(itemId, enrichment) {
  const res = await pool.query(
    `UPDATE items SET enrichment = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [JSON.stringify(enrichment), itemId]
  );

  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

// ============================================================================
// ACCOMMODATION OPERATIONS
// ============================================================================

/**
 * Get accommodation for a given date
 * @param {string} userId
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @returns {Promise<Object|null>}
 */
async function getAccommodationForDate(userId, date) {
  const res = await pool.query(
    `SELECT * FROM accommodations
     WHERE user_id = $1 AND check_in <= $2 AND check_out > $2
     LIMIT 1`,
    [userId, date]
  );

  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

/**
 * Get all accommodations for user
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getAccommodationsByUser(userId) {
  const res = await pool.query(
    `SELECT * FROM accommodations WHERE user_id = $1 ORDER BY check_in`,
    [userId]
  );

  return res.rows.map(row => toCamelCase(row));
}

/**
 * Create accommodation
 * @param {string} userId
 * @param {Object} accommodationData - { name, address?, neighborhood?, checkIn, checkOut }
 * @returns {Promise<Object>}
 */
async function createAccommodation(userId, accommodationData = {}) {
  const {
    name,
    address = null,
    neighborhood = null,
    checkIn,
    checkOut
  } = accommodationData;

  const res = await pool.query(
    `INSERT INTO accommodations (user_id, name, address, neighborhood, check_in, check_out)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, name, address, neighborhood, checkIn, checkOut]
  );

  return toCamelCase(res.rows[0]);
}

/**
 * Update accommodation
 * @param {string} accommodationId
 * @param {Object} updates - Partial accommodation data
 * @returns {Promise<Object|null>}
 */
async function updateAccommodation(accommodationId, updates = {}) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  const updateMap = {
    name: 'name',
    address: 'address',
    neighborhood: 'neighborhood',
    checkIn: 'check_in',
    checkOut: 'check_out'
  };

  for (const [camelKey, dbKey] of Object.entries(updateMap)) {
    if (camelKey in updates) {
      fields.push(`${dbKey} = $${paramIndex}`);
      values.push(updates[camelKey]);
      paramIndex++;
    }
  }

  if (fields.length === 0) return null;

  values.push(accommodationId);

  const res = await pool.query(
    `UPDATE accommodations SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

// ============================================================================
// TRIP OPERATIONS
// ============================================================================

/**
 * Get all trips for user
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getTrips(userId) {
  const res = await pool.query(
    `SELECT * FROM trips WHERE user_id = $1 ORDER BY start_date`,
    [userId]
  );

  return res.rows.map(row => toCamelCase(row));
}

/**
 * Get trip by ID
 * @param {string} tripId
 * @returns {Promise<Object|null>}
 */
async function getTripById(tripId) {
  const res = await pool.query(
    `SELECT * FROM trips WHERE id = $1`,
    [tripId]
  );

  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

/**
 * Create trip
 * @param {string} userId
 * @param {Object} tripData - { name, startDate, endDate }
 * @returns {Promise<Object>}
 */
async function createTrip(userId, tripData = {}) {
  const { name, startDate, endDate } = tripData;

  const res = await pool.query(
    `INSERT INTO trips (user_id, name, start_date, end_date)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, name, startDate, endDate]
  );

  return toCamelCase(res.rows[0]);
}

/**
 * Update trip
 * @param {string} tripId
 * @param {Object} updates - { name?, startDate?, endDate? }
 * @returns {Promise<Object|null>}
 */
async function updateTrip(tripId, updates = {}) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  const updateMap = {
    name: 'name',
    startDate: 'start_date',
    endDate: 'end_date'
  };

  for (const [camelKey, dbKey] of Object.entries(updateMap)) {
    if (camelKey in updates) {
      fields.push(`${dbKey} = $${paramIndex}`);
      values.push(updates[camelKey]);
      paramIndex++;
    }
  }

  if (fields.length === 0) return null;

  values.push(tripId);

  const res = await pool.query(
    `UPDATE trips SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

/**
 * Delete trip
 * @param {string} tripId
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteTrip(tripId) {
  const res = await pool.query(
    'DELETE FROM trips WHERE id = $1',
    [tripId]
  );
  return res.rowCount > 0;
}

// ============================================================================
// EXPENSE OPERATIONS
// ============================================================================

/**
 * Get all expenses for a user
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getExpensesByUser(userId) {
  const res = await pool.query(
    `SELECT * FROM expenses WHERE user_id = $1 ORDER BY date DESC, created_at DESC`,
    [userId]
  );
  return res.rows.map(row => toCamelCase(row));
}

/**
 * Get expense by ID
 * @param {string} expenseId
 * @returns {Promise<Object|null>}
 */
async function getExpenseById(expenseId) {
  const res = await pool.query(
    `SELECT * FROM expenses WHERE id = $1`,
    [expenseId]
  );
  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

/**
 * Create expense
 * @param {string} userId
 * @param {Object} expenseData - { description, amount, payer, category?, date? }
 * @returns {Promise<Object>}
 */
async function createExpense(userId, expenseData = {}) {
  const {
    description,
    amount,
    payer,
    category = 'other',
    date = new Date().toISOString().split('T')[0]
  } = expenseData;

  const res = await pool.query(
    `INSERT INTO expenses (user_id, description, amount, payer, category, date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, description, amount, payer, category, date]
  );

  return toCamelCase(res.rows[0]);
}

/**
 * Update expense
 * @param {string} expenseId
 * @param {Object} updates - { description?, amount?, payer?, category?, date? }
 * @returns {Promise<Object|null>}
 */
async function updateExpense(expenseId, updates = {}) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  const updateMap = {
    description: 'description',
    amount: 'amount',
    payer: 'payer',
    category: 'category',
    date: 'date'
  };

  for (const [camelKey, dbKey] of Object.entries(updateMap)) {
    if (camelKey in updates) {
      fields.push(`${dbKey} = $${paramIndex}`);
      values.push(updates[camelKey]);
      paramIndex++;
    }
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(expenseId);

  const res = await pool.query(
    `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return res.rows.length > 0 ? toCamelCase(res.rows[0]) : null;
}

/**
 * Delete expense
 * @param {string} expenseId
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteExpense(expenseId) {
  const res = await pool.query(
    'DELETE FROM expenses WHERE id = $1',
    [expenseId]
  );
  return res.rowCount > 0;
}

/**
 * Get expense totals for a user
 * @param {string} userId
 * @returns {Promise<Object>} { total, byPayer: { george, val } }
 */
async function getExpenseTotals(userId) {
  const res = await pool.query(
    `SELECT
       COALESCE(SUM(amount), 0) as total,
       COALESCE(SUM(CASE WHEN payer = 'george' THEN amount ELSE 0 END), 0) as george_paid,
       COALESCE(SUM(CASE WHEN payer = 'val' THEN amount ELSE 0 END), 0) as val_paid
     FROM expenses WHERE user_id = $1`,
    [userId]
  );

  const row = res.rows[0];
  return {
    total: parseFloat(row.total),
    georgePaid: parseFloat(row.george_paid),
    valPaid: parseFloat(row.val_paid)
  };
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Gracefully close the connection pool
 * Call this on server shutdown
 */
async function end() {
  await pool.end();
}

/**
 * Export all database functions
 */
module.exports = {
  // User operations
  getUserByEmail,
  getUserById,
  createUser,
  updateUserPreferences,

  // Day operations
  getDaysByDateRange,
  getDayByDate,
  createDay,
  updateDay,

  // Item operations
  getItemsByDay,
  getItemsNeedingEnrichment,
  createItem,
  updateItem,
  deleteItem,
  updateItemEnrichment,

  // Accommodation operations
  getAccommodationForDate,
  getAccommodationsByUser,
  createAccommodation,
  updateAccommodation,

  // Trip operations
  getTrips,
  getTripById,
  createTrip,
  updateTrip,
  deleteTrip,

  // Expense operations
  getExpensesByUser,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseTotals,

  // Connection management
  end,
  pool
};
