# PostgreSQL Data Model Design

**Status: IMPLEMENTED** (January 13, 2025)

## Overview

Migrate from file-based storage (itinerary.txt + itinerary.json + GCS) to PostgreSQL on Cloud SQL. This establishes a proper relational data model with days as the core unit, enabling future extensibility as a life planner beyond just trip planning.

## Goals

1. **Multi-trip support** - Model supports multiple trips as lightweight date-range groupings
2. **Better reliability** - Managed Postgres with automated backups, no file sync issues
3. **Richer features** - SQL queryability, version tracking, proper relational integrity
4. **Developer-friendly** - Query prod via Cloud SQL Studio, manage from backend

## Schema

### USER
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| email | text | UNIQUE, NOT NULL |
| name | text | |
| preferences | jsonb | default '{}' |
| created_at | timestamptz | default now() |

### DAY
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → USER, NOT NULL |
| date | date | NOT NULL |
| title | text | |
| notes | text | |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Unique constraint:** (user_id, date)

### ITEM
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| day_id | uuid | FK → DAY, NOT NULL, ON DELETE CASCADE |
| prompt | text | NOT NULL |
| description | text | NOT NULL |
| time_start | time | |
| time_end | time | |
| type | text | default 'activity' |
| status | text | default 'primary' |
| sort_order | int | default 0 |
| enrichment | jsonb | |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Type values:** food, activity, transit, culture, entertainment
**Status values:** primary, optional, backup

### ACCOMMODATION
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → USER, NOT NULL |
| name | text | NOT NULL |
| address | text | |
| neighborhood | text | |
| check_in | date | NOT NULL |
| check_out | date | NOT NULL |
| enrichment | jsonb | |
| created_at | timestamptz | default now() |

### TRIP
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | FK → USER, NOT NULL |
| name | text | NOT NULL |
| start_date | date | NOT NULL |
| end_date | date | NOT NULL |
| created_at | timestamptz | default now() |

**Note:** Trip is a lightweight grouping. Days are queried by date range, no FK relationship.

## Common Queries

```sql
-- What's on my calendar for a specific day?
SELECT i.* FROM item i
JOIN day d ON i.day_id = d.id
WHERE d.user_id = $1 AND d.date = $2
ORDER BY i.time_start NULLS LAST, i.sort_order;

-- Where am I staying on a given date?
SELECT * FROM accommodation
WHERE user_id = $1 AND check_in <= $2 AND check_out > $2;

-- Get all days for a trip
SELECT d.*, json_agg(i.*) as items
FROM day d
LEFT JOIN item i ON i.day_id = d.id
WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3
GROUP BY d.id
ORDER BY d.date;

-- Items needing enrichment
SELECT i.* FROM item i
JOIN day d ON i.day_id = d.id
WHERE d.user_id = $1 AND i.enrichment IS NULL;
```

## Migration Plan

### Phase 1: Infrastructure
1. Create Cloud SQL Postgres instance (db-f1-micro, ~$7/month)
2. Configure private IP for Cloud Run connection
3. Add connection secrets to Secret Manager

### Phase 2: Schema
1. Create `db/migrations/` directory with numbered SQL files
2. Run migrations on startup or via CLI tool
3. Seed users from current whitelist

### Phase 3: Data Migration
1. Write one-time script to parse current itinerary.json
2. Create user records for George and Valmikh
3. Create days and items from existing data
4. Create accommodation record from hotel data
5. Create trip record for "NYC January 2025"

### Phase 4: Server Updates
1. Add `pg` client with connection pooling
2. Create `db/queries.js` with parameterized queries
3. Update API endpoints to use Postgres
4. Update Oscar tools to query DB
5. Remove GCS storage code (or keep as backup export)

### Phase 5: Cleanup
1. Remove file-based storage logic
2. Update enrichment pipeline to save to DB
3. Add `itinerary.txt` export endpoint (nice-to-have)

## API Changes

### Current → New

| Current | New |
|---------|-----|
| GET /api/itinerary | GET /api/days?from=&to= |
| PUT /api/itinerary | N/A (individual mutations) |
| PATCH /api/itinerary/item | PATCH /api/items/:id |
| POST /api/itinerary/item | POST /api/days/:dayId/items |
| DELETE /api/itinerary/item | DELETE /api/items/:id |

### New Endpoints

- `GET /api/days?from=2025-01-14&to=2025-01-18` - Fetch days with items
- `GET /api/days/:id` - Single day with items
- `POST /api/days` - Create a day
- `PATCH /api/days/:id` - Update day title/notes
- `GET /api/accommodations?date=2025-01-15` - Where am I staying?
- `GET /api/trips` - List trips
- `POST /api/trips` - Create trip grouping

## Enrichment Field Reference

The `enrichment` jsonb column stores:

```json
{
  "name": "Display name",
  "hook": "5-8 word tagline",
  "tip": "Insider advice",
  "vibe": "Atmosphere description",
  "hours": "Operating hours",
  "price": "Price level",
  "address": "Full street address",
  "neighborhood": "Area abbreviation",
  "mapsUrl": "Google Maps link",
  "website": "Official website",
  "walkingMins": "Minutes from accommodation"
}
```

## Infrastructure

- **Database:** Cloud SQL PostgreSQL 15, db-f1-micro
- **Region:** us-central1 (same as Cloud Run)
- **Connection:** Private IP via VPC connector
- **Backups:** Automated daily, 7-day retention
- **Secrets:** `database-url` in Secret Manager

## Out of Scope

- Version history / audit log (can add later with trigger)
- Real-time collaboration (single-user updates sufficient)
- Offline support (always connected)
- Reservation management (YAGNI)
