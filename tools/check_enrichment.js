const data = require('./itinerary.json');
const nulls = [];

data.days.forEach((d, i) => {
  d.items.forEach((item, j) => {
    if (!item.enrichment || Object.keys(item.enrichment).length === 0) {
      nulls.push({day: i, item: j, desc: item.description});
    }
  });
});

if (data.hotel && !data.hotel.enrichment) {
  nulls.push({day: 'hotel', desc: data.hotel.description});
}

data.reservations.forEach((res, i) => {
  if (!res.enrichment) {
    nulls.push({res: i, desc: res.description});
  }
});

console.log('Items with missing enrichment:', nulls.length);
nulls.forEach(n => {
  if (n.day !== undefined) {
    if (n.day === 'hotel') {
      console.log(`  Hotel: ${n.desc}`);
    } else {
      console.log(`  Day ${n.day}, Item ${n.item}: ${n.desc}`);
    }
  } else if (n.res !== undefined) {
    console.log(`  Reservation ${n.res}: ${n.desc}`);
  }
});

if (nulls.length === 0) {
  console.log('All items have enrichment!');
}
