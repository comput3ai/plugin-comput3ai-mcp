import {
  generateText,
  elizaLogger as logger,
  ModelClass,
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State
} from "@elizaos/core";
import { getGlobalMcpService } from "../index";
import type { McpService } from "../service";
import { handleMcpError } from "../utils/error";
import { withModelRetry } from "../utils/mcp";
import {
  handleResourceAnalysis,
  processResourceResult,
  sendInitialResponse,
} from "../utils/processing";
import type { ResourceSelection } from "../utils/validation";
import {
  createResourceSelectionFeedbackPrompt,
  validateResourceSelection,
} from "../utils/validation";

function createResourceSelectionPrompt(runtime: IAgentRuntime, composedState: State, userMessage: string): string {
  // Try to get the service from our global instance first
  let mcpService = getGlobalMcpService();
  
  // If not available from global instance, try the registry
  if (!mcpService) {
    mcpService = runtime.getService<McpService>('MCP_SSE' as any);
  }
  
  const mcpProviderData = mcpService?.getProviderData();
  const mcpData = mcpProviderData?.values?.mcp || {};

  let resourcesDescription = "";
  for (const serverName of Object.keys(mcpData)) {
    const server = mcpData[serverName];
    if (server?.status !== "connected" || !server.resources) continue;

    const resourceUris = Object.keys(server.resources);
    if (resourceUris.length === 0) {
        resourcesDescription += `Server: ${serverName} - No resources available\n\n`;
        continue;
    }

    resourcesDescription += `Server: ${serverName}\n`;
    for (const uri of resourceUris) {
      const resource = server.resources[uri];
      if (!resource) continue;
      resourcesDescription += `  Resource: ${uri}\n`;
      resourcesDescription += `  Name: ${resource.name || "No name available"}\n`;
      resourcesDescription += `  Description: ${resource.description || "No description available"}\n`;
      resourcesDescription += `  MIME Type: ${resource.mimeType || "Not specified"}\n\n`;
    }
  }

  if (!resourcesDescription) {
      resourcesDescription = "No connected servers have available resources listed.";
  }

  const enhancedState: State = {
    ...composedState,
    resourcesDescription: resourcesDescription,
    userMessage: userMessage,
  };

  return "";
}

