import type { ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Define the input schema for the calculator resource
const CalculatorInputSchema = z.object({
  expression: z.string().describe("The mathematical expression string to evaluate (e.g., \"2+2*10\")."),
});

// Define the output schema for the calculator resource
const CalculatorOutputSchema = z.object({
  result: z.union([z.number(), z.string()]).describe("The numerical result of the calculation or an error message string."),
});

// Define the ResourceTemplate
export const calculatorResourceTemplate: ResourceTemplate = {
  // Unique URI Template for this synthesized resource
  uriTemplate: "mcp://n8n/synthetic/calculator", // Use a distinct path

  // Metadata
  name: "Calculator Resource",
  description: "Evaluates a mathematical expression string using the n8n calculator tool, accessed via resource interface.",
  iconUri: "", // Add an icon URL if desired

  // Input schema definition
  inputSchema: CalculatorInputSchema,

  // Output schema definition
  outputSchema: CalculatorOutputSchema,

  // Example (optional)
  // examples: [
  //   {
  //     name: "Calculate 2 plus 2",
  //     input: { expression: "2+2" },
  //     output: { result: 4 }
  //   },
  //   {
  //     name: "Invalid Expression",
  //     input: { expression: "2+/2" },
  //     output: { result: "Error: Invalid expression" } // Example error output
  //   }
  // ],
}; 