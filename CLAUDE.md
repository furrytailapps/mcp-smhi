# mcp-smhi - Claude Code Guide

> **Keep this file up to date.** When tools, API endpoints, or project structure change, update this file. For shared patterns and design decisions, see `../CLAUDE.md`.

MCP server wrapping SMHI (Swedish Meteorological and Hydrological Institute) APIs for weather forecasts, observations, warnings, radar, and lightning data.

## Production URL

```
https://mcp-smhi.vercel.app/mcp
```

## Target Audience

Construction/infrastructure companies using yesper.ai who need:

- Weather forecasts for work planning (concrete pouring, crane lifts, paving)
- Safety warnings (storms, lightning, flooding)
- Short-term precipitation radar for real-time decisions
- Water level data for excavation near waterways
- Lightning alerts for crane/height work safety

## Available Tools (4)

| Tool                          | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| `smhi_get_forecast`           | 10-day point forecast for construction planning        |
| `smhi_get_observations`       | Station measurements (weather + water levels)          |
| `smhi_get_current_conditions` | Warnings, radar, lightning (via `conditionType` param) |
| `smhi_describe_data`          | Discover stations, parameters, districts               |

### Tool Consolidation Pattern (Reference)

This MCP demonstrates how to consolidate multiple related tools into one using enum parameters.

**Before (6 tools):**

- `smhi_get_warnings` - Weather warnings
- `smhi_get_radar` - Radar images
- `smhi_get_lightning` - Lightning strikes

**After (1 tool):**

```typescript
// smhi_get_current_conditions with conditionType enum
conditionType: z.enum(['warnings', 'radar', 'lightning'])

// Usage:
{ "conditionType": "warnings", "warningLevel": "yellow" }
{ "conditionType": "radar", "format": "png" }
{ "conditionType": "lightning", "date": "latest" }
```

**When to consolidate:** Tools that share a semantic category (e.g., "current conditions") or have similar use patterns. Each option can have its own optional parameters.

## Project Structure

```
src/
├── app/[transport]/route.ts   # MCP endpoint
├── clients/smhi-client.ts     # Unified SMHI API client
├── data/
│   ├── kommuner.json          # 290 Swedish municipalities
│   └── lan.json               # 21 Swedish counties with centroids
├── lib/
│   ├── concurrency.ts         # Rate limiting (max 2 concurrent)
│   ├── errors.ts              # Error classes
│   ├── http-client.ts         # HTTP wrapper
│   ├── location-resolver.ts   # Kommun/län → coordinates mapping
│   └── response.ts            # Response formatting
├── tools/
│   ├── index.ts                  # Tool registry (4 tools)
│   ├── get-forecast.ts           # SNOW1gv1 point forecast
│   ├── get-observations.ts       # Met + hydro station data
│   ├── get-current-conditions.ts # Warnings, radar, lightning
│   └── describe-data.ts          # Metadata discovery
└── types/
    ├── smhi-api.ts            # Raw API types + transforms
    └── common-schemas.ts      # Shared Zod schemas
```

## SMHI APIs

| API          | Base URL                              | Purpose                     |
| ------------ | ------------------------------------- | --------------------------- |
| Forecasts    | `opendata-download-metfcst.smhi.se`   | SNOW1gv1 point forecasts    |
| Observations | `opendata-download-metobs.smhi.se`    | Meteorological stations     |
| Hydrology    | `opendata-download-hydroobs.smhi.se`  | Water levels/flows          |
| Warnings     | `opendata-download-warnings.smhi.se`  | Impact-based warnings (IBW) |
| Radar        | `opendata-download-radar.smhi.se`     | Precipitation images        |
| Lightning    | `opendata-download-lightning.smhi.se` | Historical strikes          |

### Key Endpoints

```typescript
// Point forecast (SNOW1gv1)
GET / api / category / snow1g / version / 1 / geotype / point / lon / { lon } / lat / { lat } / data.json;

// Observations
GET / api / version / 1.0 / parameter / { param } / station / { id } / period / { period } / data.json;

// Warnings (IBW - Impact Based Warnings)
GET / ibww / api / version / 1 / warning.json;

// Radar
GET / api / version / latest / area / sweden / product / comp / format / png;

// Lightning
GET / api / version / latest / year / { y } / month / { m } / day / { d } / data.csv;
```

## Location Input Options

Tools accept location in three formats:

| Format                | Example                           | Description               |
| --------------------- | --------------------------------- | ------------------------- |
| **WGS84 coordinates** | `latitude=59.33, longitude=18.07` | Decimal degrees           |
| **Kommun code**       | `kommun="0180"`                   | 4-digit municipality code |
| **Län code**          | `lan="AB"`                        | 1-2 letter county code    |