export const readResourceAction: Action = {
  name: "READ_RESOURCE",
  similes: [
    "READ_MCP_RESOURCE",
    "GET_RESOURCE",
    "GET_MCP_RESOURCE",
    "FETCH_RESOURCE",
    "FETCH_MCP_RESOURCE",
    "ACCESS_RESOURCE",
    "ACCESS_MCP_RESOURCE",
  ],
  description: "Retrieves or reads data from a specific information resource (like documentation, status pages, configuration files) via an MCP server. Use this when the user asks for specific information that exists as a known resource.",

  validate: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    const validationId = message.id?.substring(0, 8) || 'unknown';
    logger.debug({ validationId }, `[READ_RESOURCE] Starting validation...`);
    
    try {
      let mcpService = runtime.getService<McpService>('MCP_SSE' as any);
      
      if (!mcpService) {
        logger.error({ validationId }, "[READ_RESOURCE] Validation failed: MCP Service instance not found.");
        
        // Try to register the service manually as a fallback
        try {
          const { registerMcpService } = await import('../index');
          logger.info({ validationId }, "Attempting to register MCP service manually during validation");
          mcpService = await registerMcpService(runtime);
        } catch (regError) {
          logger.error({ validationId }, `Failed to register MCP service as fallback: ${regError instanceof Error ? regError.message : String(regError)}`);
          return false;
        }
      }
      
      // Add detailed logging about the service
      logger.debug({ 
        validationId,
        serviceType: mcpService.constructor?.name || typeof mcpService,
        methods: Object.keys(mcpService),
        hasCheckResourceAvailability: typeof mcpService.checkResourceAvailability === 'function',
        hasGetServers: typeof mcpService.getServers === 'function' 
      }, "[READ_RESOURCE] MCP Service details:");
      
      // Check if the service is properly initialized with the required methods
      if (typeof mcpService.checkResourceAvailability !== 'function') {
        logger.error({ validationId }, "[READ_RESOURCE] Validation failed: MCP Service is not properly initialized (missing checkResourceAvailability method).");
        
        // If getServers is available, we can still proceed with a manual check
        if (typeof mcpService.getServers === 'function') {
          logger.info({ validationId }, "[READ_RESOURCE] Attempting fallback resource availability check using getServers method");
          const servers = mcpService.getServers();
          const hasResources = Array.isArray(servers) && 
            servers.some(server => 
              server.status === "connected" && 
              Array.isArray(server.resources) && 
              server.resources.length > 0
            );
            
          if (hasResources) {
            logger.success({ validationId }, "[READ_RESOURCE] Fallback validation successful (Resources available on at least one server)");
            return true;
          }
        }
        
        return false;
      }

      // Call the method on the service instance to check resource availability
      try {
        const resourcesAvailable = mcpService.checkResourceAvailability();
        
        if (!resourcesAvailable) {
          logger.warn({ validationId }, "[READ_RESOURCE] Validation failed: No connected MCP servers reported available resources during initialization.");
          return false;
        }
        
        logger.success({ validationId }, "[READ_RESOURCE] Validation successful (Resources available on at least one server)");
        return true;
      } catch (error) {
        logger.error({ validationId }, `[READ_RESOURCE] Error checking resource availability: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    } catch (error) {
      logger.error({ validationId }, `[READ_RESOURCE] Unexpected error during validation: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<boolean> => {
    // Try to get the service from our global instance first
    let mcpService = getGlobalMcpService();
    
    // If not available from global instance, try the registry
    if (!mcpService) {
      mcpService = runtime.getService<McpService>('MCP_SSE' as any);
    }
    
    // Basic check to ensure service still exists, though validate should have caught it.
    if (!mcpService) {
        logger.error("MCP Service became unavailable between validate and handler.");
        if (callback) {
            await callback({ text: "Sorry, the required MCP service became unavailable.", actions: ["REPLY"]});
        }
        return false;
    }

    const composedState = await runtime.composeState(message);
    const mcpProvider = mcpService.getProviderData();

    try {
      await sendInitialResponse(callback);

      const resourceSelectionPrompt = createResourceSelectionPrompt(
        runtime,
        composedState,
        message.content.text || ""
      );

      const resourceSelection = await generateText({
        runtime: runtime,
        context: resourceSelectionPrompt,
        modelClass: ModelClass.SMALL,
      });

      const parsedSelection = await withModelRetry<ResourceSelection>(
        resourceSelection,
        runtime,
        (data) => validateResourceSelection(data),
        message,
        composedState,
        (originalResponse, errorMessage, state, userMessage) =>
          createResourceSelectionFeedbackPrompt(originalResponse, errorMessage, state, userMessage),
        callback,
        "I'm having trouble figuring out where to find the information you're looking for. Could you provide more details about what you need?"
      );

      if (!parsedSelection || parsedSelection.noResourceAvailable) {
        if (callback && parsedSelection?.noResourceAvailable) {
          await callback({
            text: "I don't have a specific resource that contains the information you're looking for. Let me try to assist you directly instead.",
            thought:
              "No appropriate MCP resource available for this request. Falling back to direct assistance.",
            actions: ["REPLY"],
          });
        }
        return true;
      }

      const { serverName, uri, reasoning } = parsedSelection;

      logger.debug(`Selected resource "${uri}" on server "${serverName}" because: ${reasoning}`);

      const result = await mcpService.readResource(serverName, uri);
      logger.debug(`Read resource ${uri} from server ${serverName}`);

      const { resourceContent, resourceMeta } = processResourceResult(result, uri);

      await handleResourceAnalysis(
        runtime,
        message,
        uri,
        serverName,
        resourceContent,
        resourceMeta,
        callback
      );

      return true;
    } catch (error) {
      return handleMcpError(
        composedState,
        mcpProvider,
        error,
        runtime,
        message,
        "resource",
        callback
      );
    }
  },

  examples: [
    // Example 1: Specific Documentation Request
    [
      {
        user: "{{user}}",
        content: {
          text: "Can you get the documentation about installing ElizaOS?",
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: `Okay, let me find the ElizaOS installation guide for you. One moment...`,
          actions: ["READ_RESOURCE"], // Use primary action name
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: `Here's a summary of the installation process: You'll need Node.js 23+ and Git. For Windows, WSL 2 is required. Clone the starter repo using \`git clone https://github.com/elizaos/eliza-starter.git\`, then run \`cd eliza-starter && cp .env.example .env && bun i && bun run build && bun start\`. You can then access the web UI at http://localhost:3000. Would you like more details on any specific step?`,
          actions: ["REPLY"], // Follow-up is usually a reply
        },
      },
    ],
    // Example 2: Requesting Status Update
    [
      {
        user: "{{user}}",
        content: {
          text: "What's the latest status on the 'Project Phoenix' deployment?",
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: `Let me check the Project Phoenix status resource for the latest updates...`,
          actions: ["READ_RESOURCE"],
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: `According to the latest update from 2 hours ago, Project Phoenix deployment is on schedule. Testing phase completed successfully, and the final rollout is planned for tomorrow morning at 9 AM UTC. All systems are green.`,
          actions: ["REPLY"],
        },
      },
    ],
    // Example 3: Summarizing Meeting Notes
    [
      {
        user: "{{user}}",
        content: {
          text: "Can you summarize the key decisions from yesterday's team sync meeting notes?",
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: `Sure, I can do that. I'll access yesterday's team sync notes and pull out the key decisions...`,
          actions: ["READ_RESOURCE"],
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: `Okay, the main decisions from yesterday's sync were: 1) Approve the revised Q4 marketing budget. 2) Assign Sarah lead on the customer feedback analysis initiative. 3) Postpone the website redesign discussion to next week's meeting.`,
          actions: ["REPLY"],
        },
      },
    ],
    // Example 4: Information Lookup (Policy)
    [
      {
        user: "{{user}}",
        content: {
          text: "Remind me about the company's policy on using personal devices for work.",
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: `I can look up the official policy on personal device usage. Let me retrieve that document...`,
          actions: ["READ_RESOURCE"],
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: `The company policy states that personal devices can be used for work communication (email, chat) provided they meet security requirements (e.g., screen lock, up-to-date OS). Accessing sensitive company data requires enrollment in the Mobile Device Management (MDM) system. Would you like the full policy document link?`,
          actions: ["REPLY"],
        },
      },
    ],
  ],
};
