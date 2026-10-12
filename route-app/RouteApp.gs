/**
 * Driver route planner — standalone Google Apps Script web app.
 *
 * Files in the Apps Script project:
 *   RouteApp.gs   this file
 *   RouteAppUI    HTML file (contents of RouteAppUI.html)
 *   routing       HTML file whose contents are routing.js (no markup)
 *
 * Data lives on sheet tabs Drivers, Routes, RouteStops, and Geocode.
 * Set script property SPREADSHEET_ID to use an existing spreadsheet.
 * Otherwise a container-bound sheet is used, or a new "Driver Routes" file is created.
 */

var SHEET_DRIVERS = 'Drivers';
var SHEET_ROUTES = 'Routes';
var SHEET_STOPS = 'RouteStops';
var SHEET_GEOCODE = 'Geocode';
var PROP_SS = 'SPREADSHEET_ID';

var HEADERS = {
  Drivers: ['id', 'name', 'phone', 'startAddress', 'startLat', 'startLon', 'active', 'updatedAt'],
  Routes: ['id', 'date', 'driverId', 'driverName', 'stopCount', 'updatedAt'],
  RouteStops: ['id', 'routeId', 'date', 'driverId', 'seq', 'address', 'lat', 'lon', 'name', 'phone', 'notes', 'status', 'doneAt', 'updatedAt'],
  Geocode: ['addressKey', 'address', 'lat', 'lon', 'status', 'updatedAt']
};

function doGet() {
  var html = HtmlService.createHtmlOutputFromFile('RouteAppUI').getContent();
  var routing = HtmlService.createHtmlOutputFromFile('routing').getContent();
  routing = routing.replace(/<\/script/gi, '<\\/script');
  html = html.replace('<script src="routing.js"></script>', '<script>\n' + routing + '\n</script>');
  return HtmlService.createHtmlOutput(html)
    .setTitle('Routes')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getInitialData() {
  return withLock_(function () {
    return getInitialData_();
  });
}

function saveDriver(payload) {
  return withLock_(function () {
    return saveDriver_(payload || {});
  });
}

function deleteDriver(driverId) {
  return withLock_(function () {
    return deleteDriver_(driverId);
  });
}

function geocodeAddresses(addresses) {
  return withLock_(function () {
    return geocodeAddresses_(addresses || []);
  });
}

function savePlan(payload) {
  return withLock_(function () {
    return savePlan_(payload || {});
  });
}

function setStopDone(stopId, done) {
  return withLock_(function () {
    return setStopDone_(stopId, done);
  });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { ok: false, error: 'Another save is in progress. Try again.' };
  }
  try {
    return fn();
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SS);
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  var active = null;
  try {
    active = SpreadsheetApp.getActiveSpreadsheet();
  } catch (ignore) {
    active = null;
  }
  if (active) {
    props.setProperty(PROP_SS, active.getId());
    return active;
  }
  var created = SpreadsheetApp.create('Driver Routes');
  props.setProperty(PROP_SS, created.getId());
  return created;
}

function ensureSheets_(ss) {
  ensureOne_(ss, SHEET_DRIVERS, HEADERS.Drivers, [1, 8]);
  ensureOne_(ss, SHEET_ROUTES, HEADERS.Routes, [1, 2, 3, 6]);
  ensureOne_(ss, SHEET_STOPS, HEADERS.RouteStops, [1, 2, 3, 4, 13, 14]);
  ensureOne_(ss, SHEET_GEOCODE, HEADERS.Geocode, [1, 6]);
}

function ensureOne_(ss, name, headers, textCols) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  var width = headers.length;
  var first = sheet.getRange(1, 1, 1, width).getValues()[0];
  var empty = true;
  var i;
  for (i = 0; i < width; i++) {
    if (String(first[i] || '') !== '') {
      empty = false;
      break;
    }
  }
  if (empty) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  var max = Math.max(sheet.getMaxRows(), 1);
  for (i = 0; i < textCols.length; i++) {
    sheet.getRange(1, textCols[i], max, 1).setNumberFormat('@');
  }
  return sheet;
}

