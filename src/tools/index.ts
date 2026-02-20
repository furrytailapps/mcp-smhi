import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getForecastTool, getForecastHandler } from './get-forecast';
import { getObservationsTool, getObservationsHandler } from './get-observations';
import { getCurrentConditionsTool, getCurrentConditionsHandler } from './get-current-conditions';
import { describeDataTool, describeDataHandler } from './describe-data';

const tools = [
  { definition: getForecastTool, handler: getForecastHandler },
  { definition: getObservationsTool, handler: getObservationsHandler },
  { definition: getCurrentConditionsTool, handler: getCurrentConditionsHandler },
  { definition: describeDataTool, handler: describeDataHandler },
];

export function registerAllTools(server: McpServer): void {
  for (const { definition, handler } of tools) {
    server.tool(definition.name, definition.description, definition.inputSchema, handler);
  }
}
