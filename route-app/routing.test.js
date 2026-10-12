'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./routing.js');

function blob(prefix, lat, lon) {
  const offs = [[0, 0], [0.001, 0.0005], [-0.0008, 0.0007], [0.0004, -0.0009]];
  return offs.map(function (o, i) {
    return {
      id: prefix + i,
      lat: lat + o[0],
      lon: lon + o[1],
      address: prefix + i
    };
  });
}

test('haversine is about 111195 meters per degree of latitude', function () {
  const d = R.haversineMeters(0, 0, 1, 0);
  assert.ok(Math.abs(d - 111195) / 111195 < 0.01);
});

test('balanced clusters use every index and sizes differ by at most one', function () {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push({ lat: i * 0.2, lon: i * 0.05 });
  const groups = R.clusterBalanced(pts, 3);
  const sizes = groups.map(function (g) { return g.length; }).sort(function (a, b) { return a - b; });
  assert.deepEqual(sizes, [3, 3, 4]);
  const seen = [];
  groups.forEach(function (g) {
    const sorted = g.slice().sort(function (a, b) { return a - b; });
    assert.deepEqual(g, sorted);
    g.forEach(function (i) { seen.push(i); });
  });
  seen.sort(function (a, b) { return a - b; });
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(R.clusterBalanced(pts, 3), groups);
});

test('k larger than the point count does not invent empty clusters', function () {
  const pts = [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 }];
  const groups = R.clusterBalanced(pts, 5);
  assert.equal(groups.length, 3);
  groups.forEach(function (g) { assert.equal(g.length, 1); });
});

test('nearest neighbor leaves the closest stop first', function () {
  const start = { lat: 0, lon: 0 };
  const stops = [
    { id: 'a', lat: 0, lon: 10 },
    { id: 'b', lat: 0, lon: 1 },
    { id: 'c', lat: 0, lon: 5 }
  ];
  const ordered = R.nearestNeighborOrder(start, stops);
  assert.equal(ordered[0].id, 'b');
});

test('2-opt shortens a line that was entered out of order', function () {
  const start = { lat: 0, lon: 0 };
  const stops = [
    { id: 'A', lat: 5, lon: 0 },
    { id: 'B', lat: 1, lon: 0 },
    { id: 'C', lat: 4, lon: 0 },
    { id: 'D', lat: 2, lon: 0 }
  ];
  const ordered = R.orderRoute(start, stops);
  const dist = R.routeDistanceMeters(start, ordered);
  const bad = R.routeDistanceMeters(start, stops);
  const nn = R.routeDistanceMeters(start, R.nearestNeighborOrder(start, stops));
  assert.ok(dist < bad);
  assert.ok(dist < 600000);
  assert.ok(dist <= nn + 1e-6);
});

test('2-opt beats nearest neighbor on a crossing', function () {
  const start = { lat: 0, lon: 0 };
  const stops = [
    { id: 'P', lat: 0, lon: 1 },
    { id: 'Q', lat: 1, lon: 0 },
    { id: 'R', lat: 1, lon: 1 },
    { id: 'S', lat: 0, lon: 2 }
  ];
  const nnList = R.nearestNeighborOrder(start, stops);
  const nnDist = R.routeDistanceMeters(start, nnList);
  const bestDist = R.routeDistanceMeters(start, R.orderRoute(start, stops));
  assert.ok(nnDist - bestDist > 1000);
});

