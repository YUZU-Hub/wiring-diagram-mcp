# Wiring Diagram MCP

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server for designing complete electrical systems for campers, boats, and off-grid setups. Generates wiring diagrams and provides a full suite of electrical calculators.

Powered by [VoltPlan](https://voltplan.app).

## Features

- **Wiring diagrams** — generate complete schematics as SVG or PNG
- **Power budget** — calculate daily energy consumption from a list of loads
- **Battery bank sizing** — determine capacity, number of batteries, and configuration
- **Solar panel sizing** — find the right solar wattage for your consumption and location
- **Charging time** — estimate charge duration from solar, shore, or alternator
- **Inverter sizing** — size an inverter for your AC loads with surge handling
- **Battery configuration** — series/parallel arrangement with wiring instructions
- **Cable cross-section & resistance** — find the right wire gauge with fuse recommendation
- Auto-generated protection components (shunt, main switch, low-voltage cutoff)
- Support for solar, shore power, wind, generator, and alternator charging systems
- Available as hosted remote MCP, local stdio, or self-hosted HTTP server

## Quick Start — Claude Desktop

If you just want to use this with Claude Desktop, follow these steps:

1. Open Claude Desktop
2. Go to **Settings** (click your name in the bottom-left corner)
3. Click **Developer**, then **Edit Config**
4. This opens a file called `claude_desktop_config.json`. Paste the following into it:

```json
{
  "mcpServers": {
    "wiring-diagram": {
      "url": "https://mcp.voltplan.app/mcp"
    }
  }
}
```

5. Save the file and **restart Claude Desktop**
6. You should now see a hammer icon in the chat input area — that means the tools are available

**That's it!** You can now ask Claude things like:

- *"Draw me a wiring diagram for a camper van with a 100Ah LiFePO4 battery, LED lights, a fridge, and a solar charger."*
- *"I have LED lights (20W, 5h/day), a fridge (60W, 24/7), and two USB chargers (10W, 3h/day). What's my daily power consumption at 12V?"*
- *"Size a battery bank for 1600 Wh/day with 2 days of autonomy using 100Ah LiFePO4 batteries."*
- *"How many watts of solar panels do I need for 1600 Wh/day in Northern Europe?"*
- *"How long will it take to charge my 200Ah battery from 20% to full with a 600W solar setup?"*
- *"What cable size do I need for a 12V fridge that draws 5 amps, with 3 meters of cable?"*
- *"I want to run a microwave (800W) and a coffee machine (1000W) — what inverter do I need?"*

## Other Setup Options

### Claude Code

```bash
claude mcp add wiring-diagram --transport http https://mcp.voltplan.app/mcp
```

### Local via npx

Run locally without installation:

**Claude Code:**
```bash
claude mcp add wiring-diagram -- npx wiring-diagram-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "wiring-diagram": {
      "command": "npx",
      "args": ["wiring-diagram-mcp"]
    }
  }
}
```

### Self-hosted HTTP server

```bash
npm install
npm run build
npm run start:http
```

The MCP server starts on `http://localhost:3001/mcp`.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `VOLTPLAN_API_URL` | `https://voltplan.app` | URL of the VoltPlan instance |
| `PORT` | `3001` | Port for the HTTP server |

## MCP Tools

### `generate_wiring_diagram`

Generate a complete electrical wiring diagram.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `systemName` | string | yes | Name of the electrical system |
| `batteries` | array | no | Battery specifications |
| `loads` | array | no | Electrical loads / consumers |
| `chargers` | array | no | Chargers with power source types |
| `format` | `"svg"` or `"png"` | no | Output format (default: `"svg"`) |

**Example:**

```json
{
  "systemName": "Camper Van",
  "batteries": [
    { "name": "LiFePO4", "voltage": 12, "capacityAh": 100, "energyWh": 1280 }
  ],
  "loads": [
    { "name": "LED Lights", "power": 20, "voltage": 12, "current": 1.7 },
    { "name": "Fridge", "power": 60, "voltage": 12, "current": 5 }
  ],
  "chargers": [
    { "name": "Solar Charger", "inputVoltage": 48, "outputVoltage": 12, "power": 200, "sourceType": "solar" }
  ]
}
```

### `calculate_wire_gauge`

Calculate the recommended cable cross-section for a DC circuit. Considers both ampacity (current carrying capacity) and voltage drop to find the optimal wire size. Also provides total resistance, power loss, and a fuse recommendation.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `voltage` | number | yes | System voltage in volts (e.g. 12, 24, 48) |
| `current` | number | no | Load current in amps (provide `current` or `power`) |
| `power` | number | no | Load power in watts (provide `current` or `power`) |
| `cableLengthM` | number | yes | One-way cable length in meters |
| `maxVoltageDropPercent` | number | no | Max acceptable voltage drop in % (default: 3) |
| `temperatureCelsius` | number | no | Ambient temperature in °C (default: 20) |
| `isRoundTrip` | boolean | no | Account for both conductors (default: true) |

**Example:**

```json
{
  "voltage": 12,
  "current": 10,
  "cableLengthM": 5,
  "maxVoltageDropPercent": 3
}
```

### `calculate_power_budget`

Calculate total daily energy consumption from a list of loads. This is typically the first step in designing an off-grid system.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `systemVoltage` | number | yes | System voltage (e.g. 12, 24, 48) |
| `loads` | array | yes | List of loads, each with `name`, `powerWatts`, `hoursPerDay`, `quantity` |

**Example:**

```json
{
  "systemVoltage": 12,
  "loads": [
    { "name": "LED Lights", "powerWatts": 20, "hoursPerDay": 5, "quantity": 1 },
    { "name": "Fridge", "powerWatts": 60, "hoursPerDay": 24, "quantity": 1 }
  ]
}
```

### `calculate_battery_bank`

Size a battery bank based on daily consumption, autonomy days, and depth of discharge.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `dailyConsumptionWh` | number | yes | Daily energy use in Wh |
| `daysOfAutonomy` | number | no | Days without charging (default: 2) |
| `depthOfDischargePercent` | number | no | Usable %. LiFePO4: 80, AGM: 50 (default: 80) |
| `systemVoltage` | number | yes | Target system voltage |
| `singleBatteryAh` | number | yes | Capacity of one battery |
| `singleBatteryVoltage` | number | yes | Voltage of one battery |

### `calculate_solar_size`

Calculate required solar panel wattage to cover daily consumption.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `dailyConsumptionWh` | number | yes | Daily energy use in Wh |
| `peakSunHours` | number | yes | Average daily peak sun hours for the location |
| `systemEfficiency` | number | no | Efficiency factor (default: 0.85) |

### `calculate_charging_time`

Estimate charging duration from any source, accounting for bulk and absorption phases.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `batteryCapacityAh` | number | yes | Total bank capacity in Ah |
| `batteryVoltage` | number | yes | Battery voltage |
| `currentStateOfChargePercent` | number | yes | Current SoC (e.g. 20) |
| `targetStateOfChargePercent` | number | no | Target SoC (default: 100) |
| `chargePowerWatts` | number | yes | Charger output power in watts |
| `chargeCurrentAmps` | number | no | Max charge current if limited by BMS |

### `calculate_inverter_size`

Size an inverter for AC loads with surge handling and 25% headroom.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `systemVoltage` | number | yes | DC system voltage |
| `loads` | array | yes | AC loads, each with `name`, `continuousWatts`, optional `surgeWatts`, `quantity` |

### `calculate_battery_config`

Determine series/parallel battery arrangement with step-by-step wiring instructions.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `targetVoltage` | number | yes | Desired system voltage |
| `targetCapacityAh` | number | yes | Desired total capacity in Ah |
| `singleBatteryVoltage` | number | yes | Voltage of one battery |
| `singleBatteryAh` | number | yes | Capacity of one battery in Ah |

### `list_component_types`

Returns all available component types with example configurations. Useful for understanding valid parameters before generating a diagram.

## Docker

```bash
docker build -t wiring-diagram-mcp .
docker run -p 3001:3001 wiring-diagram-mcp
```

## License

MIT
