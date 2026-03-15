# Mile-Tracker

Mobile-first PWA to track personal and business mileage for two drivers across a full year.

## Features

- Multi-page app with top navigation (`Home`, `Entries`, `Summary`, `Settings`)
- Track daily odometer, personal miles, and business miles per driver
- Year-end summary per driver:
	- January starting miles
	- December ending miles
	- Total personal miles
	- Total business miles
	- Estimated tax credit
- Combined tax credit total for both drivers
- Configurable summary year for year-by-year tax reporting
- Configurable tax credit rate (defaults to `0.07` USD/mile)
- Offline support via service worker + web app manifest

## Run Locally

Because this is a PWA, run it from a local web server (not directly via `file://`).

Example with Python:

```bash
python3 -m http.server 8080
```

Then open:

`http://localhost:8080`

## Data Storage

All data is saved locally in browser storage (`localStorage`) under key `mileTrackerDataV1`.
