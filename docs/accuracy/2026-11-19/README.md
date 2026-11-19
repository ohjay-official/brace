# Accuracy snapshot, Nov 19, 2026

The relayer's `/history` rows for all five assets, saved on Nov 19; the last row is from 05:56 UTC (06:56 Lagos), so the accuracy numbers can be rechecked even when the live feed is down.

- `SOL.json.gz` … `ZEC.json.gz`: the raw `/history?asset=X` responses, gzipped (rows from Nov 17 03:59 to Nov 19 05:56 UTC).
- `tracker-report.txt`: the output of Alchin's tracker (`tracker/report.py`) on these files.

## Reproduce

```bash
mkdir -p /tmp/brace-acc && cp -r tracker /tmp/brace-acc/ && mkdir -p /tmp/brace-acc/tracker/data
for a in SOL BTC ETH XRP ZEC; do gunzip -c docs/accuracy/2026-11-19/$a.json.gz > /tmp/brace-acc/tracker/data/$a.json; done
python3 /tmp/brace-acc/tracker/analytics.py
```

## 1 hour results on this snapshot

| Asset | 1σ inside | 2σ inside |
|---|---|---|
| SOL | 1,461 / 1,836 (79.6%) | 1,760 / 1,836 (95.9%) |
| BTC | 1,355 / 1,947 (69.6%) | 1,815 / 1,947 (93.2%) |
| ETH | 1,319 / 1,699 (77.6%) | 1,659 / 1,699 (97.6%) |
| XRP | 1,407 / 1,680 (83.8%) | 1,662 / 1,680 (98.9%) |
| ZEC | 1,460 / 1,855 (78.7%) | 1,790 / 1,855 (96.5%) |
| All | 7,002 / 9,017 (77.65%) | 8,686 / 9,017 (96.33%) |

A perfectly calibrated band holds about 68% at 1σ and 95% at 2σ. The headline 79.47% (8,303 forecasts) came from an earlier pull at 03:22 UTC the same day; about 2.5 more hours of data move it to 77.65%. Forecasts are posted every minute, so consecutive one hour windows overlap, and the record covers only about two days.
