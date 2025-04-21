import {
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  composePromptFromState,
  logger,
} from "@elizaos/core";
import type { State } from "@elizaos/core";
import { errorAnalysisPrompt } from "../templates/errorAnalysisPrompt";
import type { McpProvider } from "../types";

export async function handleMcpError(
  state: State,
  mcpProvider: McpProvider,
  error: unknown,
  runtime: IAgentRuntime,
  message: Memory,
  type: "tool" | "resource",
  callback?: HandlerCallback
): Promise<boolean> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  logger.error(`Error executing MCP ${type}: ${errorMessage}`, error);

  if (callback) {
    const enhancedState: State = {
      ...state,
      values: {
        ...state.values,
        mcpProvider,
        userMessage: message.content.text || "",
        error: errorMessage,
      },
    };

    const prompt = composePromptFromState({
      state: enhancedState,
      template: errorAnalysisPrompt,
    });

    try {
      const errorResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
      });

      await callback({
        thought: `Error calling MCP ${type}: ${errorMessage}. Providing a helpful response to the user.`,
        text: errorResponse,
        actions: ["REPLY"],
      });
    } catch (modelError) {
      logger.error(
        "Failed to generate error response:",
        modelError instanceof Error ? modelError.message : String(modelError)
      );

      await callback({
        thought: `Error calling MCP ${type} and failed to generate a custom response. Providing a generic fallback response.`,
        text: `I'm sorry, I wasn't able to get the information you requested. There seems to be an issue with the ${type} right now. Is there something else I can help you with?`,
        actions: ["REPLY"],
      });
    }
  }

  return false;
}

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: string = "UNKNOWN"
  ) {
    super(message);
    this.name = "McpError";
  }

  static connectionError(serverName: string, details?: string): McpError {
    return new McpError(
      `Failed to connect to server '${serverName}'${details ? `: ${details}` : ""}`,
      "CONNECTION_ERROR"
    );
  }

  static toolNotFound(toolName: string, serverName: string): McpError {
    return new McpError(`Tool '${toolName}' not found on server '${serverName}'`, "TOOL_NOT_FOUND");
  }

  static resourceNotFound(uri: string, serverName: string): McpError {
    return new McpError(
      `Resource '${uri}' not found on server '${serverName}'`,
      "RESOURCE_NOT_FOUND"
    );
  }

  static validationError(details: string): McpError {
    return new McpError(`Validation error: ${details}`, "VALIDATION_ERROR");
  }

  static serverError(serverName: string, details?: string): McpError {
    return new McpError(
      `Server error from '${serverName}'${details ? `: ${details}` : ""}`,
      "SERVER_ERROR"
    );
  }
}
