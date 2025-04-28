import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { generateText, ModelClass } from "@elizaos/core";
import type { McpService } from "./service";
import { MCP_SERVICE_NAME } from "./types";

export const provider: Provider = {
  name: "MCP",
  description: "Information about connected MCP servers, tools, and resources",

  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    const mcpService = runtime.getService<McpService>(MCP_SERVICE_NAME);
    if (!mcpService) {
      const errorResponse = await generateText({
        runtime,
        context: "No MCP servers are available.",
        modelClass: ModelClass.SMALL,
      });
      return {
        values: { mcp: {} },
        data: { mcp: {} },
        text: errorResponse,
      };
    }

    return mcpService.getProviderData();
  },
};