test('one driver across two days keeps each city together', function () {
  const stops = blob('a', 38.05, -84.5).concat(blob('b', 39.10, -84.5));
  const plan = R.planRoutes({
    stops: stops,
    drivers: [{ id: 'drv-a', name: 'A', startLat: 38.05, startLon: -84.5 }],
    dates: ['2026-10-12', '2026-10-13'],
    maxStopsPerDay: 12
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.routes.length, 2);
  plan.routes.forEach(function (route) {
    const south = route.stops.every(function (s) { return s.lat < 38.5; });
    const north = route.stops.every(function (s) { return s.lat > 38.5; });
    assert.ok(south || north);
  });
});

test('two drivers on one day each get their own city', function () {
  const stops = blob('a', 38.05, -84.5).concat(blob('b', 39.10, -84.5));
  const drivers = [
    { id: 'drv-a', name: 'A', startLat: 38.05, startLon: -84.5 },
    { id: 'drv-b', name: 'B', startLat: 39.10, startLon: -84.5 }
  ];
  const plan = R.planRoutes({
    stops: stops,
    drivers: drivers,
    dates: ['2026-10-12'],
    maxStopsPerDay: 12
  });
  assert.equal(plan.ok, true);
  const seen = [];
  plan.routes.forEach(function (route) {
    route.stops.forEach(function (s) {
      seen.push(s.id);
      if (route.driverId === 'drv-a') assert.ok(s.id.indexOf('a') === 0);
      if (route.driverId === 'drv-b') assert.ok(s.id.indexOf('b') === 0);
    });
  });
  assert.deepEqual(seen.slice().sort(), stops.map(function (s) { return s.id; }).sort());
});

test('capacity rejects an overloaded day and accepts a balanced split', function () {
  const five = [0, 1, 2, 3, 4].map(function (i) {
    return { id: 's' + i, lat: 37 + i * 0.01, lon: -84 };
  });
  const tooMany = R.planRoutes({
    stops: five,
    drivers: [{ id: 'd', name: 'D', startLat: 37, startLon: -84 }],
    dates: ['2026-10-12'],
    maxStopsPerDay: 3
  });
  assert.equal(tooMany.ok, false);

  const ten = [];
  for (let i = 0; i < 10; i++) {
    ten.push({ id: 't' + i, lat: 37 + (i % 5) * 0.02, lon: -84.4 + Math.floor(i / 5) * 0.3 });
  }
  const drivers = [
    { id: 'd1', name: 'One', startLat: 37, startLon: -84.4 },
    { id: 'd2', name: 'Two', startLat: 37, startLon: -84.1 }
  ];
  const ok = R.planRoutes({
    stops: ten,
    drivers: drivers,
    dates: ['2026-10-12', '2026-10-13'],
    maxStopsPerDay: 4
  });
  assert.equal(ok.ok, true);
  ok.routes.forEach(function (route) {
    assert.ok(route.stops.length <= 4);
    assert.ok(route.stops.length > 0);
  });
  const ids = [];
  ok.routes.forEach(function (route) {
    route.stops.forEach(function (s) { ids.push(s.id); });
  });
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
});

test('missing coordinates fail and the same input plans the same order', function () {
  const bad = R.planRoutes({
    stops: [{ id: 'x', address: 'no pin', lat: null, lon: null }],
    drivers: [{ id: 'd', name: 'D', startLat: 1, startLon: 1 }],
    dates: ['2026-10-12'],
    maxStopsPerDay: 12
  });
  assert.equal(bad.ok, false);

  const stops = blob('a', 38.05, -84.5).concat(blob('b', 39.10, -84.5));
  const input = {
    stops: stops,
    drivers: [
      { id: 'drv-a', name: 'A', startLat: 38.05, startLon: -84.5 },
      { id: 'drv-b', name: 'B', startLat: 39.10, startLon: -84.5 }
    ],
    dates: ['2026-10-12', '2026-10-13'],
    maxStopsPerDay: 4
  };
  const first = R.planRoutes(input);
  const second = R.planRoutes(input);
  assert.equal(first.ok, true);
  const idsOf = function (plan) {
    return plan.routes.map(function (route) {
      return route.stops.map(function (s) { return s.id; });
    });
  };
  assert.deepEqual(idsOf(first), idsOf(second));
});

test('parseStopList accepts quoted CSV, pool maps, plain lines, and Landglide headers', function () {
  const quoted = 'name,phone,address,lat,lon,notes\nAnn,502-555-0100,"12 Oak St, Richmond, KY",37.7,-84.2,Dog\n';
  const quotedStops = R.parseStopList(quoted);
  assert.equal(quotedStops.length, 1);
  assert.equal(quotedStops[0].name, 'Ann');
  assert.equal(quotedStops[0].phone, '502-555-0100');
  assert.equal(quotedStops[0].address, '12 Oak St, Richmond, KY');
  assert.equal(quotedStops[0].lat, 37.7);
  assert.equal(quotedStops[0].notes, 'Dog');
  assert.equal(Object.prototype.hasOwnProperty.call(quotedStops[0], 'has_pool'), false);

  const poolHeader = 'lat,lon,address,has_pool\n37.1,-84.2,"12 Oak, KY",yes\n';
  const poolHeaderStops = R.parseStopList(poolHeader);
  assert.equal(poolHeaderStops.length, 1);
  assert.equal(poolHeaderStops[0].address, '12 Oak, KY');
  assert.equal(poolHeaderStops[0].lat, 37.1);
  assert.equal(poolHeaderStops[0].lon, -84.2);
  assert.equal(poolHeaderStops[0].has_pool, undefined);

  const poolRaw = '37.73,-84.29,"12 Oak St, Richmond, KY",yes\n37.75,-84.31,12 Oak St, Richmond, KY,yes\n';
  const poolStops = R.parseStopList(poolRaw);
  assert.equal(poolStops.length, 2);
  assert.equal(poolStops[0].address, '12 Oak St, Richmond, KY');
  assert.equal(poolStops[0].lat, 37.73);
  assert.equal(poolStops[1].address, '12 Oak St, Richmond, KY');
  assert.equal(poolStops[1].lat, 37.75);
  assert.equal(poolStops[1].has_pool, undefined);

  const lines = '123 Main St, Richmond, KY\n456 Oak Ave, Lexington, KY\n';
  const lineStops = R.parseStopList(lines);
  assert.equal(lineStops.length, 2);
  assert.equal(lineStops[0].address, '123 Main St, Richmond, KY');
  assert.equal(lineStops[0].lat, null);
  assert.equal(lineStops[1].address, '456 Oak Ave, Lexington, KY');

  const street = R.parseStopList('123 Main St');
  assert.equal(street.length, 1);
  assert.equal(street[0].address, '123 Main St');
  assert.equal(street[0].lat, null);

  const land = 'Owner,Address,Latitude,Longitude,Note\nJane Doe,"100 Main St, Richmond, KY",37.74,-84.29,Gate 1234\n';
  const landStops = R.parseStopList(land);
  assert.equal(landStops[0].name, 'Jane Doe');
  assert.equal(landStops[0].address, '100 Main St, Richmond, KY');
  assert.equal(landStops[0].lat, 37.74);
  assert.equal(landStops[0].lon, -84.29);
  assert.equal(landStops[0].notes, 'Gate 1234');
  assert.equal(landStops[0].phone, '');
  assert.equal(landStops[0].has_pool, undefined);
});

test('enumerateDates uses local weekdays and skips the weekend', function () {
  assert.equal(new Date(2026, 9, 12).getDay(), 1);
  assert.deepEqual(
    R.enumerateDates('2026-10-12', '2026-10-18', [1, 2, 3, 4, 5]),
    ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']
  );
});

test('map links use Apple for one stop and cap Google waypoints', function () {
  assert.equal(
    R.navigateUrl(37.7, -84.2, true),
    'https://maps.apple.com/?daddr=37.7,-84.2&dirflg=d'
  );
  assert.ok(R.navigateUrl(37.7, -84.2, false).indexOf('google.com/maps/dir/') !== -1);

  const stops = [
    { lat: 1, lon: 1 },
    { lat: 2, lon: 2 },
    { lat: 3, lon: 3 },
    { lat: 4, lon: 4 },
    { lat: 5, lon: 5 }
  ];
  const route = R.googleMapsRouteUrl(stops, 3);
  assert.equal(route.truncated, true);
  assert.equal(route.included, 4);
  const waypoints = new URL(route.url).searchParams.get('waypoints');
  assert.equal(waypoints.split('|').length, 3);
});