**Important:** Only codes are accepted, not names. Use `smhi_describe_data` to discover valid codes:

- `dataType="kommuner"` → lists all 290 kommun codes with names
- `dataType="lan"` → lists all 21 län codes with names
- `dataType="kommuner", lanFilter="AB"` → kommuner in a specific län

**Sweden bounds:** 55-69°N latitude, 11-24°E longitude

**Common codes:**
| Location | Kommun Code | Län Code |
|----------|-------------|----------|
| Stockholm | 0180 | AB |
| Göteborg | 1480 | O |
| Malmö | 1280 | M |
| Uppsala | 0380 | C |
| Kiruna | 2584 | BD |
| Gotland | 0980 | I |

## Concurrency

SMHI API rate limits apply. Use `SMHI_API_CONCURRENCY = 2` from `@/lib/concurrency.ts`.

## Forecast Parameters

| Code     | Name               | Unit |
| -------- | ------------------ | ---- |
| t        | temperature        | °C   |
| ws       | windSpeed          | m/s  |
| gust     | windGust           | m/s  |
| wd       | windDirection      | °    |
| r        | humidity           | %    |
| tcc_mean | cloudCover         | %    |
| pmean    | precipitationMean  | mm/h |
| vis      | visibility         | km   |
| msl      | pressure           | hPa  |
| tstm     | thunderProbability | %    |

## Observation Periods

| Period              | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `latest-hour`       | Last hour of data (default)                                       |
| `latest-day`        | Last 24 hours                                                     |
| `latest-months`     | Last 3-4 months                                                   |
| `corrected-archive` | Full historical data, quality-controlled (some stations to 1960s) |

### Historical Data with `corrected-archive`

Use `corrected-archive` period for multi-year historical queries (e.g., winter length analysis, climate trends). This returns quality-controlled data from SMHI's archive.

**Date filtering (required for historical queries):**

- `startDate`: Filter from this date (YYYY-MM-DD)
- `endDate`: Filter until this date (YYYY-MM-DD)

**Auto-aggregation:** Historical data is automatically aggregated to reduce response size:

| Date Range | Aggregation | Output               |
| ---------- | ----------- | -------------------- |
| < 90 days  | Daily       | min/max/avg per day  |
| >= 90 days | Weekly      | min/max/avg per week |

**Example response structure:**

```json
{
  "station": { "name": "Stockholm-Observatoriekullen A", ... },
  "parameter": { "name": "Lufttemperatur", "unit": "celsius" },
  "aggregation": {
    "type": "weekly",
    "rangeDays": 365,
    "rawObservationCount": 8760,
    "aggregatedCount": 52
  },
  "observations": [
    { "period": "2024-01-01", "periodType": "week", "min": -8.2, "max": 2.1, "avg": -3.4, "count": 168 },
    ...
  ]
}
```

**Example: Full year of Stockholm temperature (returns 52 weekly aggregates)**

```json
{
  "dataType": "meteorological",
  "kommun": "0180",
  "parameter": "temperature",
  "period": "corrected-archive",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

## Observation Parameters

### Meteorological

| ID  | Name           | Unit |
| --- | -------------- | ---- |
| 1   | temperature    | °C   |
| 3   | wind_direction | °    |
| 4   | wind_speed     | m/s  |
| 5   | precipitation  | mm   |
| 6   | humidity       | %    |
| 9   | pressure       | hPa  |

### Hydrological

| ID  | Name        | Unit |
| --- | ----------- | ---- |
| 1   | water_level | m    |
| 2   | water_flow  | m³/s |

## Warning Levels (SMHI Color-Coded)

- **Yellow** - Be aware
- **Orange** - Be prepared
- **Red** - Take action

## Development

```bash
npm run dev          # Start dev server (localhost:3000)
npm run typecheck    # Type check
npm run lint         # Lint
npm run prettier:fix # Format code
```

## Testing

```bash
# Basic connectivity
~/.claude/scripts/test-mcp.sh https://mcp-smhi.vercel.app/mcp

# All tools with verbose output
node ~/.claude/scripts/mcp-test-runner.cjs https://mcp-smhi.vercel.app/mcp --all -v

# LLM compatibility simulation
node ~/.claude/scripts/mcp-test-runner.cjs https://mcp-smhi.vercel.app/mcp --all --llm-sim -v
```

## Sample Tool Inputs

```json
// smhi_get_forecast - by coordinates
{ "latitude": 59.33, "longitude": 18.07 }

// smhi_get_forecast - by kommun code (Stockholm = 0180)
{ "kommun": "0180" }

// smhi_get_forecast - by län code (Stockholm = AB)
{ "lan": "AB" }

