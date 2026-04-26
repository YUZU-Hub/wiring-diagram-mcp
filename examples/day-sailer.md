# Day sailer (minimal)

The other end of the spectrum: a 25 ft day sailer with no fridge, no inverter, just instruments and a phone. The MCP scales down — minimal prompt, minimal hardware.

## Loads

| Load | Power | Hours/day |
|---|---|---|
| VHF radio (standby) | 5 W | 8 |
| LED nav lights | 10 W | 2 |
| GPS / chartplotter | 10 W | 8 |
| Phone / GoPro charging | 10 W | 4 |

## Prompt

> *"Tiny 12V system for a 25 ft day sailer. Loads: VHF on standby 5W for 8h, LED nav lights 10W for 2h, GPS 10W for 8h, phone charging 10W for 4h. One day of autonomy, AGM battery (50% DoD), 100 Ah single battery. Add a small solar panel for trickle charging."*

## Tools Claude calls

1. `calculate_power_budget`
2. `calculate_battery_bank`
3. `calculate_solar_size`

## Expected numbers

```
Daily energy:      180 Wh/day   (15 Ah/day @ 12V)
Peak load:          35 W        (2.9 A)

Required bank:     360 Wh / 30 Ah  (1 day × 50% DoD AGM)
Recommended:       1 × 100 Ah / 12 V AGM (standalone)
Usable:            600 Wh
                   ≈ 3.3 days of autonomy

Solar (4 PSH summer):
  Required:         45 W raw / 53 W adjusted
  Recommended:      1 × 100 W panel  (overkill — covers any season)
```

## Wire gauge for the bus

> *"What gauge from battery to a small fuse panel, 1m run, max 5A combined?"*

```
Recommended: 0.75 mm² (18 AWG) — 7 A ampacity, 1.93% drop
Fuse: 7.5 A blade
```
