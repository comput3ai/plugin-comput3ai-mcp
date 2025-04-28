import type { ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Define the input schema for the weather resource
const WeatherInputSchema = z.object({
  location: z.string().describe("The city name or location to get weather information for (e.g., \"San Francisco\", \"New York\")."),
  units: z.enum(["metric", "imperial"]).optional().describe("The measurement units to use. 'metric' for Celsius or 'imperial' for Fahrenheit. Defaults to metric."),
});

// Define the output schema for the weather resource
const WeatherOutputSchema = z.object({
  location: z.string().describe("The location name as recognized by the weather service."),
  temperature: z.number().describe("The current temperature in the requested units."),
  condition: z.string().describe("Text description of current weather conditions (e.g., 'Sunny', 'Cloudy', 'Rain')."),
  humidity: z.number().optional().describe("Humidity percentage, from 0-100."),
  windSpeed: z.number().optional().describe("Wind speed in km/h or mph depending on the units."),
  forecast: z.array(
    z.object({
      date: z.string().describe("The date for this forecast entry."),
      temperature: z.object({
        min: z.number().describe("Minimum temperature for the day."),
        max: z.number().describe("Maximum temperature for the day."),
      }),
      condition: z.string().describe("Weather condition for the day."),
    })
  ).optional().describe("Optional upcoming weather forecast."),
});

// Define the ResourceTemplate
export const weatherResourceTemplate: ResourceTemplate = {
  // Unique URI Template for this synthesized resource
  uriTemplate: "mcp://n8n/synthetic/weather/{location}", 

  // Metadata
  name: "Weather Information Resource",
  description: "Retrieves current weather information and optional forecast for a specified location.",
  iconUri: "https://cdn-icons-png.flaticon.com/512/1163/1163661.png", // Example weather icon

  // Input schema definition
  inputSchema: WeatherInputSchema,

  // Output schema definition
  outputSchema: WeatherOutputSchema,

  // Example usage
  examples: [
    {
      name: "Weather in San Francisco",
      input: { location: "San Francisco", units: "metric" },
      output: { 
        location: "San Francisco, CA, USA",
        temperature: 18.5,
        condition: "Partly Cloudy",
        humidity: 72,
        windSpeed: 12,
        forecast: [
          {
            date: "2025-04-29",
            temperature: { min: 15, max: 21 },
            condition: "Sunny"
          },
          {
            date: "2025-04-30",
            temperature: { min: 14, max: 20 },
            condition: "Cloudy"
          }
        ]
      }
    }
  ],
}; 