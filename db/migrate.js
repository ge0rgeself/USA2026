#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const migrationsDir = path.join(__dirname, 'migrations');

/**
 * Create migrations table if it doesn't exist
 */
async function createMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(client) {
  const result = await client.query(
    'SELECT name FROM migrations ORDER BY applied_at'
  );
  return result.rows.map((row) => row.name);
}

/**
 * Read all migration files from the migrations directory
 */
function getMigrationFiles() {
  const files = fs.readdirSync(migrationsDir);
  return files
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/**
 * Read migration file content
 */
function readMigrationFile(filename) {
  const filepath = path.join(migrationsDir, filename);
  return fs.readFileSync(filepath, 'utf-8');
}

/**
 * Run a single migration
 */
async function runMigration(client, filename) {
  const content = readMigrationFile(filename);

  await client.query('BEGIN');
  try {
    await client.query(content);
    await client.query(
      'INSERT INTO migrations (name) VALUES ($1)',
      [filename]
    );
    await client.query('COMMIT');
    console.log(`✓ Applied migration: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Main migration runner
 */
async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Starting database migrations...\n');

    // Ensure migrations table exists
    await createMigrationsTable(client);

    // Get applied and available migrations
    const appliedMigrations = await getAppliedMigrations(client);
    const availableMigrations = getMigrationFiles();

    const pendingMigrations = availableMigrations.filter(
      (migration) => !appliedMigrations.includes(migration)
    );

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations. Database is up to date.');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s):\n`);

    // Run each pending migration
    for (const migration of pendingMigrations) {
      await runMigration(client, migration);
    }

    console.log('\nAll migrations applied successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    await pool.end();
  }
}

// Run migrations
migrate();
