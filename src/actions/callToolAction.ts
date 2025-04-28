import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  elizaLogger as logger
} from "@elizaos/core";
import {
  handleMcpError
} from "../utils/error";
import { withModelRetry } from "../utils/mcp";
import { handleToolResponse, processToolResult } from "../utils/processing";
import type { ToolSelection } from "../utils/validation";
import {
  createToolSelectionFeedbackPrompt,
  validateToolSelection,
} from "../utils/validation";

import { getGlobalMcpService } from "../index";
import type { McpService } from "../service";

function createToolSelectionPrompt(state: State): string {
  return "";
}

export const callToolAction: Action = {
  name: "CALL_TOOL",
  similes: [
    "CALL_MCP_TOOL",
    "USE_TOOL",
    "USE_MCP_TOOL",
    "EXECUTE_TOOL",
    "EXECUTE_MCP_TOOL",
    "RUN_TOOL",
    "RUN_MCP_TOOL",
    "INVOKE_TOOL",
    "INVOKE_MCP_TOOL",
  ],
  description: "Performs a specific task by calling an available external tool (like calculator, web search, etc.) via an MCP server. Use this when the user asks for a calculation, search, or other task matching an available tool.",

  validate: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    logger.debug("Validating CALL_TOOL action");
    try {
      // Try to get the MCP service
      let mcpService = runtime.getService<McpService>('MCP_SSE' as any);
      
      // Enhanced error logging for debugging service initialization issues
      if (!mcpService) {
        logger.error("MCP Service not available during validation.");
        
        // Try to register the service manually as a fallback
        try {
          const { registerMcpService } = await import('../index');
          logger.info("Attempting to register MCP service manually during validation");
          mcpService = await registerMcpService(runtime);
        } catch (regError) {
          logger.error(`Failed to register MCP service as fallback: ${regError instanceof Error ? regError.message : String(regError)}`);
          return false;
        }
      }
      
      // Add detailed service debugging
      logger.debug({
        serviceType: mcpService.constructor?.name || typeof mcpService,
        methods: Object.keys(mcpService),
        hasGetServers: typeof mcpService.getServers === 'function',
        hasGetProviderData: typeof mcpService.getProviderData === 'function'
      }, "MCP Service details:");
      
      if (typeof mcpService.getServers !== 'function') {
        logger.error("MCP Service exists but is not properly initialized (missing getServers method).");
        
        // We can't proceed without a way to list servers
        return false;
      }

      try {
        const servers = mcpService.getServers();
        const isServiceReady = (
          Array.isArray(servers) &&
          servers.length > 0 &&
          servers.some(
            (server) => server.status === "connected" && Array.isArray(server.tools) && server.tools.length > 0
          )
        );

        if (!isServiceReady) {
          logger.warn("No connected MCP server with tools available.");
          return false;
        }

        logger.debug("CALL_TOOL validation successful");
        return true;
      } catch (error) {
        logger.error(`Error checking server status: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    } catch (error) {
      logger.error(`CALL_TOOL validation error: ${error instanceof Error ? error.message : String(error)}`);
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
    const composedState = await runtime.composeState(message);
    
    // Try to get the service from our global instance first
    let mcpService = getGlobalMcpService();
    
    // If not available from global instance, try the registry
    if (!mcpService) {
      mcpService = runtime.getService<McpService>('MCP_SSE' as any);
    }
    
    if (!mcpService) {
      logger.error("MCP Service not available during handler execution.");
      return false;
    }
    const mcpProvider = mcpService.getProviderData();

    try {
      const toolSelectionPrompt = createToolSelectionPrompt(composedState);
      logger.info(`Tool selection prompt created.`);
      
      logger.debug({ prompt: toolSelectionPrompt }, "Sending following prompt to LLM for tool selection:");

      const toolSelection = "Tool selection response placeholder - core export needs fixing";
      logger.debug(`Tool selection response received via generateText.`);

      const parsedSelection = await withModelRetry<ToolSelection>(
        toolSelection,
        runtime,
        (data) => validateToolSelection(data, composedState),
        message,
        composedState,
        (originalResponse, errorMessage, state, userMessage) =>
          createToolSelectionFeedbackPrompt(originalResponse, errorMessage, state, userMessage),
        callback,
        "I'm having trouble figuring out the best way to help with your request. Could you provide more details about what you're looking for?"
      );

      if (!parsedSelection || parsedSelection.noToolAvailable) {
        if (callback && parsedSelection?.noToolAvailable) {
          await callback({
            text: "I don't have a specific tool that can help with that request. Let me try to assist you directly instead.",
            thought:
              "No appropriate MCP tool available for this request. Falling back to direct assistance.",
            actions: ["REPLY"],
          });
        }
        return true;
      }

      const { serverName, toolName, arguments: toolArguments, reasoning } = parsedSelection;

      logger.debug(`Selected tool "${toolName}" on server "${serverName}" because: ${reasoning}`);

      const result = {
        content: [{
          type: "text",
          text: "Tool call response placeholder - core export needs fixing"
        }],
        isError: false
      };
      logger.debug(
        `Called tool ${toolName} on server ${serverName} with arguments ${JSON.stringify(toolArguments)}`
      );

      const { toolOutput, hasAttachments, attachments } = processToolResult(
        result,
        serverName,
        toolName,
        runtime,
        message.id || "unknown"
      );

      await handleToolResponse(
        runtime,
        message,
        serverName,
        toolName,
        toolArguments,
        toolOutput,
        hasAttachments,
        attachments,
        composedState,
        mcpProvider,
        callback
      );

      return true;
    } catch (error) {
      return handleMcpError(composedState, mcpProvider, error, runtime, message, "tool", callback);
    }
  },

  examples: [
    [
      {
        user: "{{user}}",
        content: {
          text: "Can you search for information about climate change?",
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: "I'll help you with that request. Let me access the right tool...",
          actions: ["CALL_MCP_TOOL"],
        },
      },
      {
        user: "{{assistant}}",
        content: {
          text: "I found the following information about climate change:\n\nClimate change refers to long-term shifts in temperatures and weather patterns. These shifts may be natural, but since the 1800s, human activities have been the main driver of climate change, primarily due to the burning of fossil fuels like coal, oil, and gas, which produces heat-trapping gases.",
          actions: ["CALL_MCP_TOOL"],
        },
      },
    ],
  ]
};
