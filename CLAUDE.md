# mcp-smhi

> For shared patterns and coding standards, see parent CLAUDE.md.

MCP server wrapping SMHI (Swedish Meteorological and Hydrological Institute) public APIs for weather, hydrology, warnings, radar, and lightning.

## Production URL

https://mcp-smhi.vercel.app/mcp

## Tools

- `smhi_get_forecast` — 10-day point forecast for construction planning
- `smhi_get_observations` — Station measurements (weather + water levels)
- `smhi_get_current_conditions` — Warnings, radar, lightning (via `conditionType` enum)
- `smhi_describe_data` — Discover stations, parameters, kommuner/lan codes

## Quirks

- No env vars needed (all public APIs)
- Location accepts WGS84 OR kommun/lan codes (codes only, not names — use `smhi_describe_data` to look up codes)
- For validated query patterns, see `tests/verified-use-cases.md`
