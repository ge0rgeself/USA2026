/**
 * Parses simple itinerary.txt format into structured data
 */

function parseItinerary(text) {
  const lines = text.split('\n');
  const result = {
    hotel: null,
    reservations: [],
    days: [],
    notes: []
  };

  let currentSection = null;
  let currentDay = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Section headers
    if (trimmed.startsWith('# Hotel')) {
      currentSection = 'hotel';
      currentDay = null;
      continue;
    }
    if (trimmed.startsWith('# Reservations')) {
      currentSection = 'reservations';
      currentDay = null;
      continue;
    }
    if (trimmed.startsWith('# Notes')) {
      currentSection = 'notes';
      currentDay = null;
      continue;
    }

    // Day headers: # Jan 14 (Tue) - Title
    const dayMatch = trimmed.match(/^# (Jan \d+) \((\w+)\)(?: - (.+))?$/);
    if (dayMatch) {
      currentSection = 'day';
      currentDay = {
        date: dayMatch[1],
        dayOfWeek: dayMatch[2],
        title: dayMatch[3] || '',
        items: []
      };
      result.days.push(currentDay);
      continue;
    }

    // Hotel content (non-list line after # Hotel)
    if (currentSection === 'hotel' && !trimmed.startsWith('-')) {
      result.hotel = trimmed;
      continue;
    }

    // List items
    if (trimmed.startsWith('- ')) {
      const content = trimmed.slice(2);

      if (currentSection === 'reservations') {
        result.reservations.push(content);
      } else if (currentSection === 'notes') {
        result.notes.push(content);
      } else if (currentSection === 'day' && currentDay) {
        const item = parseItem(content);
        currentDay.items.push(item);
      }
    }
  }

  return result;
}

function parseItem(content) {
  // Check for fallback/optional prefix
  let fallback = false;
  let optional = false;

  if (content.startsWith('fallback: ')) {
    fallback = true;
    content = content.slice(10);
  } else if (content.startsWith('optional ')) {
    optional = true;
    content = content.slice(9);
  } else if (content.startsWith('optional: ')) {
    optional = true;
    content = content.slice(10);
  }

  // Parse time: description
  const colonIndex = content.indexOf(': ');
  let time = null;
  let description = content;

  if (colonIndex > 0) {
    const beforeColon = content.slice(0, colonIndex).toLowerCase();
    // Check if it looks like a time
    if (isTimeLike(beforeColon)) {
      time = beforeColon;
      description = content.slice(colonIndex + 2);
    }
  }

  // Determine type from time/content
  const type = inferType(time, description);

  return {
    time,
    description,
    type,
    fallback,
    optional,
    place: null // Will be enriched by Gemini
  };
}

function isTimeLike(str) {
  const timePatterns = [
    /^\d{1,2}(am|pm)$/,           // 11am, 5pm
    /^\d{1,2}:\d{2}(am|pm)?$/,    // 11:00, 5:30pm
    /^\d{1,2}-\d{1,2}(am|pm)?$/,  // 1-4pm
    /^\d{1,2}(am|pm)?-\d{1,2}(am|pm)$/, // 1pm-4pm
    /^morning$/, /^afternoon$/, /^evening$/, /^night$/, /^late$/,
    /^breakfast$/, /^lunch$/, /^dinner$/, /^brunch$/
  ];
  return timePatterns.some(p => p.test(str));
}

function inferType(time, description) {
  const timeLower = (time || '').toLowerCase();
  const descLower = description.toLowerCase();

  // Food types
  if (['breakfast', 'lunch', 'dinner', 'brunch'].includes(timeLower)) {
    return 'food';
  }
  if (descLower.includes('coffee') || descLower.includes('pizza') ||
      descLower.includes('restaurant') || descLower.includes('delicatessen')) {
    return 'food';
  }

  // Entertainment
  if (descLower.includes('hamilton') || descLower.includes('theatre') ||
      descLower.includes('jazz') || descLower.includes('vanguard') ||
      descLower.includes('show')) {
    return 'entertainment';
  }

  // Culture
  if (descLower.includes('museum') || descLower.includes('memorial') ||
      descLower.includes('gallery')) {
    return 'culture';
  }

  // Transit
  if (descLower.includes('subway') || descLower.includes('train') ||
      descLower.includes('taxi') || descLower.includes('uber')) {
    return 'transit';
  }

  return 'activity';
}

module.exports = { parseItinerary, parseItem };
