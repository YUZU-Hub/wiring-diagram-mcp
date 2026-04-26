# Sailboat refit · 30 ft cruising

A typical refit: existing 12V system with house + start, lithium upgrade, two days of autonomy at anchor before the engine or solar has to do something.

## Loads

| Load | Power | Hours/day |
|---|---|---|
| Compressor fridge | 60 W | 24 |
| LED nav + cabin lights | 25 W | 4 |
| USB chargers (phones, headlamp) | 30 W | 2 |
| Inverter for laptop / tools | 90 W | 3 |
| Water pump | 50 W | 0.5 |
| VHF + instruments standby | 10 W | 24 |

## Prompt

> *"I'm refitting a 30 ft cruising sailboat with a LiFePO4 house bank. Loads: 12V compressor fridge 60W 24/7, LED nav and cabin lights 25W for 4h/day, USB chargers 30W for 2h/day, an inverter running a laptop at 90W for 3h/day, water pump 50W for 30 min/day, and VHF and instruments 10W on standby 24/7. I want 2 days of autonomy without charging, 80% DoD, 12V system, using 100 Ah / 12.8 V LiFePO4 batteries. Then size the solar for summer cruising in the Mediterranean."*

## Tools Claude calls

1. `calculate_power_budget` → daily Wh, peak W
2. `calculate_battery_bank` → required capacity, configuration
3. `calculate_solar_size` → panel wattage for the location

## Expected numbers

```
Daily energy:    2,135 Wh/day   (177.9 Ah/day @ 12V)
Peak load:         265 W        (22 A)
Average draw:       89 W

Required bank:   5,338 Wh / 444.8 Ah  (2 days × 80% DoD)
Recommended:     5 × 100 Ah / 12.8 V LiFePO4 in parallel (5P)
Total / usable:  500 Ah / 6,400 Wh → 5,120 Wh usable
                 ≈ 2.4 days of autonomy

Solar (Med summer, 5 PSH):
  Required:      427 W raw / 502 W adjusted for losses
  Recommended:   3 × 200 W panels = 600 W
```

## Follow-up wire gauge

> *"What gauge do I need for the main bank-to-busbar run, 1.5 m one-way at 22A peak?"*

`calculate_wire_gauge` returns:

```
Recommended: 4 mm² (12 AWG) — 25 A ampacity
Voltage drop: 0.29 V (2.45%)  ✓
Fuse: 30 A blade fuse
```
