# Sprinter van conversion

Year-round van build with fridge, diesel heater, ventilation, and electronics. Charges from solar on stops and from the alternator while driving.

## Loads

| Load | Power | Hours/day |
|---|---|---|
| 12V compressor fridge | 60 W | 24 |
| LED ceiling + accent lights | 25 W | 5 |
| Roof vent fan (Maxxair) | 15 W | 6 |
| USB / phone charging | 30 W | 2 |
| Water pump | 50 W | 0.2 |
| Diesel heater (electronics) | 30 W | 4 (winter) |

## Prompt

> *"Design a 12V electrical system for a Sprinter van conversion. Loads: 12V fridge 60W 24/7, LED lights 25W for 5h/day, Maxxair roof fan 15W for 6h/day, USB at 30W for 2h, water pump 50W for 12 min/day, and diesel heater electronics 30W for 4h/day. Two days of autonomy, 80% DoD, 100 Ah LiFePO4 batteries. Then add a 600W solar array and a 50A DC-DC alternator charger — how long to recharge from 20% to 100%?"*

## Tools Claude calls

1. `calculate_power_budget`
2. `calculate_battery_bank`
3. `calculate_solar_size`
4. `calculate_charging_time` (twice — solar and alternator)
5. `generate_wiring_diagram`

## Expected numbers

```
Daily energy:    1,845 Wh/day   (153.8 Ah/day @ 12V)
Peak load:         210 W        (17.5 A)

Required bank:   4,613 Wh / 384.4 Ah  (2 days × 80% DoD)
Recommended:     4 × 100 Ah / 12.8 V LiFePO4 in parallel (4P)
Total / usable:  400 Ah / 5,120 Wh → 4,096 Wh usable

Solar (PSH 4 summer / 1.5 winter):
  Summer:        543 W adjusted → 600 W array (3 × 200 W)
  Winter:      1,447 W adjusted → supplement with alternator

Charging from 20% → 100% (400 Ah @ 12.8 V):
  Solar 600 W (≈ 47 A):    bulk 5.1 h + absorption 3.4 h ≈ 8.5 h
  Alternator 50 A:         bulk 4.8 h + absorption 3.2 h ≈ 8 h
  Combined ~97 A:          bulk 2.5 h + absorption 1.7 h ≈ 4 h
```

## Notes

- DC current at this scale (peak ~17 A) keeps cabling reasonable — a high-wattage inverter would push the calculator to flag a 24V upgrade.
- The diagram includes auto-generated shunt, main switch, and low-voltage cutoff between the bank and load bus.
