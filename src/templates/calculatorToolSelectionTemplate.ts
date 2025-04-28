/**
 * Specific prompt template to guide LLM selection for the calculator tool.
 */
export const calculatorToolSelectionTemplate = `
User Request:
{{userMessage}}

Available Tools:
{{mcpProvider.text}} 
// Look specifically for the 'calculator' tool description above.

Task:
Analyze the user request. If the request involves a mathematical calculation that the 'calculator' tool can handle, select that tool.
Otherwise, indicate that no specific tool is suitable for this request.

Output Format:
Respond with a JSON object in a markdown code block like this:
\`\`\`json
{
  "serverName": "<name_of_server_with_calculator>", // e.g., "n8n"
  "toolName": "calculator",
  "arguments": {
    "input": "<mathematical_expression_string>" // Extract the exact math expression here
  },
  "reasoning": "<brief_explanation_for_choosing_calculator>"
}
\`\`\`

If the calculator tool is NOT suitable for the user's request, respond with:
\`\`\`json
{
  "noToolAvailable": true,
  "reasoning": "<brief_explanation_why_no_tool_is_suitable>"
}
\`\`\`

Ensure the "input" argument for the calculator contains only the valid mathematical expression string from the user request.
`; 