// smhi_get_observations - temperature in Göteborg (kommun code 1480)
{ "dataType": "meteorological", "kommun": "1480", "parameter": "temperature", "period": "latest-hour" }

// smhi_get_observations - historical temperature for winter analysis
{ "dataType": "meteorological", "kommun": "0180", "parameter": "temperature", "period": "corrected-archive", "startDate": "2020-01-01", "endDate": "2021-01-01" }

// smhi_get_current_conditions - weather warnings
{ "conditionType": "warnings", "warningLevel": "yellow" }

// smhi_get_current_conditions - precipitation radar
{ "conditionType": "radar", "format": "png" }

// smhi_get_current_conditions - lightning near Malmö (kommun code 1280)
{ "conditionType": "lightning", "date": "latest", "kommun": "1280", "radiusKm": 50 }

// smhi_describe_data - list all kommuner (REQUIRED before using kommun codes)
{ "dataType": "kommuner" }

// smhi_describe_data - list kommuner in Stockholms län
{ "dataType": "kommuner", "lanFilter": "AB" }

// smhi_describe_data - list all län (REQUIRED before using län codes)
{ "dataType": "lan" }
```

## Verified Use Cases

Historical observation queries have been tested across 5 construction-relevant use cases and 3 geographic locations (Mora 2062, Västerås 1980, Halmstad 1380).

### Use Case 1: Winter Length Analysis

**Human question:** "Hur långa har vintrarna varit runt Mora senaste 10 åren?"

**Agent query:**
```json
{ "dataType": "meteorological", "kommun": "2062", "parameter": "temperature",
  "period": "corrected-archive", "startDate": "2015-01-01", "endDate": "2025-01-01" }
```

**Results:** 87,193 raw observations → 523 weekly aggregates with min/max/avg temperatures.

**Agent analysis:** Count weeks where avg temp < 0°C to determine winter length per year.

### Use Case 2: Autumn Precipitation Planning

**Human question:** "Hur mycket nederbörd kommer det i Oktober-November runt Västerås?"

**Agent query:**
```json
{ "dataType": "meteorological", "kommun": "1980", "parameter": "precipitation",
  "period": "corrected-archive", "startDate": "2020-10-01", "endDate": "2024-11-30" }
```

**Results:** 218 weekly aggregates covering 4 autumn seasons.

**Agent analysis:** Sum weekly avg precipitation for Oct-Nov periods across years.

### Use Case 3: Heavy Precipitation Risk

**Human question:** "Hur stor risk är det för kraftig nederbörd i April i Halmstad?"

**Agent query:**
```json
{ "dataType": "meteorological", "kommun": "1380", "parameter": "precipitation",
  "period": "corrected-archive", "startDate": "2019-04-01", "endDate": "2024-04-30" }
```

**Results:** 266 weekly aggregates covering 5 April periods.

**Agent analysis:** Analyze max precipitation values and frequency of high-precip weeks.

### Use Case 4: Wind Conditions for Crane Work

**Human question:** "Hur ofta blåser det för mycket för kranlyftar i Mora?"

**Agent query:**
```json
{ "dataType": "meteorological", "kommun": "2062", "parameter": "wind_speed",
  "period": "corrected-archive", "startDate": "2023-01-01", "endDate": "2024-12-31" }
```

**Results:** 106 weekly aggregates with min/max/avg wind speeds.

**Agent analysis:** Count weeks where max wind > 12 m/s (typical crane limit).

### Use Case 5: Water Level for Excavation

**Human question:** "Hur varierar vattennivån i närheten av Mora under året?"

**Agent query:**
```json
{ "dataType": "hydrological", "kommun": "2062", "parameter": "water_level",
  "period": "corrected-archive", "startDate": "2020-01-01", "endDate": "2024-12-31" }
```

**Results:** 262 weekly aggregates from nearest hydrological station (SKATTUNGEN).

**Agent analysis:** Identify seasonal patterns and peak levels for excavation timing.

### Test Matrix Summary

| Use Case | Mora (2062) | Västerås (1980) | Halmstad (1380) |
|----------|-------------|-----------------|-----------------|
| 1. Winter temp | Mora A (523) | Västerås (520) | Torup A (521) |
| 2. Autumn precip | Orsa D (218) | Västerås (218) | Eftra D (218) |
| 3. April precip | Orsa D (266) | Västerås (266) | Eftra D (266) |
| 4. Wind speed | Mora A (106) | Eskilstuna A (106) | Torup A (106) |
| 5. Water level | SKATTUNGEN (262) | ÅKESTA KVARN 3 (63) | NISSASTRÖM (262) |

All 15 tests pass. Numbers in parentheses = weekly aggregates returned.
