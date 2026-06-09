import { readFields } from './pbf.js';

function utf8(buf, s, e) {
  let out = '';
  for (let i = s; i < e; i++) out += String.fromCharCode(buf[i]);
  try { return decodeURIComponent(escape(out)); } catch { return out; }
}

// One row per trip_update: { routeId, tripId, directionId, stops:[{stopId,time}] }.
// time = arrival.time, else departure.time, else 0. No filtering (callers filter).
export function extractTripUpdates(buf) {
  const trips = [];
  for (const ent of readFields(buf, 0, buf.length)) {
    if (ent.fieldNum !== 2 || ent.wireType !== 2) continue;            // FeedMessage.entity
    for (const f of readFields(buf, ent.start, ent.end)) {
      if (f.fieldNum !== 3 || f.wireType !== 2) continue;              // FeedEntity.trip_update
      let routeId = null, tripId = null, directionId, stops = [];
      for (const tf of readFields(buf, f.start, f.end)) {
        if (tf.fieldNum === 1 && tf.wireType === 2) {                  // TripUpdate.trip
          for (const df of readFields(buf, tf.start, tf.end)) {
            if (df.fieldNum === 1 && df.wireType === 2) tripId = utf8(buf, df.start, df.end);
            else if (df.fieldNum === 5 && df.wireType === 2) routeId = utf8(buf, df.start, df.end);
            else if (df.fieldNum === 6 && df.wireType === 0) directionId = df.value;
          }
        } else if (tf.fieldNum === 2 && tf.wireType === 2) {           // TripUpdate.stop_time_update
          let stopId = null, aTime = 0, dTime = 0;
          for (const sf of readFields(buf, tf.start, tf.end)) {
            if ((sf.fieldNum === 2 || sf.fieldNum === 3) && sf.wireType === 2) {  // arrival|departure
              for (const ef of readFields(buf, sf.start, sf.end)) {
                if (ef.fieldNum === 2 && ef.wireType === 0) {
                  if (sf.fieldNum === 2) aTime = ef.value; else dTime = ef.value;
                }
              }
            } else if (sf.fieldNum === 4 && sf.wireType === 2) {       // stop_id
              stopId = utf8(buf, sf.start, sf.end);
            }
          }
          if (stopId) stops.push({ stopId, time: aTime || dTime || 0 });
        }
      }
      trips.push({ routeId, tripId, directionId, stops });
    }
  }
  return trips;
}
