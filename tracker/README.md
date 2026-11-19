
# Brace Tracker

An automated cryptocurrency forecast validation
and statistical analysis tool developed for
the UBC Hackathon 2026.

## Features

- Automated historical data collection
- Backend API integration
- Duplicate record removal
- Local JSON data storage
- 1-sigma and 2-sigma hit rate analysis
- UTC timestamp tracking
- Automated statistical reporting

## Supported Assets

- SOL
- BTC
- ETH
- XRP
- ZEC

## Technology Stack

- Python
- REST API
- Cloudflare Workers
- JSON

## Usage

Run these from any folder. Data is always saved to
`tracker/data/` and reports to `tracker/reports/`.

Start data collection (repeats every 5 minutes; after the first full pull it only asks for new rows):

    python tracker/tracker.py

Collect once and exit (for cron or a quick refresh;
exit code 1 if any asset failed):

    python tracker/tracker.py --once

Run statistical analysis:

    python tracker/analytics.py

Generate a validation report:

    python tracker/report.py

Run the tests (no network needed):

    python tracker/test_tracker.py

## Methodology

The tracker compares forecast intervals
against subsequent observed spot prices.

The preliminary validation model uses
annualized volatility and lognormal price bands.

## Project Status

Data collection is operational.
Final validation results and methodology
confirmation are pending.

## Project

Brace - UBC Hackathon 2026
