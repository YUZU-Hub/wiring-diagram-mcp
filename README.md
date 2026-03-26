# Wiring Diagram MCP

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that generates electrical wiring diagrams for campers, boats, and off-grid setups.

Powered by [VoltPlan](https://voltplan.app).

## Features

- Generate complete wiring schematics as SVG or PNG
- Auto-generated protection components (shunt, main switch, low-voltage cutoff)
- Auto-calculated fuse sizes and wire gauges
- Support for solar, shore power, wind, and generator charging systems
- Available as HTTP MCP server (Streamable HTTP transport)

## Quick Start

```bash
npm install
npm run build
npm start
```

The MCP server starts on `http://localhost:3001/mcp`.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `VOLTPLAN_API_URL` | `http://localhost:3000` | URL of the VoltPlan instance |
| `PORT` | `3001` | Port for the MCP server |

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
| `format` | `"svg"` or `"png"` | no | Output format (default: `"png"`) |

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
  ],
  "format": "png"
}
```

### `list_component_types`

Returns all available component types with example configurations. Useful for understanding valid parameters before generating a diagram.

## Connecting to Claude Desktop

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wiring-diagram": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

## Docker

```bash
docker build -t wiring-diagram-mcp .
docker run -p 3001:3001 -e VOLTPLAN_API_URL=http://host.docker.internal:3000 wiring-diagram-mcp
```

## License

MIT
