var pbf = require('./pbf');
function utf8(buf, s, e) { var out = ''; for (var i = s; i < e; i++) out += String.fromCharCode(buf[i]); return decodeURIComponent(escape(out)); }
function stationOf(stopId) {
  var c = stopId.charAt(stopId.length - 1);
  return (c === 'N' || c === 'S') ? stopId.slice(0, -1) : stopId;
}

// Returns [{ route, dir, stop, time, dest }] across all trip_updates. dir is the
// GTFS-RT direction_id (or undefined when absent, as in the NYCT feed). dest is
// the trip's terminal (last stop, suffix stripped) for multi-stop trips, or null
// for single-stop dummy trips (PATH) where the static terminals table applies.
function extractStopTimes(buf) {
  var rows = [];
  pbf.readFields(buf, 0, buf.length).forEach(function (entityF) {
    if (entityF.fieldNum !== 2 || entityF.wireType !== 2) return;        // FeedMessage.entity
    pbf.readFields(buf, entityF.start, entityF.end).forEach(function (f) {
      if (f.fieldNum !== 3 || f.wireType !== 2) return;                  // FeedEntity.trip_update
      var route = null, dir, stus = [];
      pbf.readFields(buf, f.start, f.end).forEach(function (tf) {
        if (tf.fieldNum === 1 && tf.wireType === 2) {                    // TripUpdate.trip
          pbf.readFields(buf, tf.start, tf.end).forEach(function (df) {
            if (df.fieldNum === 5 && df.wireType === 2) route = utf8(buf, df.start, df.end);
            else if (df.fieldNum === 6 && df.wireType === 0) dir = df.value;  // TripDescriptor.direction_id
          });
        } else if (tf.fieldNum === 2 && tf.wireType === 2) {             // TripUpdate.stop_time_update
          var stop = null, time = 0;
          pbf.readFields(buf, tf.start, tf.end).forEach(function (sf) {
            if (sf.fieldNum === 2 && sf.wireType === 2) {                // StopTimeUpdate.arrival
              pbf.readFields(buf, sf.start, sf.end).forEach(function (af) {
                if (af.fieldNum === 2 && af.wireType === 0) time = af.value;
              });
            } else if (sf.fieldNum === 4 && sf.wireType === 2) {         // StopTimeUpdate.stop_id
              stop = utf8(buf, sf.start, sf.end);
            }
          });
          if (stop) stus.push({ stop: stop, time: time });
        }
      });
      // Multi-stop trips (NYCT) carry the full remaining sequence, so the last
      // stop is the real terminal. PATH emits single-stop dummy trips where the
      // lone stop is the station itself, not a destination — report null and let
      // the static terminals table fill it in.
      var dest = stus.length > 1 ? stationOf(stus[stus.length - 1].stop) : null;
      stus.forEach(function (s) { rows.push({ route: route, dir: dir, stop: s.stop, time: s.time, dest: dest }); });
    });
  });
  return rows;
}
module.exports = { extractStopTimes: extractStopTimes };
