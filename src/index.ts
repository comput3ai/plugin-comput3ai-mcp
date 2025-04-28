import { type IAgentRuntime, type Plugin } from "@elizaos/core";
import * as mcpActions from "./actions";
import { provider } from "./provider";
import { McpService } from "./service";
import * as mcpTypes from "./types";

// Global service instance - used to prevent loss of methods during proxy creation
let globalServiceInstance: McpService | null = null;

// Standalone registration function for direct use
export async function registerMcpService(runtime: IAgentRuntime): Promise<McpService> {
  // Check if we already have a global instance
  if (globalServiceInstance && typeof globalServiceInstance.getServers === 'function') {
    console.log("Using existing global MCP service instance.");
    return globalServiceInstance;
  }
  
  // Check if service is already registered and functioning
  const existingService = runtime.getService<McpService>('MCP_SSE' as any);
  if (existingService && typeof existingService.getServers === 'function') {
    console.log("MCP Service already registered and functioning. Using existing service.");
    globalServiceInstance = existingService;
    return existingService;
  }
  
  // If service doesn't exist or is incomplete, create a new one
  // Mark the original module export to avoid circular references
  const McpServiceClass = McpService;
  const service = new McpServiceClass(runtime);
  
  // Store in global variable to prevent garbage collection and method loss
  globalServiceInstance = service;
  
  // First initialize the service fully
  await service.initialize(runtime);
  
  // Make ABSOLUTELY SURE it has the required methods before registering
  if (typeof service.getServers !== 'function' || 
      typeof service.getProviderData !== 'function' ||
      typeof service.checkResourceAvailability !== 'function') {
    console.error("CRITICAL ERROR: Service instance missing required methods after initialization!");
    console.log("Methods available:", Object.keys(service));
    throw new Error("Service initialization failed: required methods not available");
  }
  
  try {
    // Only register after it's fully initialized with all methods
    runtime.registerService(service);
    console.log("MCP Service fully initialized and registered successfully");
  } catch (error) {
    // If registration fails (likely because another service was registered in parallel)
    // Try to get the newly registered service
    const registeredService = runtime.getService<McpService>('MCP_SSE' as any);
    if (registeredService && typeof registeredService.getServers === 'function') {
      console.log("Using existing MCP service that was registered during initialization");
      globalServiceInstance = registeredService;
      return registeredService;
    }
    console.error("Failed to register MCP service and no working service exists:", error);
  }
  
  return service;
}

// Utility function to get service directly without going through registry
export function getGlobalMcpService(): McpService | null {
  return globalServiceInstance;
}

const mcpPlugin: Plugin = {
  name: "mcp",
  description: "Plugin for connecting to MCP (Model Context Protocol) servers",
  services: [{ 
    // Modified to match the Service interface that returns void
    initialize: async (runtime: IAgentRuntime) => {
      await registerMcpService(runtime);
      return;
    },
    get serviceType() { return 'MCP_SSE' as any; }
  }],
  actions: Object.values(mcpActions),
  providers: [provider],
};

export { mcpActions as actions, mcpTypes as types };
export default mcpPlugin;
