// Encodes one FeedMessage: one entity, route_id "N", two stop_time_updates.
function varint(n) { var b = []; do { var x = n & 0x7f; n = Math.floor(n / 128); if (n) x |= 0x80; b.push(x); } while (n); return b; }
function lenDelim(field, bytes) { return [(field << 3) | 2].concat(varint(bytes.length)).concat(bytes); }
function vfield(field, n) { return [((field << 3) | 0)].concat(varint(n)); }
function str(field, s) { var b = Array.from(Buffer.from(s, 'utf8')); return lenDelim(field, b); }

function stopTimeUpdate(stopId, time) {
  var arrival = lenDelim(2, vfield(2, time));       // StopTimeUpdate.arrival{ time }
  var stop = str(4, stopId);                        // StopTimeUpdate.stop_id
  return arrival.concat(stop);
}
function build() {
  var trip = str(5, 'N');                                          // TripDescriptor.route_id="N"
  var tu = lenDelim(1, trip)
    .concat(lenDelim(2, stopTimeUpdate('R01N', 1780000060)))
    .concat(lenDelim(2, stopTimeUpdate('R01N', 1780000300)));
  var entity = lenDelim(3, tu);                                    // FeedEntity.trip_update
  var msg = lenDelim(2, entity);                                   // FeedMessage.entity
  return Uint8Array.from(msg);
}

// One FeedMessage with one trip: route_id and stops = [[stopId, time], ...].
// The stops appear in sequence order, so the last one is the trip's terminal.
function buildTrip(route, stops) {
  var tu = lenDelim(1, str(5, route));
  stops.forEach(function (s) { tu = tu.concat(lenDelim(2, stopTimeUpdate(s[0], s[1]))); });
  return Uint8Array.from(lenDelim(2, lenDelim(3, tu)));
}
module.exports = { build: build, buildTrip: buildTrip };
