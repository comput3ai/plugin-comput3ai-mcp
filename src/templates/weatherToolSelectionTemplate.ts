/**
 * Specific prompt template to guide LLM selection for the weather tool.
 */
export const weatherToolSelectionTemplate = `
User Request:
{{userMessage}}

Available Tools:
{{mcpProvider.text}} 
// Look specifically for the 'weather' tool description above.

Task:
Analyze the user request. If the request involves getting weather information for a location, select the weather tool.
Otherwise, indicate that no specific tool is suitable for this request.

Output Format:
Respond with a JSON object in a markdown code block like this:
\`\`\`json
{
  "serverName": "<name_of_server_with_weather>", // e.g., "n8n"
  "toolName": "weather",
  "arguments": {
    "location": "<location_string>" // Extract the exact location here
  },
  "reasoning": "<brief_explanation_for_choosing_weather>"
}
\`\`\`

If the weather tool is NOT suitable for the user's request, respond with:
\`\`\`json
{
  "noToolAvailable": true,
  "reasoning": "<brief_explanation_why_no_tool_is_suitable>"
}
\`\`\`

Ensure the "location" argument for the weather tool contains only the valid location string from the user request.
`; 