function readObjects_(sheet) {
  var last = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (last < 2 || lastCol < 1) {
    return [];
  }
  var values = sheet.getRange(1, 1, last, lastCol).getValues();
  var headers = [];
  var c;
  for (c = 0; c < values[0].length; c++) {
    headers.push(String(values[0][c] || ''));
  }
  var out = [];
  var r;
  for (r = 1; r < values.length; r++) {
    var row = values[r];
    var blank = true;
    for (c = 0; c < row.length; c++) {
      if (row[c] !== '' && row[c] !== null) {
        blank = false;
        break;
      }
    }
    if (blank) {
      continue;
    }
    var obj = { _row: r + 1 };
    for (c = 0; c < headers.length; c++) {
      if (headers[c]) {
        obj[headers[c]] = row[c];
      }
    }
    out.push(obj);
  }
  return out;
}

function scriptTz_() {
  return Session.getScriptTimeZone() || 'America/New_York';
}

function today_(tz) {
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function formatSheetDate_(value, tz) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  var s = String(value || '').trim();
  var match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : s;
}

function iso_(value) {
  if (value === '' || value === null || value === undefined) {
    return '';
  }
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value);
}

function numOrNull_(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  var n = Number(value);
  return isFinite(n) ? n : null;
}

function isActive_(value) {
  if (value === false) {
    return false;
  }
  var s = String(value).toLowerCase();
  if (s === 'false' || s === 'no' || s === '0') {
    return false;
  }
  return true;
}

function newId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function nowIso_() {
  return new Date().toISOString();
}

function addressKey_(address) {
  return String(address || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getInitialData_() {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  var tz = scriptTz_();
  var drivers = readObjects_(ss.getSheetByName(SHEET_DRIVERS));
  var routes = readObjects_(ss.getSheetByName(SHEET_ROUTES));
  var stops = readObjects_(ss.getSheetByName(SHEET_STOPS));
  return {
    ok: true,
    drivers: mapDrivers_(drivers),
    routes: mapRoutes_(routes, tz),
    stops: mapStops_(stops, tz),
    today: today_(tz),
    timeZone: tz,
    spreadsheetUrl: ss.getUrl()
  };
}

function mapDrivers_(rows) {
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var d = rows[i];
    if (!d.id) {
      continue;
    }
    out.push({
      id: String(d.id),
      name: String(d.name || ''),
      phone: String(d.phone || ''),
      startAddress: String(d.startAddress || ''),
      startLat: numOrNull_(d.startLat),
      startLon: numOrNull_(d.startLon),
      active: isActive_(d.active)
    });
  }
  return out;
}

function mapRoutes_(rows, tz) {
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r.id) {
      continue;
    }
    out.push({
      id: String(r.id),
      date: formatSheetDate_(r.date, tz),
      driverId: String(r.driverId || ''),
      driverName: String(r.driverName || ''),
      stopCount: Number(r.stopCount || 0)
    });
  }
  return out;
}

function mapStops_(rows, tz) {
  var out = [];
  var i;
  for (i = 0; i < rows.length; i++) {
    var s = rows[i];
    if (!s.id) {
      continue;
    }
    out.push({
      id: String(s.id),
      routeId: String(s.routeId || ''),
      date: formatSheetDate_(s.date, tz),
      driverId: String(s.driverId || ''),
      seq: Number(s.seq || 0),
      address: String(s.address || ''),
      lat: numOrNull_(s.lat),
      lon: numOrNull_(s.lon),
      name: String(s.name || ''),
      phone: String(s.phone || ''),
      notes: String(s.notes || ''),
      status: String(s.status || ''),
      doneAt: iso_(s.doneAt)
    });
  }
  return out;
}

function saveDriver_(payload) {
  var name = String(payload.name || '').trim();
  if (!name) {
    return { ok: false, error: 'Driver name is required.' };
  }
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  var sheet = ss.getSheetByName(SHEET_DRIVERS);
  var rows = readObjects_(sheet);
  var id = String(payload.id || '').trim();
  var existing = null;
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) {
      existing = rows[i];
      break;
    }
  }
  var address = String(payload.startAddress || '').trim();
  var lat = numOrNull_(payload.startLat);
  var lon = numOrNull_(payload.startLon);
  var warning = '';
  if (address && (lat === null || lon === null)) {
    var geo = geocodeOne_(ss, address);
    if (geo.quota) {
      return { ok: false, error: geo.error || 'Geocoding quota reached. Try again later.' };
    }
    if (geo.ok) {
      lat = geo.lat;
      lon = geo.lon;
    } else {
      warning = 'Saved the driver, but the start address could not be located.';
    }
  }
  var record = [
    id || newId_('DRV-'),
    name,
    String(payload.phone || '').trim(),
    address,
    lat === null ? '' : lat,
    lon === null ? '' : lon,
    payload.active === false ? false : true,
    nowIso_()
  ];
  if (existing) {
    record[0] = String(existing.id);
    sheet.getRange(existing._row, 1, 1, HEADERS.Drivers.length).setValues([record]);
  } else {
    sheet.appendRow(record);
  }
  var data = getInitialData_();
  if (warning) {
    data.warning = warning;
  }
  return data;
}

