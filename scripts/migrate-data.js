/**
 * Migration script: Convert old itinerary format to new format
 *
 * Old format: item.place = { name, hook, address, ... }
 * New format: item.enrichment = { name, hook, tip, ... } or null
 *
 * Run once: node scripts/migrate-data.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '..', 'itinerary.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'itinerary.json');

function hasRealEnrichment(obj) {
  // Check if the enrichment has any real data (not just needsDetails: true)
  if (!obj) return false;
  if (obj.needsDetails === true) return false;
  // Has real data if any of these fields are populated
  return !!(obj.address || obj.mapsUrl || obj.website ||
            (obj.description && obj.description.length > 0) ||
            (obj.waypoints && obj.waypoints.length > 0));
}

function convertEnrichment(oldPlace) {
  if (!hasRealEnrichment(oldPlace)) {
    return null; // Will be enriched by background process
  }

  // Convert old format to new format
  return {
    name: oldPlace.name || null,
    hook: oldPlace.hook || null,
    tip: oldPlace.tips || oldPlace.tip || null,  // old field was 'tips'
    vibe: oldPlace.vibe || null,
    hours: oldPlace.hours || null,
    price: oldPlace.price || null,
    address: oldPlace.address || null,
    neighborhood: oldPlace.neighborhood || null,
    mapsUrl: oldPlace.mapsUrl || null,
    website: oldPlace.website || null,
    walkingMins: oldPlace.walkingMins || null,
    // Walking route fields
    isWalkingRoute: oldPlace.isWalkingRoute || false,
    waypoints: oldPlace.waypoints || [],
    distance: oldPlace.distance || null,
    duration: oldPlace.duration || null,
    routeUrl: oldPlace.routeUrl || null
  };
}

function migrate() {
  console.log('Reading old format from:', INPUT_PATH);

  const oldData = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));

  // Convert hotel
  let newHotel = null;
  if (oldData.hotel) {
    const hotelDesc = typeof oldData.hotel === 'string'
      ? oldData.hotel
      : oldData.hotel.name;
    const hotelEnrichment = typeof oldData.hotel === 'object'
      ? convertEnrichment(oldData.hotel)
      : null;

    newHotel = {
      description: hotelDesc,
      enrichment: hotelEnrichment
    };
  }

  // Convert reservations
  const newReservations = (oldData.reservations || []).map(res => {
    const desc = typeof res === 'string' ? res : res.name;
    const enrichment = typeof res === 'object' ? convertEnrichment(res) : null;
    return {
      description: desc,
      enrichment: enrichment
    };
  });

  // Convert days
  const newDays = (oldData.days || []).map(day => ({
    date: day.date,
    dayOfWeek: day.dayOfWeek,
    title: day.title,
    items: (day.items || []).map(item => ({
      time: item.time,
      description: item.description,
      type: item.type,
      fallback: item.fallback || false,
      optional: item.optional || false,
      enrichment: convertEnrichment(item.place)
    }))
  }));

  // Notes stay the same (already strings)
  const newNotes = oldData.notes || [];

  const newData = {
    hotel: newHotel,
    reservations: newReservations,
    days: newDays,
    notes: newNotes
  };

  // Count items needing enrichment
  let needsEnrichment = 0;
  if (newData.hotel && !newData.hotel.enrichment) needsEnrichment++;
  newData.reservations.forEach(r => { if (!r.enrichment) needsEnrichment++; });
  newData.days.forEach(d => d.items.forEach(i => { if (!i.enrichment) needsEnrichment++; }));

  console.log('Writing new format to:', OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(newData, null, 2));

  console.log('\n✅ Migration complete!');
  console.log(`   Hotel: ${newData.hotel ? '1' : '0'}`);
  console.log(`   Reservations: ${newData.reservations.length}`);
  console.log(`   Days: ${newData.days.length}`);
  console.log(`   Total items: ${newData.days.reduce((sum, d) => sum + d.items.length, 0)}`);
  console.log(`   Items needing enrichment: ${needsEnrichment}`);
  console.log('\n   The server will background-enrich items with null enrichment on startup.');
}

migrate();
