/* Shared routing math for the Route App.
   The browser loads routing.js. Apps Script pastes this same file into an
   HTML file named routing (no markup) and inlines it at serve time.
   Keep this file free of HTML and of the character sequence that closes a script tag. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.RouteRouting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EARTH_M = 6371000;
  var DAY_GUARD = 400;

  function isNum(v) {
    if (v === null || v === undefined || v === '') return false;
    var n = Number(v);
    return isFinite(n);
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    var toR = Math.PI / 180;
    var dLat = (Number(lat2) - Number(lat1)) * toR;
    var dLon = (Number(lon2) - Number(lon1)) * toR;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(Number(lat1) * toR) * Math.cos(Number(lat2) * toR) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    if (a < 0) a = 0;
    if (a > 1) a = 1;
    return 2 * EARTH_M * Math.asin(Math.sqrt(a));
  }

  function dist2(a, b) {
    var dlat = Number(a.lat) - Number(b.lat);
    var dlon = Number(a.lon) - Number(b.lon);
    return dlat * dlat + dlon * dlon;
  }

  function centroid(points, idxs) {
    if (!idxs || !idxs.length) return { lat: 0, lon: 0 };
    var lat = 0;
    var lon = 0;
    var i;
    for (i = 0; i < idxs.length; i++) {
      lat += Number(points[idxs[i]].lat);
      lon += Number(points[idxs[i]].lon);
    }
    return { lat: lat / idxs.length, lon: lon / idxs.length };
  }

  function wcss(points, groups) {
    var sum = 0;
    var g;
    var i;
    for (g = 0; g < groups.length; g++) {
      if (!groups[g].length) continue;
      var c = centroid(points, groups[g]);
      for (i = 0; i < groups[g].length; i++) {
        sum += dist2(points[groups[g][i]], c);
      }
    }
    return sum;
  }

  function hashCoords(points) {
    var h = 2166136261;
    var p;
    var i;
    for (p = 0; p < points.length; p++) {
      var s = Number(points[p].lat).toFixed(6) + ',' + Number(points[p].lon).toFixed(6) + '|';
      for (i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function balancedSizes(n, k) {
    var base = Math.floor(n / k);
    var extra = n % k;
    var sizes = [];
    var i;
    for (i = 0; i < k; i++) sizes.push(base + (i < extra ? 1 : 0));
    return sizes;
  }

  function groupsKey(groups) {
    var parts = [];
    var g;
    for (g = 0; g < groups.length; g++) {
      var copy = groups[g].slice().sort(function (a, b) { return a - b; });
      parts.push(copy.join('.'));
    }
    return parts.join('|');
  }

  function betterOrEqual(w, key, bestW, bestKey) {
    if (bestW === null) return true;
    if (w < bestW - 1e-12) return true;
    if (w > bestW + 1e-12) return false;
    return key < bestKey;
  }

  function assignToGroups(assign, k) {
    var groups = [];
    var c;
    var i;
    for (c = 0; c < k; c++) groups.push([]);
    for (i = 0; i < assign.length; i++) groups[assign[i]].push(i);
    return groups;
  }

  function reseedEmpty(points, assign, centers, k) {
    var guard;
    for (guard = 0; guard < k * 3; guard++) {
      var counts = [];
      var c;
      var i;
      for (c = 0; c < k; c++) counts.push(0);
      for (i = 0; i < assign.length; i++) counts[assign[i]]++;
      var empty = -1;
      for (c = 0; c < k; c++) {
        if (counts[c] === 0) { empty = c; break; }
      }
      if (empty < 0) return;
      var far = -1;
      var farD = -1;
      for (i = 0; i < points.length; i++) {
        if (counts[assign[i]] < 2) continue;
        var nearest = Infinity;
        for (c = 0; c < k; c++) {
          if (c === empty) continue;
          var d = dist2(points[i], centers[c]);
          if (d < nearest) nearest = d;
        }
        if (nearest > farD + 1e-15 || (Math.abs(nearest - farD) <= 1e-15 && (far < 0 || i < far))) {
          farD = nearest;
          far = i;
        }
      }
      if (far < 0) return;
      assign[far] = empty;
      var members = [];
      for (i = 0; i < points.length; i++) {
        if (assign[i] === empty) members.push(i);
      }
      centers[empty] = centroid(points, members);
    }
  }

  function balanceGroups(points, groups) {
    var k = groups.length;
    var guard = points.length * k + 5;
    while (guard-- > 0) {
      var maxI = 0;
      var minI = 0;
      var c;
      for (c = 1; c < k; c++) {
        if (groups[c].length > groups[maxI].length) maxI = c;
        if (groups[c].length < groups[minI].length) minI = c;
      }
      if (groups[maxI].length - groups[minI].length <= 1) break;
      var dest = centroid(points, groups[minI]);
      var bestPos = 0;
      var bestD = Infinity;
      var bestIdx = Infinity;
      var p;
      for (p = 0; p < groups[maxI].length; p++) {
        var idx = groups[maxI][p];
        var d2 = groups[minI].length ? dist2(points[idx], dest) : 0;
        if (d2 < bestD - 1e-15 || (Math.abs(d2 - bestD) <= 1e-15 && idx < bestIdx)) {
          bestD = d2;
          bestIdx = idx;
          bestPos = p;
        }
      }
      var moved = groups[maxI].splice(bestPos, 1)[0];
      groups[minI].push(moved);
    }
    return groups;
  }

  function kmeansPartition(points, k) {
    var n = points.length;
    var rng = mulberry32(hashCoords(points));
    var centers = [];
    var used = {};
    var first = Math.floor(rng() * n);
    if (first < 0) first = 0;
    if (first >= n) first = n - 1;
    centers.push({ lat: Number(points[first].lat), lon: Number(points[first].lon) });
    used[first] = true;

    while (centers.length < k) {
      var d2 = [];
      var sum = 0;
      var i;
      var c;
      for (i = 0; i < n; i++) {
        var best = Infinity;
        for (c = 0; c < centers.length; c++) {
          var d = dist2(points[i], centers[c]);
          if (d < best) best = d;
        }
        d2.push(best);
        sum += best;
      }
      var pick;
      if (sum === 0) {
        pick = 0;
        while (pick < n && used[pick]) pick++;
        if (pick >= n) pick = n - 1;
      } else {
        var r = rng() * sum;
        pick = n - 1;
        for (i = 0; i < n; i++) {
          r -= d2[i];
          if (r <= 0) { pick = i; break; }
        }
      }
      used[pick] = true;
      centers.push({ lat: Number(points[pick].lat), lon: Number(points[pick].lon) });
    }

    var assign = [];
    for (var z = 0; z < n; z++) assign.push(0);
    var iter;
    for (iter = 0; iter < 30; iter++) {
      var changed = false;
      var i2;
      var c2;
      for (i2 = 0; i2 < n; i2++) {
        var bestC = 0;
        var bestD = Infinity;
        for (c2 = 0; c2 < k; c2++) {
          var dd = dist2(points[i2], centers[c2]);
          if (dd < bestD - 1e-15 || (Math.abs(dd - bestD) <= 1e-15 && c2 < bestC)) {
            bestD = dd;
            bestC = c2;
          }
        }
        if (assign[i2] !== bestC) {
          assign[i2] = bestC;
          changed = true;
        }
      }
      reseedEmpty(points, assign, centers, k);
      for (c2 = 0; c2 < k; c2++) {
        var members = [];
        for (i2 = 0; i2 < n; i2++) if (assign[i2] === c2) members.push(i2);
        if (members.length) centers[c2] = centroid(points, members);
      }
      if (!changed) break;
    }
    return balanceGroups(points, assignToGroups(assign, k));
  }

  function sweepPartition(points, k) {
    var n = points.length;
    var all = [];
    var i;
    for (i = 0; i < n; i++) all.push(i);
    var c = centroid(points, all);
    var order = [];
    for (i = 0; i < n; i++) {
      order.push({
        i: i,
        ang: Math.atan2(Number(points[i].lat) - c.lat, Number(points[i].lon) - c.lon)
      });
    }
    order.sort(function (a, b) {
      if (a.ang < b.ang) return -1;
      if (a.ang > b.ang) return 1;
      return a.i - b.i;
    });
    var sizes = balancedSizes(n, k);
    var best = null;
    var bestW = null;
    var bestKey = null;
    var rot;
    for (rot = 0; rot < n; rot++) {
      var groups = [];
      var cursor = rot;
      var g;
      for (g = 0; g < k; g++) {
        var bucket = [];
        var s;
        for (s = 0; s < sizes[g]; s++) {
          bucket.push(order[cursor % n].i);
          cursor++;
        }
        groups.push(bucket);
      }
      var w = wcss(points, groups);
      var key = groupsKey(groups);
      if (betterOrEqual(w, key, bestW, bestKey)) {
        bestW = w;
        bestKey = key;
        best = groups;
      }
    }
    return best;
  }

  function sortGroups(groups) {
    var g;
    for (g = 0; g < groups.length; g++) {
      groups[g].sort(function (a, b) { return a - b; });
    }
    return groups;
  }

  function clusterBalanced(points, k) {
    var n = points.length;
    if (!n || !k || k < 1) return [];
    k = Math.min(Math.floor(k), n);
    if (k === 1) {
      var only = [];
      var i;
      for (i = 0; i < n; i++) only.push(i);
      return [only];
    }
    var km = kmeansPartition(points, k);
    var sw = sweepPartition(points, k);
    var wKm = wcss(points, km);
    var wSw = wcss(points, sw);
    var best = wSw <= wKm ? sw : km;
    return sortGroups(best.map(function (g) { return g.slice(); }));
  }

  function nearestNeighborOrder(start, stops) {
    var indexOf = new Map();
    var i;
    for (i = 0; i < stops.length; i++) indexOf.set(stops[i], i);
    var remaining = stops.slice();
    var ordered = [];
    var current = start && isNum(start.lat) && isNum(start.lon) ? start : null;

    function take(pos) {
      var next = remaining.splice(pos, 1)[0];
      ordered.push(next);
      current = next;
    }

    if (!current) {
      if (!remaining.length) return ordered;
      var best0 = 0;
      for (i = 1; i < remaining.length; i++) {
        var a = remaining[i];
        var b = remaining[best0];
        var better = Number(a.lon) < Number(b.lon) - 1e-12 ||
          (Math.abs(Number(a.lon) - Number(b.lon)) <= 1e-12 &&
            (Number(a.lat) < Number(b.lat) - 1e-12 ||
              (Math.abs(Number(a.lat) - Number(b.lat)) <= 1e-12 && indexOf.get(a) < indexOf.get(b))));
        if (better) best0 = i;
      }
      take(best0);
    }

    while (remaining.length) {
      var best = 0;
      var bestD = Infinity;
      var bestI = Infinity;
      for (i = 0; i < remaining.length; i++) {
        var s = remaining[i];
        var d = haversineMeters(current.lat, current.lon, s.lat, s.lon);
        var oi = indexOf.get(s);
        if (d < bestD - 1e-6 || (Math.abs(d - bestD) <= 1e-6 && oi < bestI)) {
          bestD = d;
          best = i;
          bestI = oi;
        }
      }
      take(best);
    }
    return ordered;
  }

  function pathDistance(start, ordered) {
    if (!ordered || !ordered.length) return 0;
    var dist = 0;
    var prev = start && isNum(start.lat) && isNum(start.lon) ? start : null;
    var i = 0;
    if (!prev) {
      prev = ordered[0];
      i = 1;
    }
    for (; i < ordered.length; i++) {
      dist += haversineMeters(prev.lat, prev.lon, ordered[i].lat, ordered[i].lon);
      prev = ordered[i];
    }
    return dist;
  }

  function reverseRange(arr, i, k) {
    while (i < k) {
      var tmp = arr[i];
      arr[i] = arr[k];
      arr[k] = tmp;
      i++;
      k--;
    }
  }

  function orderRoute(start, stops) {
    var ordered = nearestNeighborOrder(start, stops);
    var n = ordered.length;
    if (n < 2) return ordered;
    var base = pathDistance(start, ordered);
    var passes = 0;
    var improved = true;
    while (improved && passes < 40) {
      improved = false;
      passes++;
      var i;
      var k;
      for (i = 0; i < n - 1 && !improved; i++) {
        for (k = i + 1; k < n; k++) {
          reverseRange(ordered, i, k);
          var next = pathDistance(start, ordered);
          if (next + 0.5 < base) {
            base = next;
            improved = true;
            break;
          }
          reverseRange(ordered, i, k);
        }
      }
    }
    return ordered;
  }

  function routeDistanceMeters(start, ordered) {
    return pathDistance(start, ordered);
  }

  function parseYMD(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '').trim());
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function formatYMD(d) {
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function enumerateDates(start, end, weekdays) {
    var s = parseYMD(start);
    var e = parseYMD(end);
    if (!s || !e || e < s) return [];
    var allow = {};
    var i;
    if (!weekdays) {
      for (i = 0; i < 7; i++) allow[i] = true;
    } else {
      for (i = 0; i < weekdays.length; i++) allow[Number(weekdays[i])] = true;
    }
    var out = [];
    var cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    var endD = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    var guard = 0;
    while (cur <= endD && guard < DAY_GUARD) {
      if (allow[cur.getDay()]) out.push(formatYMD(cur));
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return out;
  }

  function splitCsvLine(line) {
    var out = [];
    var cur = '';
    var inQ = false;
    var i;
    for (i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') {
            cur += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function normalizeHeader(cell) {
    return String(cell || '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  var HEADER_ALIASES = {
    address: { address: 1, addr: 1, street: 1 },
    lat: { lat: 1, latitude: 1 },
    lon: { lon: 1, lng: 1, long: 1, longitude: 1 },
    name: { name: 1, customer: 1, customer_name: 1, owner: 1 },
    phone: { phone: 1, tel: 1, telephone: 1 },
    notes: { notes: 1, note: 1 }
  };

  function mapHeader(cells) {
    var col = { address: null, lat: null, lon: null, name: null, phone: null, notes: null };
    var i;
    for (i = 0; i < cells.length; i++) {
      var key;
      for (key in HEADER_ALIASES) {
        if (HEADER_ALIASES[key][cells[i]]) col[key] = i;
      }
    }
    return col;
  }

  function numOrNull(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    if (!s) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function isPureNumber(v) {
    return /^-?\d+(?:\.\d+)?$/.test(String(v || '').trim());
  }

  function isPoolLine(line) {
    var cells = splitCsvLine(line);
    if (cells.length < 3) return false;
    var latS = cells[0].trim();
    var lonS = cells[1].trim();
    if (!isPureNumber(latS) || !isPureNumber(lonS)) return false;
    var lat = Number(latS);
    var lon = Number(lonS);
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }

  function parsePoolLine(line) {
    var cells = splitCsvLine(line).map(function (c) { return c.trim(); });
    var lat = Number(cells[0]);
    var lon = Number(cells[1]);
    var rest = cells.slice(2);
    if (rest.length && /^(yes|no|true|false|0|1)$/i.test(rest[rest.length - 1])) {
      rest = rest.slice(0, -1);
    }
    return blankStop(rest.join(', '), lat, lon);
  }

  function blankStop(address, lat, lon) {
    return {
      address: address || '',
      lat: lat === undefined ? null : lat,
      lon: lon === undefined ? null : lon,
      name: '',
      phone: '',
      notes: ''
    };
  }

  function parseStopList(text) {
    if (!text) return [];
    var raw = String(text).replace(/^\uFEFF/, '');
    var lines = raw.split(/\r?\n/);
    var kept = [];
    var i;
    for (i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== '') kept.push(lines[i]);
    }
    if (!kept.length) return [];

    var headerCells = splitCsvLine(kept[0]).map(normalizeHeader);
    var col = mapHeader(headerCells);
    var headerMode = col.address !== null || (col.lat !== null && col.lon !== null);
    if (headerMode) {
      var out = [];
      for (i = 1; i < kept.length; i++) {
        var cells = splitCsvLine(kept[i]);
        var address = col.address !== null ? String(cells[col.address] || '').trim() : '';
        var lat = col.lat !== null ? numOrNull(cells[col.lat]) : null;
        var lon = col.lon !== null ? numOrNull(cells[col.lon]) : null;
        if (!address && lat === null && lon === null) continue;
        var stop = blankStop(address, lat, lon);
        stop.name = col.name !== null ? String(cells[col.name] || '').trim() : '';
        stop.phone = col.phone !== null ? String(cells[col.phone] || '').trim() : '';
        stop.notes = col.notes !== null ? String(cells[col.notes] || '').trim() : '';
        out.push(stop);
      }
      return out;
    }

    var allPool = true;
    for (i = 0; i < kept.length; i++) {
      if (!isPoolLine(kept[i])) { allPool = false; break; }
    }
    if (allPool) {
      return kept.map(parsePoolLine);
    }

    return kept.map(function (line) { return blankStop(line.trim(), null, null); });
  }

  function driverStart(driver) {
    if (driver && isNum(driver.startLat) && isNum(driver.startLon)) {
      return { lat: Number(driver.startLat), lon: Number(driver.startLon) };
    }
    return null;
  }

  function planRoutes(opts) {
    opts = opts || {};
    var stops = opts.stops || [];
    var drivers = opts.drivers || [];
    var dates = opts.dates || [];
    var maxStops = Number(opts.maxStopsPerDay);
    if (!isFinite(maxStops) || maxStops < 1) maxStops = 12;
    maxStops = Math.floor(maxStops);

    if (!stops.length) return { ok: true, routes: [] };
    if (!drivers.length) return { ok: false, error: 'Add at least one driver.' };
    if (!dates.length) return { ok: false, error: 'Pick at least one date.' };

    var s;
    for (s = 0; s < stops.length; s++) {
      if (!isNum(stops[s].lat) || !isNum(stops[s].lon)) {
        return { ok: false, error: 'Every stop needs a latitude and longitude before routes can be built.' };
      }
    }

    var slots = dates.length * drivers.length;
    if (stops.length > slots * maxStops || Math.ceil(stops.length / dates.length) > drivers.length * maxStops) {
      return { ok: false, error: 'Too many stops for the drivers, dates, and max stops per day.' };
    }

    var kDays = Math.min(dates.length, stops.length);
    var dayGroups = clusterBalanced(stops, kDays);
    dayGroups.sort(function (a, b) {
      var ca = centroid(stops, a);
      var cb = centroid(stops, b);
      if (ca.lon !== cb.lon) return ca.lon - cb.lon;
      if (ca.lat !== cb.lat) return ca.lat - cb.lat;
      return (a[0] || 0) - (b[0] || 0);
    });

    var routes = [];
    var d;
    for (d = 0; d < dayGroups.length; d++) {
      var dayIdx = dayGroups[d];
      var dayStops = dayIdx.map(function (i) { return stops[i]; });
      var need = Math.ceil(dayStops.length / maxStops);
      if (need > drivers.length) {
        return { ok: false, error: 'Too many stops for the drivers on one day.' };
      }
      var kDrv = Math.min(drivers.length, dayStops.length);
      var drvGroups = clusterBalanced(dayStops, kDrv);
      var centroids = drvGroups.map(function (g) { return centroid(dayStops, g); });
      var withStart = [];
      var noStart = [];
      var di;
      for (di = 0; di < drivers.length; di++) {
        if (driverStart(drivers[di])) withStart.push(drivers[di]);
        else noStart.push(drivers[di]);
      }

      var assigned = [];
      var gi;
      for (gi = 0; gi < drvGroups.length; gi++) assigned.push(null);
      var used = {};
      var pairs = [];
      for (gi = 0; gi < drvGroups.length; gi++) {
        for (di = 0; di < withStart.length; di++) {
          var drv = withStart[di];
          pairs.push({
            dist: haversineMeters(centroids[gi].lat, centroids[gi].lon, drv.startLat, drv.startLon),
            gi: gi,
            drv: drv
          });
        }
      }
      pairs.sort(function (a, b) {
        if (a.dist !== b.dist) return a.dist - b.dist;
        if (a.gi !== b.gi) return a.gi - b.gi;
        var ida = String(a.drv.id);
        var idb = String(b.drv.id);
        if (ida < idb) return -1;
        if (ida > idb) return 1;
        return 0;
      });
      var p;
      for (p = 0; p < pairs.length; p++) {
        if (assigned[pairs[p].gi] || used[pairs[p].drv.id]) continue;
        assigned[pairs[p].gi] = pairs[p].drv;
        used[pairs[p].drv.id] = true;
      }

      var pool = noStart.slice();
      for (di = 0; di < drivers.length; di++) {
        if (!used[drivers[di].id]) {
          var already = false;
          var q;
          for (q = 0; q < pool.length; q++) if (pool[q].id === drivers[di].id) already = true;
          if (!already) pool.push(drivers[di]);
        }
      }
      var poolI = 0;
      for (gi = 0; gi < drvGroups.length; gi++) {
        if (assigned[gi]) continue;
        if (poolI >= pool.length) return { ok: false, error: 'Not enough drivers for this day.' };
        assigned[gi] = pool[poolI++];
      }

      for (gi = 0; gi < drvGroups.length; gi++) {
        var groupStops = drvGroups[gi].map(function (i) { return dayStops[i]; });
        if (groupStops.length > maxStops) {
          return { ok: false, error: 'A route would exceed the max stops per day.' };
        }
        var driver = assigned[gi];
        var ordered = orderRoute(driverStart(driver), groupStops);
        routes.push({
          date: dates[d],
          driverId: driver.id,
          driverName: driver.name || '',
          stops: ordered
        });
      }
    }

    return { ok: true, routes: routes };
  }

  function coordToken(stop) {
    if (isNum(stop.lat) && isNum(stop.lon)) return String(Number(stop.lat)) + ',' + String(Number(stop.lon));
    return encodeURIComponent(stop.address || '');
  }

  function navigateUrl(lat, lon, apple, address) {
    if (isNum(lat) && isNum(lon)) {
      var pair = String(Number(lat)) + ',' + String(Number(lon));
      if (apple) return 'https://maps.apple.com/?daddr=' + pair + '&dirflg=d';
      return 'https://www.google.com/maps/dir/?api=1&destination=' + pair + '&travelmode=driving';
    }
    var q = encodeURIComponent(address || '');
    if (apple) return 'https://maps.apple.com/?daddr=' + q + '&dirflg=d';
    return 'https://www.google.com/maps/dir/?api=1&destination=' + q + '&travelmode=driving';
  }

  function googleMapsRouteUrl(stops, maxWaypoints) {
    var cap = maxWaypoints === undefined || maxWaypoints === null ? 9 : Number(maxWaypoints);
    if (!isFinite(cap) || cap < 0) cap = 0;
    cap = Math.floor(cap);
    var usable = [];
    var i;
    for (i = 0; i < (stops || []).length; i++) {
      var token = coordToken(stops[i]);
      if (token) usable.push(token);
    }
    var maxIncluded = cap + 1;
    if (maxIncluded < 1) maxIncluded = 1;
    var truncated = usable.length > maxIncluded;
    var includedPts = usable.slice(0, maxIncluded);
    var included = includedPts.length;
    if (!included) return { url: '', truncated: false, included: 0 };
    var destination = includedPts[includedPts.length - 1];
    var waypoints = includedPts.slice(0, -1);
    var url = 'https://www.google.com/maps/dir/?api=1&destination=' + destination + '&travelmode=driving';
    if (waypoints.length) url += '&waypoints=' + waypoints.join('|');
    return { url: url, truncated: truncated, included: included };
  }

  return {
    haversineMeters: haversineMeters,
    parseStopList: parseStopList,
    enumerateDates: enumerateDates,
    clusterBalanced: clusterBalanced,
    nearestNeighborOrder: nearestNeighborOrder,
    orderRoute: orderRoute,
    routeDistanceMeters: routeDistanceMeters,
    planRoutes: planRoutes,
    navigateUrl: navigateUrl,
    googleMapsRouteUrl: googleMapsRouteUrl
  };
});