function deleteDriver_(driverId) {
  var id = String(driverId || '').trim();
  if (!id) {
    return { ok: false, error: 'Driver id is required.' };
  }
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  var sheet = ss.getSheetByName(SHEET_DRIVERS);
  var rows = readObjects_(sheet);
  var found = null;
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) {
      found = rows[i];
      break;
    }
  }
  if (!found) {
    return { ok: false, error: 'Driver not found.' };
  }
  sheet.deleteRow(found._row);
  return getInitialData_();
}

function geocodeAddresses_(addresses) {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  var results = [];
  var i;
  for (i = 0; i < addresses.length; i++) {
    var one = geocodeOne_(ss, addresses[i]);
    if (one.quota) {
      return {
        ok: false,
        error: one.error || 'Geocoding quota reached. Try again later.',
        results: results
      };
    }
    results.push({
      address: one.address,
      ok: !!one.ok,
      status: one.status || '',
      lat: one.lat == null ? null : one.lat,
      lon: one.lon == null ? null : one.lon,
      cached: !!one.cached,
      error: one.error || ''
    });
  }
  return { ok: true, results: results };
}

function geocodeOne_(ss, address) {
  var raw = String(address || '').trim();
  var key = addressKey_(raw);
  if (!key) {
    return { address: raw, ok: false, status: 'fail', error: 'Empty address' };
  }
  var cached = lookupGeocode_(ss, key);
  if (cached) {
    return {
      address: raw,
      ok: cached.status === 'ok',
      status: cached.status,
      lat: cached.lat,
      lon: cached.lon,
      cached: true
    };
  }
  var geo;
  try {
    geo = Maps.newGeocoder().setRegion('us').geocode(raw);
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    if (/quota|limit|too many/i.test(msg)) {
      return { address: raw, ok: false, quota: true, error: 'Geocoding quota reached. Try again later.' };
    }
    return { address: raw, ok: false, status: 'fail', error: msg };
  }
  var status = geo && geo.status ? String(geo.status) : 'UNKNOWN_ERROR';
  if (status === 'OVER_QUERY_LIMIT') {
    return { address: raw, ok: false, quota: true, error: 'Geocoding quota reached. Try again later.' };
  }
  if (status === 'OK' && geo.results && geo.results.length && geo.results[0].geometry) {
    var loc = geo.results[0].geometry.location;
    writeGeocode_(ss, key, raw, loc.lat, loc.lng, 'ok');
    return { address: raw, ok: true, status: 'ok', lat: loc.lat, lon: loc.lng, cached: false };
  }
  if (status === 'ZERO_RESULTS') {
    writeGeocode_(ss, key, raw, '', '', 'fail');
    return { address: raw, ok: false, status: 'fail', error: 'No results for ' + raw };
  }
  return { address: raw, ok: false, status: status, error: status };
}

function lookupGeocode_(ss, key) {
  var rows = readObjects_(ss.getSheetByName(SHEET_GEOCODE));
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i].addressKey) === key) {
      return {
        status: String(rows[i].status || ''),
        lat: numOrNull_(rows[i].lat),
        lon: numOrNull_(rows[i].lon)
      };
    }
  }
  return null;
}

function writeGeocode_(ss, key, address, lat, lon, status) {
  var sheet = ss.getSheetByName(SHEET_GEOCODE);
  var rows = readObjects_(sheet);
  var record = [key, address, lat === '' ? '' : lat, lon === '' ? '' : lon, status, nowIso_()];
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i].addressKey) === key) {
      sheet.getRange(rows[i]._row, 1, 1, HEADERS.Geocode.length).setValues([record]);
      return;
    }
  }
  sheet.appendRow(record);
}

