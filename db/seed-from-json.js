const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Parse time strings into HH:MM format
function parseTime(timeStr) {
  if (!timeStr) return { start: null, end: null };

  const timeStr_lower = timeStr.toLowerCase();

  // Handle range times: "1:30-4pm", "4-6pm", "11am-3pm"
  const rangeMatch = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*-\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (rangeMatch) {
    const [, startHr, startMin, endHr, endMin, period] = rangeMatch;
    const start = formatTime(parseInt(startHr), parseInt(startMin || 0), period);
    const end = formatTime(parseInt(endHr), parseInt(endMin || 0), period);
    return { start, end };
  }

  // Handle simple times: "7:30pm", "11am"
  const simpleMatch = timeStr.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)$/);
  if (simpleMatch) {
    const [, hr, min, period] = simpleMatch;
    const start = formatTime(parseInt(hr), parseInt(min || 0), period);
    return { start, end: null };
  }

  // Handle keyword times
  if (timeStr_lower === 'morning') return { start: '09:00', end: null };
  if (timeStr_lower === 'afternoon') return { start: '14:00', end: null };
  if (timeStr_lower === 'evening') return { start: '18:00', end: null };
  if (timeStr_lower === 'dinner') return { start: '19:00', end: null };
  if (timeStr_lower === 'late') return { start: '22:00', end: null };

  return { start: null, end: null };
}

// Convert hour and minute to 24-hour HH:MM format
function formatTime(hour, minute, period) {
  if (period && period.toLowerCase() === 'pm' && hour !== 12) {
    hour = hour + 12;
  }
  if (period && period.toLowerCase() === 'am' && hour === 12) {
    hour = 0;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Parse date string "Jan 14" -> "2026-01-14"
function parseDate(dateStr, year = 2026) {
  const monthMap = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12,
  };

  const parts = dateStr.toLowerCase().trim().split(/\s+/);
  const monthStr = parts[0];
  const dayStr = parts[1];

  const month = monthMap[monthStr];
  const day = parseInt(dayStr);

  if (!month || !day) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Parse preferences.md into a structured object
function parsePreferences() {
  const prefsFile = path.join(__dirname, '..', 'preferences.md');
  const content = fs.readFileSync(prefsFile, 'utf-8');

  const prefs = {
    george: {},
    valmikh: {},
  };

  let currentUser = null;
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('## George')) {
      currentUser = 'george';
    } else if (line.startsWith('## Valmikh')) {
      currentUser = 'valmikh';
    } else if (line.startsWith('## Shared Preferences')) {
      currentUser = 'shared';
    } else if (line.startsWith('## ') || line.startsWith('# ')) {
      currentUser = null;
    } else if (currentUser && line.startsWith('- ')) {
      const pref = line.replace(/^- /, '').trim();
      if (currentUser === 'shared') {
        if (!prefs.george.shared) prefs.george.shared = [];
        if (!prefs.valmikh.shared) prefs.valmikh.shared = [];
        prefs.george.shared.push(pref);
        prefs.valmikh.shared.push(pref);
      } else {
        if (!prefs[currentUser].preferences) prefs[currentUser].preferences = [];
        prefs[currentUser].preferences.push(pref);
      }
    }
  }

  // Convert to JSONB format
  return {
    george: {
      name: 'George',
      email: 'self.gt@gmail.com',
      preferences: prefs.george.preferences || [],
      shared: prefs.george.shared || [],
    },
    valmikh: {
      name: 'Valmikh',
      email: 'valmikh17@gmail.com',
      preferences: prefs.valmikh.preferences || [],
      shared: prefs.valmikh.shared || [],
    },
  };
}

async function migrateData() {
  try {
    console.log('Starting data migration from itinerary.json to PostgreSQL...\n');

    // Read itinerary.json
    const itineraryPath = path.join(__dirname, '..', 'itinerary.json');
    const itineraryData = JSON.parse(fs.readFileSync(itineraryPath, 'utf-8'));

    // Parse preferences
    const preferences = parsePreferences();
    console.log('Parsed preferences for George and Valmikh');

    // 1. Create users
    console.log('\nCreating users...');
    const userIds = {};
    for (const userKey of ['george', 'valmikh']) {
      const userData = preferences[userKey];
      const result = await pool.query(
        `INSERT INTO users (email, name, preferences)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
         SET name = $2, preferences = $3
         RETURNING id`,
        [userData.email, userData.name, JSON.stringify(userData)]
      );
      userIds[userKey] = result.rows[0].id;
      console.log(`  - Created user "${userData.name}" (${userData.email}) with ID ${result.rows[0].id}`);
    }

    // 2. Create trip
    console.log('\nCreating trip...');
    const tripResult = await pool.query(
      `INSERT INTO trips (name, start_date, end_date, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['NYC January 2026', '2026-01-14', '2026-01-18', userIds.george]
    );
    const tripId = tripResult.rows[0].id;
    console.log(`  - Created trip "NYC January 2026" (${tripResult.rows[0].id})`);

    // 3. Create accommodation
    if (itineraryData.hotel && itineraryData.hotel.enrichment) {
      console.log('\nCreating accommodation...');
      const hotel = itineraryData.hotel.enrichment;
      const accomResult = await pool.query(
        `INSERT INTO accommodations (user_id, name, address, neighborhood, check_in, check_out, enrichment)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          userIds.george,
          hotel.name || 'Untitled at 3 Freeman Alley',
          hotel.address,
          hotel.neighborhood,
          '2026-01-14',
          '2026-01-18',
          JSON.stringify(hotel),
        ]
      );
      console.log(`  - Created accommodation "${hotel.name}"`);
    }

    // 4. Create days and items
    console.log('\nCreating days and items...');
    let itemCount = 0;

    for (const dayData of itineraryData.days) {
      const dateStr = parseDate(dayData.date);

      const dayResult = await pool.query(
        `INSERT INTO days (user_id, date, title)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userIds.george, dateStr, dayData.title]
      );
      const dayId = dayResult.rows[0].id;
      console.log(`  - Created day "${dateStr}" (${dayData.title})`);

      // Create items for this day
      let sortOrder = 0;
      for (const itemData of dayData.items) {
        const { start: timeStart, end: timeEnd } = parseTime(itemData.time);
        const itemType = itemData.type || 'activity';
        // Map old boolean flags to status
        let status = 'primary';
        if (itemData.status) {
          status = itemData.status;
        } else if (itemData.fallback) {
          status = 'backup';
        } else if (itemData.optional) {
          status = 'optional';
        }

        const itemResult = await pool.query(
          `INSERT INTO items (
            day_id,
            prompt,
            description,
            type,
            time_start,
            time_end,
            status,
            sort_order,
            enrichment
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            dayId,
            itemData.prompt || itemData.description,
            itemData.description,
            itemType,
            timeStart,
            timeEnd,
            status,
            sortOrder++,
            itemData.enrichment ? JSON.stringify(itemData.enrichment) : null,
          ]
        );
        itemCount++;
      }
    }

    console.log(`  - Created ${itemCount} items across all days`);

    // 5. Reservations - skipped (YAGNI - we decided not to track reservations separately)

    console.log('\n✅ Migration completed successfully!');
    console.log(`\nSummary:`);
    console.log(`  - Users: 2 (George, Valmikh)`);
    console.log(`  - Trip: 1 (NYC January 2026)`);
    console.log(`  - Accommodation: 1`);
    console.log(`  - Days: ${itineraryData.days.length}`);
    console.log(`  - Items: ${itemCount + (itineraryData.reservations?.length || 0)}`);

    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

migrateData();
