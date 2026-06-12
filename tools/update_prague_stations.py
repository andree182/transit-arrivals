import urllib.request
import json
import ssl
import os
import sys

token = os.environ.get("GOLEMIO_API_KEY")
if not token:
    print("Error: GOLEMIO_API_KEY environment variable is not set.", file=sys.stderr)
    print("Please provide a valid Golemio API key to update the stations database.", file=sys.stderr)
    print("Usage: GOLEMIO_API_KEY=your_key_here python3 tools/update_prague_stations.py", file=sys.stderr)
    sys.exit(1)

headers = {"X-Access-Token": token}

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

station_dict = {}
limit = 10000
offset = 0

try:
    while True:
        url = f"https://api.golemio.cz/v2/gtfs/stops?limit={limit}&offset={offset}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx) as response:
            data = json.loads(response.read().decode())
            features = data.get("features", [])
            if not features:
                break
                
            for f in features:
                props = f.get("properties", {})
                name = props.get("stop_name")
                if not name: continue
                
                # We only want parent stations (location_type 1) or standalone stops (location_type 0 without parent)
                # If it's a child stop, we just use its name and parent info if available.
                # Actually, many bus stops are location_type=0 without parents.
                # So we just aggregate by exact stop_name.
                
                if name not in station_dict:
                    geom = f.get("geometry", {})
                    coords = geom.get("coordinates", [0, 0])
                    station_dict[name] = {
                        "id": name,
                        "name": name,
                        "lines": [],
                        "lat": round(coords[1], 5),
                        "lon": round(coords[0], 5),
                        "agency": "pid"
                    }
            print(f"Fetched {len(features)} stops at offset {offset}")
            offset += limit

    stations = list(station_dict.values())
    print(f"Fetched {len(stations)} unique stations")
    print("Data provided by Golemio API under CC-BY license.")
    with open("src/pkjs/lib/prague.stations.json", "w") as f:
        json.dump(stations, f)
        
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode())
