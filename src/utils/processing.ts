import {
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Media,
  type Memory,
  ModelClass,
  type State,
  generateText,
  elizaLogger as logger
} from "@elizaos/core";
import { resourceAnalysisTemplate } from "../templates/resourceAnalysisTemplate";
import { toolReasoningTemplate } from "../templates/toolReasoningTemplate";
import { createMcpMemory } from "./mcp";

function composePromptFromState({ state, template }: { state: State, template: string }): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => 
    (state.values as any)[key] || state[key] || ''
  );
}

export function processResourceResult(
  result: {
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
  },
  uri: string
): { resourceContent: string; resourceMeta: string } {
  let resourceContent = "";
  let resourceMeta = "";

  for (const content of result.contents) {
    if (content.text) {
      resourceContent += content.text;
    } else if (content.blob) {
      resourceContent += `[Binary data - ${content.mimeType || "unknown type"}]`;
    }

    resourceMeta += `Resource: ${content.uri || uri}\n`;
    if (content.mimeType) {
      resourceMeta += `Type: ${content.mimeType}\n`;
    }
  }

  return { resourceContent, resourceMeta };
}

export function processToolResult(
  result: {
    content: Array<{
      type: string;
      text?: string;
      mimeType?: string;
      data?: string;
      resource?: {
        uri: string;
        text?: string;
        blob?: string;
      };
    }>;
    isError?: boolean;
  },
  serverName: string,
  toolName: string,
  runtime: IAgentRuntime,
  messageEntityId: string
): { toolOutput: string; hasAttachments: boolean; attachments: Media[] } {
  let toolOutput = "";
  let hasAttachments = false;
  const attachments: Media[] = [];

  for (const content of result.content) {
    if (content.type === "text") {
      toolOutput += content.text;
    } else if (content.type === "image") {
      hasAttachments = true;
      attachments.push({
        contentType: content.mimeType,
        url: `data:${content.mimeType};base64,${content.data}`,
        id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: "Generated image",
        source: `${serverName}/${toolName}`,
        description: "Tool-generated image",
        text: "Generated image",
      });
    } else if (content.type === "resource") {
      const resource = content.resource;
      if (resource && "text" in resource) {
        toolOutput += `\n\nResource (${resource.uri}):\n${resource.text}`;
      } else if (resource && "blob" in resource) {
        toolOutput += `\n\nResource (${resource.uri}): [Binary data]`;
      }
    }
  }

  return { toolOutput, hasAttachments, attachments };
}

export async function handleResourceAnalysis(
  runtime: IAgentRuntime,
  message: Memory,
  uri: string,
  serverName: string,
  resourceContent: string,
  resourceMeta: string,
  callback?: HandlerCallback
): Promise<void> {
  await createMcpMemory(runtime, message, "resource", serverName, resourceContent, {
    uri,
    isResourceAccess: true,
  });

  const analysisPrompt = createAnalysisPrompt(
    uri,
    message.content.text || "",
    resourceContent,
    resourceMeta
  );

  const analyzedResponse = await generateText({
    runtime: runtime,
    context: analysisPrompt,
    modelClass: ModelClass.SMALL,
  });

  if (callback) {
    await callback({
      text: analyzedResponse,
      thought: `I analyzed the content from the ${uri} resource on ${serverName} and crafted a thoughtful response that addresses the user's request while maintaining my conversational style.`,
      actions: ["READ_MCP_RESOURCE"],
    });
  }
}

export async function handleToolResponse(
  runtime: IAgentRuntime,
  message: Memory,
  serverName: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolOutput: string,
  hasAttachments: boolean,
  attachments: Media[],
  state: State,
  mcpProvider: {
    values: { mcp: unknown };
    data: { mcp: unknown };
    text: string;
  },
  callback?: HandlerCallback
): Promise<void> {
  await createMcpMemory(runtime, message, "tool", serverName, toolOutput, {
    toolName,
    arguments: toolArgs,
    isToolCall: true,
  });

  const reasoningPrompt = createReasoningPrompt(
    state,
    mcpProvider,
    toolName,
    serverName,
    message.content.text || "",
    toolOutput,
    hasAttachments
  );

  logger.info("reasoning prompt: ", reasoningPrompt);

  const reasonedResponse = await generateText({
    runtime: runtime,
    context: reasoningPrompt,
    modelClass: ModelClass.SMALL,
  });

  if (callback) {
    await callback({
      text: reasonedResponse,
      thought: `I analyzed the output from the ${toolName} tool on ${serverName} and crafted a thoughtful response that addresses the user's request while maintaining my conversational style.`,
      actions: ["CALL_MCP_TOOL"],
      attachments: hasAttachments ? attachments : undefined,
    });
  }
}

export async function sendInitialResponse(callback?: HandlerCallback): Promise<void> {
  if (callback) {
    const responseContent: Content = {
      thought:
        "The user is asking for information that can be found in an MCP resource. I will retrieve and analyze the appropriate resource.",
      text: "I'll retrieve that information for you. Let me access the resource...",
      actions: ["READ_MCP_RESOURCE"],
    };
    await callback(responseContent);
  }
}

function createAnalysisPrompt(
  uri: string,
  userMessage: string,
  resourceContent: string,
  resourceMeta: string
): string {
  const enhancedState = {
    data: {},
    text: "",
    values: {
      uri,
      userMessage,
      resourceContent,
      resourceMeta,
    },
  } as unknown as State;

  return composePromptFromState({
    state: enhancedState,
    template: resourceAnalysisTemplate,
  });
}

function createReasoningPrompt(
  state: State,
  mcpProvider: {
    values: { mcp: unknown };
    data: { mcp: unknown };
    text: string;
  },
  toolName: string,
  serverName: string,
  userMessage: string,
  toolOutput: string,
  hasAttachments: boolean
): string {
  const enhancedState: State = {
    ...state,
    values: {
      ...(state.values as any),
      mcpProvider,
      toolName,
      serverName,
      userMessage,
      toolOutput,
      hasAttachments,
    },
  };

  return composePromptFromState({
    state: enhancedState,
    template: toolReasoningTemplate,
  });
}