function savePlan_(payload) {
  if (!payload.routes || !payload.routes.length && !(payload.dates && payload.dates.length)) {
    if (!payload.routes) {
      return { ok: false, error: 'Nothing to save.' };
    }
  }
  var routes = payload.routes || [];
  if (Object.prototype.toString.call(routes) !== '[object Array]') {
    return { ok: false, error: 'Routes must be a list.' };
  }
  var dateSet = {};
  var dates = payload.dates || [];
  var i;
  for (i = 0; i < dates.length; i++) {
    if (dates[i]) {
      dateSet[String(dates[i])] = true;
    }
  }
  for (i = 0; i < routes.length; i++) {
    if (routes[i] && routes[i].date) {
      dateSet[String(routes[i].date)] = true;
    }
  }
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  var tz = scriptTz_();
  var routeSheet = ss.getSheetByName(SHEET_ROUTES);
  var stopSheet = ss.getSheetByName(SHEET_STOPS);
  var existingRoutes = readObjects_(routeSheet);
  var existingStops = readObjects_(stopSheet);
  var dropRoute = {};
  for (i = 0; i < existingRoutes.length; i++) {
    var routeDate = formatSheetDate_(existingRoutes[i].date, tz);
    if (dateSet[routeDate]) {
      dropRoute[String(existingRoutes[i].id)] = true;
    }
  }
  deleteRowsWhere_(stopSheet, existingStops, function (row) {
    var d = formatSheetDate_(row.date, tz);
    return !!dateSet[d] || !!dropRoute[String(row.routeId)];
  });
  deleteRowsWhere_(routeSheet, existingRoutes, function (row) {
    return !!dateSet[formatSheetDate_(row.date, tz)];
  });
  var now = nowIso_();
  var routeRows = [];
  var stopRows = [];
  for (i = 0; i < routes.length; i++) {
    var route = routes[i] || {};
    var stops = route.stops || [];
    if (!stops.length) {
      continue;
    }
    var routeId = newId_('RTE-');
    routeRows.push([
      routeId,
      String(route.date || ''),
      String(route.driverId || ''),
      String(route.driverName || ''),
      stops.length,
      now
    ]);
    var s;
    for (s = 0; s < stops.length; s++) {
      var stop = stops[s] || {};
      var lat = numOrNull_(stop.lat);
      var lon = numOrNull_(stop.lon);
      stopRows.push([
        newId_('STP-'),
        routeId,
        String(route.date || ''),
        String(route.driverId || ''),
        s + 1,
        String(stop.address || ''),
        lat === null ? '' : lat,
        lon === null ? '' : lon,
        String(stop.name || ''),
        String(stop.phone || ''),
        String(stop.notes || ''),
        String(stop.status || ''),
        '',
        now
      ]);
    }
  }
  if (routeRows.length) {
    routeSheet.getRange(routeSheet.getLastRow() + 1, 1, routeRows.length, HEADERS.Routes.length).setValues(routeRows);
  }
  if (stopRows.length) {
    stopSheet.getRange(stopSheet.getLastRow() + 1, 1, stopRows.length, HEADERS.RouteStops.length).setValues(stopRows);
  }
  return getInitialData_();
}

function deleteRowsWhere_(sheet, objects, pred) {
  var rows = [];
  var i;
  for (i = 0; i < objects.length; i++) {
    if (pred(objects[i])) {
      rows.push(objects[i]._row);
    }
  }
  rows.sort(function (a, b) {
    return b - a;
  });
  for (i = 0; i < rows.length; i++) {
    sheet.deleteRow(rows[i]);
  }
}

function setStopDone_(stopId, done) {
  var id = String(stopId || '').trim();
  if (!id) {
    return { ok: false, error: 'Stop id is required.' };
  }
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  var sheet = ss.getSheetByName(SHEET_STOPS);
  var rows = readObjects_(sheet);
  var found = null;
  var i;
  for (i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === id) {
      found = rows[i];
      break;
    }
  }
  if (!found) {
    return { ok: false, error: 'Stop not found.' };
  }
  var doneCol = HEADERS.RouteStops.indexOf('doneAt') + 1;
  var updatedCol = HEADERS.RouteStops.indexOf('updatedAt') + 1;
  var now = nowIso_();
  sheet.getRange(found._row, doneCol).setValue(done ? now : '');
  sheet.getRange(found._row, updatedCol).setValue(now);
  return getInitialData_();
}
