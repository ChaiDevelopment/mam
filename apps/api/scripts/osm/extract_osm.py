"""
Extracts named food places and localities from an OpenStreetMap .osm.pbf extract into NDJSON.

    python scripts/osm/extract_osm.py <input.osm.pbf> <output.ndjson>

Requires pyosmium (pip install osmium). Memory-light two-pass design (no full node-location index):
  pass 1  tagged nodes  -> emitted directly; tagged ways -> remember their node ids
  pass 2  only those node ids (C++ IdFilter) -> way centroids

Data © OpenStreetMap contributors, Open Database License (ODbL) 1.0.
"""
import json
import re
import sys
import time

import osmium
import osmium.filter as F

FOOD_AMENITY = {"restaurant", "fast_food", "cafe", "food_court", "ice_cream"}
FOOD_SHOP = {"bakery", "pastry", "confectionery"}
PLACE_KINDS = {"city", "town", "suburb", "village"}
KEEP_TAGS = (
    "name", "name:id", "amenity", "shop", "cuisine", "brand", "brand:wikidata", "operator", "operator:wikidata", "diet:vegetarian", "diet:vegan", "diet:halal",
    "addr:full", "addr:street", "addr:housenumber", "addr:subdistrict", "addr:district", "addr:city",
    "addr:province", "addr:state", "addr:postcode", "phone", "contact:phone", "website", "contact:website",
    "opening_hours", "disused", "abandoned", "population", "is_in", "is_in:province", "is_in:city",
)
LIFECYCLE_PREFIX = re.compile(r"^(disused|abandoned|was|demolished|removed|razed):")


def kind_of(tags):
    amenity = tags.get("amenity")
    if amenity in FOOD_AMENITY:
        return "food", amenity
    shop = tags.get("shop")
    if shop in FOOD_SHOP:
        return "food", shop
    place = tags.get("place")
    if place in PLACE_KINDS:
        return "locality", place
    return None, None


def keep(tags):
    return {k: tags[k][:300] for k in KEEP_TAGS if k in tags}


def main(src, dst):
    t0 = time.time()
    way_nodes = {}  # way id -> (kind, sub, tags, [node ids])
    wanted = set()
    counts = {"nodes": 0, "ways": 0, "localities": 0, "skipped": 0}

    with open(dst, "w", encoding="utf-8") as out:
        fp = osmium.FileProcessor(src, osmium.osm.NODE | osmium.osm.WAY).with_filter(F.KeyFilter("amenity", "shop", "place"))
        for obj in fp:
            tags = {t.k: t.v for t in obj.tags}
            if "name" not in tags or any(LIFECYCLE_PREFIX.match(k) for k in tags):
                continue
            kind, sub = kind_of(tags)
            if kind is None:
                continue
            if obj.is_node():
                if not obj.location.valid():
                    counts["skipped"] += 1
                    continue
                if kind == "locality":
                    counts["localities"] += 1
                else:
                    counts["nodes"] += 1
                out.write(json.dumps({"t": "l" if kind == "locality" else "p", "id": f"node/{obj.id}", "kind": sub,
                                      "lat": round(obj.location.lat, 7), "lng": round(obj.location.lon, 7),
                                      "tags": keep(tags)}, ensure_ascii=False) + "\n")
            elif obj.is_way() and kind == "food":
                ids = [n.ref for n in obj.nodes]
                if len(ids) > 1 and ids[0] == ids[-1]:
                    ids = ids[:-1]
                if not ids:
                    continue
                way_nodes[obj.id] = (sub, keep(tags), ids)
                wanted.update(ids)
        print(f"pass 1: {counts['nodes']} food nodes, {counts['localities']} localities, {len(way_nodes)} food ways "
              f"({time.time() - t0:.0f}s)", flush=True)

        locs = {}
        if wanted:
            fp2 = osmium.FileProcessor(src, osmium.osm.NODE).with_filter(F.IdFilter(wanted))
            for n in fp2:
                if n.location.valid():
                    locs[n.id] = (n.location.lat, n.location.lon)
        for wid, (sub, tags, ids) in way_nodes.items():
            pts = [locs[i] for i in ids if i in locs]
            if not pts:
                counts["skipped"] += 1
                continue
            lat = sum(p[0] for p in pts) / len(pts)
            lng = sum(p[1] for p in pts) / len(pts)
            counts["ways"] += 1
            out.write(json.dumps({"t": "p", "id": f"way/{wid}", "kind": sub, "lat": round(lat, 7), "lng": round(lng, 7),
                                  "tags": tags}, ensure_ascii=False) + "\n")

    print(json.dumps({"input": src, "output": dst, **counts, "seconds": round(time.time() - t0)}), flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(64)
    main(sys.argv[1], sys.argv[2])
