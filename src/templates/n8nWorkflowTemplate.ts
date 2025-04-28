import type { ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Define the input schema using Zod
const N8nWorkflowInputSchema = z.object({
  workflowId: z.string().describe("The ID or name of the n8n workflow to trigger."),
  inputData: z.record(z.unknown()).optional().describe("Optional JSON data to pass as input to the workflow."),
});

// Define the output schema using Zod
const N8nWorkflowOutputSchema = z.object({
  success: z.boolean().describe("Indicates if the workflow trigger was accepted."),
  executionId: z.string().optional().describe("The execution ID if the workflow started successfully."),
  message: z.string().optional().describe("A status message from n8n."),
});

export const n8nWorkflowTemplate: ResourceTemplate = {
  // Use uriTemplate instead of uri
  uriTemplate: "mcp://n8n/workflows/{workflowId}",

  // Metadata
  name: "Trigger n8n Workflow",
  description: "Triggers a specific n8n workflow, optionally passing input data. Returns the success status and execution details.",
  iconUri: "https://raw.githubusercontent.com/n8n-io/n8n/master/packages/design-system/assets/logo-icon.svg", // Example icon

  // Input schema definition
  inputSchema: N8nWorkflowInputSchema,

  // Output schema definition
  outputSchema: N8nWorkflowOutputSchema,

  // Example usage (optional)
  // examples: [
  //   {
  //     name: "Trigger Marketing Campaign",
  //     input: { workflowId: "marketing-campaign-123", inputData: { customerId: "cust_abc" } },
  //     output: { success: true, executionId: "exec_xyz", message: "Workflow started." }
  //   }
  // ],
}; 