import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type State
} from "@elizaos/core";
import { getGlobalMcpService } from "./index";
import type { McpService } from "./service";
import type { McpProvider } from "./types";

export const provider: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    // Try to get the service from our global instance first
    let mcpService = getGlobalMcpService();
    
    // If not available from global instance, try the registry
    if (!mcpService) {
      mcpService = runtime.getService<McpService>('MCP_SSE' as any);
    }
    
    // Defensive check: Ensure service exists and has the expected method
    if (!mcpService || typeof mcpService.getProviderData !== 'function') {
      // Return default/empty data if service isn't ready
      return {
        values: { mcp: {} },
        data: { mcp: {} },
        text: "MCP service not available or not yet initialized.",
      } as McpProvider;
    }

    // Service is ready, call the method
    return mcpService.getProviderData();
  },
};
