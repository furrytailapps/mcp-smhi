# Verified Use Cases

Historical observation queries tested across 5 construction-relevant use cases and 3 geographic locations (Mora 2062, Vasteras 1980, Halmstad 1380).

## Use Case 1: Winter Length Analysis

**Human question:** "Hur langa har vintrarna varit runt Mora senaste 10 aren?"

**Agent query:**

```json
{
  "dataType": "meteorological",
  "kommun": "2062",
  "parameter": "temperature",
  "period": "corrected-archive",
  "startDate": "2015-01-01",
  "endDate": "2025-01-01"
}
```

**Results:** 87,193 raw observations -> 523 weekly aggregates with min/max/avg temperatures.

**Agent analysis:** Count weeks where avg temp < 0C to determine winter length per year.

## Use Case 2: Autumn Precipitation Planning

**Human question:** "Hur mycket nederbord kommer det i Oktober-November runt Vasteras?"

**Agent query:**

```json
{
  "dataType": "meteorological",
  "kommun": "1980",
  "parameter": "precipitation",
  "period": "corrected-archive",
  "startDate": "2020-10-01",
  "endDate": "2024-11-30"
}
```

**Results:** 218 weekly aggregates covering 4 autumn seasons.

**Agent analysis:** Sum weekly avg precipitation for Oct-Nov periods across years.

## Use Case 3: Heavy Precipitation Risk

**Human question:** "Hur stor risk ar det for kraftig nederbord i April i Halmstad?"

**Agent query:**

```json
{
  "dataType": "meteorological",
  "kommun": "1380",
  "parameter": "precipitation",
  "period": "corrected-archive",
  "startDate": "2019-04-01",
  "endDate": "2024-04-30"
}
```

**Results:** 266 weekly aggregates covering 5 April periods.

**Agent analysis:** Analyze max precipitation values and frequency of high-precip weeks.

## Use Case 4: Wind Conditions for Crane Work

**Human question:** "Hur ofta blaser det for mycket for kranlyftar i Mora?"

**Agent query:**

```json
{
  "dataType": "meteorological",
  "kommun": "2062",
  "parameter": "wind_speed",
  "period": "corrected-archive",
  "startDate": "2023-01-01",
  "endDate": "2024-12-31"
}
```

**Results:** 106 weekly aggregates with min/max/avg wind speeds.

**Agent analysis:** Count weeks where max wind > 12 m/s (typical crane limit).

## Use Case 5: Water Level for Excavation

**Human question:** "Hur varierar vattennivan i narheten av Mora under aret?"

**Agent query:**

```json
{
  "dataType": "hydrological",
  "kommun": "2062",
  "parameter": "water_level",
  "period": "corrected-archive",
  "startDate": "2020-01-01",
  "endDate": "2024-12-31"
}
```

**Results:** 262 weekly aggregates from nearest hydrological station (SKATTUNGEN).

**Agent analysis:** Identify seasonal patterns and peak levels for excavation timing.

## Test Matrix Summary

| Use Case         | Mora (2062)      | Vasteras (1980)     | Halmstad (1380)  |
| ---------------- | ---------------- | ------------------- | ---------------- |
| 1. Winter temp   | Mora A (523)     | Vasteras (520)      | Torup A (521)    |
| 2. Autumn precip | Orsa D (218)     | Vasteras (218)      | Eftra D (218)    |
| 3. April precip  | Orsa D (266)     | Vasteras (266)      | Eftra D (266)    |
| 4. Wind speed    | Mora A (106)     | Eskilstuna A (106)  | Torup A (106)    |
| 5. Water level   | SKATTUNGEN (262) | AKESTA KVARN 3 (63) | NISSTROM (262)   |

All 15 tests pass. Numbers in parentheses = weekly aggregates returned.
