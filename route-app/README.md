# Driver routes

Mobile web app for splitting stops across drivers and days, ordering each drive, and marking stops done. It runs as a Google Apps Script web app and stores data in Google Sheets. Open the HTML file from a local web server to try the same screens in this browser before you deploy.

## What you get

- **Plan:** paste addresses (one per line) or a CSV. Optional columns: `lat`, `lon`, `name`, `phone`, `notes`. Pool Maps rows (`lat, lon, address`) and Landglide-style headers work. Pick a date range, weekdays, drivers, and a max stops per day. The app clusters stops geographically, then orders each route from the driver’s start address.
- **Drive:** pick a driver and a date (today by default). Each stop has Navigate (Apple Maps on iPhone and iPad, Google Maps otherwise) and Done. Done stores a timestamp. “Open whole route in Google Maps” includes waypoints up to the device limit.
- **Drivers:** name, phone, start address, optional coordinates, active flag.

`RouteStops` keeps empty `status` and `notes` columns for a later lead-tracking pass. This version shows notes and does not edit status.

## Files to paste into Apps Script

Create a new Apps Script project, or add these files to an existing one. The file **names** must match.

| Apps Script file | Type | Contents |
| --- | --- | --- |
| `RouteApp` | Script (`.gs`) | `RouteApp.gs` |
| `RouteAppUI` | HTML | `RouteAppUI.html` |
| `routing` | HTML | `routing.js` with **no** extra HTML |

`doGet` loads `RouteAppUI` and replaces `<script src="routing.js"></script>` with the `routing` HTML file. That third file is the JavaScript only.

Optional script property: `SPREADSHEET_ID`. When it is empty, the script uses the spreadsheet bound to the project, or creates one named “Driver Routes”.

Sheet tabs (created automatically): `Drivers`, `Routes`, `RouteStops`, `Geocode`.

## Deploy

1. In Apps Script, click **Deploy → New deployment**.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone with the link** (or your domain, if you prefer).
5. Copy the web app URL and open it on the phone you will use in the truck.

`Maps.newGeocoder()` is the built-in Maps service. You do not enable an advanced Google service for it.

### iPhone home screen

1. Open the web app URL in Safari.
2. Share → **Add to Home Screen**.
3. Open **Routes** from the icon. The Drive tab uses large tap targets and Apple Maps links.

## Local preview

From this folder:

```bash
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/RouteAppUI.html`. Without `google.script.run`, saves stay in `localStorage` (`routeApp.v1`) and geocoding is simulated around Richmond, KY. Deploy the web app when you want real Maps geocoding and a Google Sheet.

Run the routing tests from the repo root:

```bash
node --test route-app/routing.test.js
```

## Limits

- **Geocoding quota:** about 1,000 addresses per day on a personal Google account, and about 10,000 per day on Workspace. The Locate and Build buttons send about 15 new addresses per call. `OVER_QUERY_LIMIT` is not cached, so a later run can retry those addresses. Results and “no results” are cached on the `Geocode` tab.
- **Script runtime:** a web app execution often stops around 6 minutes, and some accounts stop around 30 seconds. Large pastes are split across calls so one run stays smaller.
- **One save at a time:** the script lock waits up to 20 seconds. A second save in that window returns “Another save is in progress. Try again.”
- **Google Maps links:** the whole-route link sends at most 3 waypoints on a phone (4 stops, because the last point is the destination) and 9 waypoints on a wide desktop. Longer days open the first stops and the app says the rest were left out.
- **Balance:** if the stops cannot fit the chosen drivers, dates, and max-per-day, Build routes shows the reason and does not save.
