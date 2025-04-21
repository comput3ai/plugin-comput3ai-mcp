import type { State } from "@elizaos/core";
import { type McpProviderData, ResourceSelectionSchema, ToolSelectionSchema } from "../types";
import { validateJsonSchema } from "./json";

export interface ToolSelection {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reasoning?: string;
  noToolAvailable?: boolean;
}

export interface ResourceSelection {
  serverName: string;
  uri: string;
  reasoning?: string;
  noResourceAvailable?: boolean;
}

export function validateToolSelection(
  selection: unknown,
  composedState: State
): { success: true; data: ToolSelection } | { success: false; error: string } {
  const basicResult = validateJsonSchema<ToolSelection>(selection, ToolSelectionSchema);
  if (!basicResult.success) {
    return { success: false, error: basicResult.error };
  }

  const data = basicResult.data;

  if (data.noToolAvailable) {
    return { success: true, data };
  }

  const mcpData = composedState.values.mcp || {};
  const serverInfo = mcpData[data.serverName];

  if (!serverInfo || serverInfo.status !== "connected") {
    return {
      success: false,
      error: `Server '${data.serverName}' not found or not connected`,
    };
  }

  const toolInfo = serverInfo.tools?.[data.toolName];
  if (!toolInfo) {
    return {
      success: false,
      error: `Tool '${data.toolName}' not found on server '${data.serverName}'`,
    };
  }

  if (toolInfo.inputSchema) {
    const validationResult = validateJsonSchema(
      data.arguments,
      toolInfo.inputSchema as Record<string, unknown>
    );

    if (!validationResult.success) {
      return {
        success: false,
        error: `Invalid arguments: ${validationResult.error}`,
      };
    }
  }

  return { success: true, data };
}

export function validateResourceSelection(
  selection: unknown
): { success: true; data: ResourceSelection } | { success: false; error: string } {
  return validateJsonSchema<ResourceSelection>(selection, ResourceSelectionSchema);
}

export function createToolSelectionFeedbackPrompt(
  originalResponse: string,
  errorMessage: string,
  composedState: State,
  userMessage: string
): string {
  let toolsDescription = "";

  for (const [serverName, server] of Object.entries(composedState.values.mcp || {}) as [
    string,
    McpProviderData[string],
  ][]) {
    if (server.status !== "connected") continue;

    for (const [toolName, tool] of Object.entries(server.tools || {}) as [
      string,
      { description?: string },
    ][]) {
      toolsDescription += `Tool: ${toolName} (Server: ${serverName})\n`;
      toolsDescription += `Description: ${tool.description || "No description available"}\n\n`;
    }
  }

  return createFeedbackPrompt(
    originalResponse,
    errorMessage,
    "tool",
    toolsDescription,
    userMessage
  );
}

export function createResourceSelectionFeedbackPrompt(
  originalResponse: string,
  errorMessage: string,
  composedState: State,
  userMessage: string
): string {
  let resourcesDescription = "";

  for (const [serverName, server] of Object.entries(composedState.values.mcp || {}) as [
    string,
    McpProviderData[string],
  ][]) {
    if (server.status !== "connected") continue;

    for (const [uri, resource] of Object.entries(server.resources || {}) as [
      string,
      { description?: string; name?: string },
    ][]) {
      resourcesDescription += `Resource: ${uri} (Server: ${serverName})\n`;
      resourcesDescription += `Name: ${resource.name || "No name available"}\n`;
      resourcesDescription += `Description: ${
        resource.description || "No description available"
      }\n\n`;
    }
  }

  return createFeedbackPrompt(
    originalResponse,
    errorMessage,
    "resource",
    resourcesDescription,
    userMessage
  );
}

function createFeedbackPrompt(
  originalResponse: string,
  errorMessage: string,
  itemType: string,
  itemsDescription: string,
  userMessage: string
): string {
  return `Error parsing JSON: ${errorMessage}

Your original response:
${originalResponse}

Please try again with valid JSON for ${itemType} selection.
Available ${itemType}s:
${itemsDescription}

User request: ${userMessage}`;
}
