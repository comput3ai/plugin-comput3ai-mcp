import type { State } from "@elizaos/core";
import { elizaLogger as logger } from "@elizaos/core";
import Ajv from "ajv";
import ajvErrors from "ajv-errors";
import { calculatorToolSelectionTemplate } from "../templates/calculatorToolSelectionTemplate";
import { weatherToolSelectionTemplate } from "../templates/weatherToolSelectionTemplate";
import { ResourceSelectionSchema, ToolSelectionSchema } from "../types";

const ajv = new Ajv({ allErrors: true });
ajvErrors(ajv);

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

export interface McpProviderData {
  text: string;
  values: Record<string, any>;
  data: Record<string, any>;
}

export function validateToolSelection(
  data: unknown,
  state?: State
): { success: true; data: ToolSelection } | { success: false; error: string } {
  let parsedInput: any = null;

  try {
    if (typeof data === 'string') {
      // Extract JSON from a code block if present
      const jsonMatch = data.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : data;
      parsedInput = JSON.parse(jsonString);
    } else {
      // If it's already an object, use it directly
      parsedInput = data;
    }
  } catch (e) {
    const errorMsg = `Failed to parse JSON from tool selection response: ${e}`;
    logger.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  const validate = ajv.compile(ToolSelectionSchema);
  const valid = validate(parsedInput);

  if (!valid) {
    const errors = validate.errors;
    const errorMsg = `Tool selection validation failed: ${JSON.stringify(errors, null, 2)}`;
    logger.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  return { success: true, data: parsedInput as ToolSelection };
}

export function validateResourceSelection(
  data: unknown
): { success: true; data: ResourceSelection } | { success: false; error: string } {
  let parsedInput: any = null;

  try {
    if (typeof data === 'string') {
      // Clean up input in case it has code blocks or other formatting
      const cleanedInput = data.replace(/```json|```/g, "").trim();
      parsedInput = JSON.parse(cleanedInput);
    } else {
      // If it's already an object, use it directly
      parsedInput = data;
    }
  } catch (e) {
    const errorMsg = `Failed to parse JSON from resource selection response: ${e}`;
    logger.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  const validate = ajv.compile(ResourceSelectionSchema);
  const valid = validate(parsedInput);

  if (!valid) {
    const errors = validate.errors;
    const errorMsg = `Resource selection validation failed: ${JSON.stringify(errors, null, 2)}`;
    logger.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  return { success: true, data: parsedInput as ResourceSelection };
}

export function createToolSelectionFeedbackPrompt(
  originalResponse: string,
  errorMessage: string,
  state: State & { mcpProvider?: { text?: string } },
  userMessage: string
): string {
  // Check if this might be a calculator request
  const calculatorRegex = /\b(\d+\s*[\+\-\*\/\(\)\^\%]\s*\d+|\bsum\b|\bcalculate\b|\bcompute\b|\bsolve\b|\bdivide\b|\bmultiply\b|\badd\b|\bsubtract\b)/i;
  const isCalculationRequest = calculatorRegex.test(userMessage);
  
  // Check if this might be a weather request
  const weatherRegex = /\b(weather|temperature|forecast|rain|sunny|cloudy|humidity|wind|climate|cold|hot|warm|chilly)\b.*?\b(in|at|for|of)\b.*?\b([A-Z][a-z]+ ?[A-Z]?[a-z]*|[A-Z]{2,})\b/i;
  const isWeatherRequest = weatherRegex.test(userMessage);
  
  if (isCalculationRequest) {
    // For calculation requests, use the specialized calculator template
    return calculatorToolSelectionTemplate
      .replace("{{userMessage}}", userMessage)
      .replace("{{mcpProvider.text}}", state.mcpProvider?.text || "");
  } else if (isWeatherRequest) {
    // For weather requests, use the specialized weather template
    return weatherToolSelectionTemplate
      .replace("{{userMessage}}", userMessage)
      .replace("{{mcpProvider.text}}", state.mcpProvider?.text || "");
  } else {
    // For other requests, use a generic template with error feedback
    return `
Your previous tool selection response had errors: ${errorMessage}

User request: ${userMessage}

Available MCP tools:
${state.mcpProvider?.text || "No tools available"}

Please analyze the user request and select the most appropriate tool, or indicate that no tool is suitable.
Respond with valid JSON (no code block formatting) like:

{
  "serverName": "n8n",
  "toolName": "calculator",
  "arguments": { 
    "input": "2+2"
  },
  "reasoning": "The user wants to calculate 2+2"
}

Or if no tool is suitable:

{
  "noToolAvailable": true,
  "reasoning": "The user is asking a general question that doesn't require a specialized tool"
}
`;
  }
}

export function createResourceSelectionFeedbackPrompt(
  originalResponse: string,
  errorMessage: string,
  state: State & { mcpProvider?: { text?: string } },
  userMessage: string
): string {
  return `
Your previous resource selection response had errors: ${errorMessage}

User request: ${userMessage}

Available MCP resources:
${state.mcpProvider?.text || "No resources available"}

Please analyze the user request and select the most appropriate resource, or indicate that no resource is suitable.
Respond with valid JSON (no code block formatting or comments) like:

{
  "serverName": "github",
  "uri": "github://elizaos/eliza/README.md",
  "reasoning": "The user wants information about the Eliza project which is in the README"
}

Or if no resource is suitable:

{
  "noResourceAvailable": true,
  "reasoning": "The user is asking a question that doesn't match any available resource"
}
`;
}
