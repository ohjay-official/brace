
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

Start data collection:

    python tracker.py

Run statistical analysis:

    python analytics.py

Generate a validation report:

    python report.py

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
