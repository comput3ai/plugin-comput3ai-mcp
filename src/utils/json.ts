import Ajv from "ajv";
import JSON5 from "json5";

export function parseJSON<T>(input: string): T {
  const cleanedInput = input.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  return JSON5.parse(cleanedInput);
}

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

export function validateJsonSchema<T = unknown>(
  data: unknown,
  schema: Record<string, unknown>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (!valid) {
      const errors = (validate.errors || []).map((err) => {
        const path = err.instancePath ? `${err.instancePath.replace(/^\//, "")}` : "value";
        return `${path}: ${err.message}`;
      });

      return { success: false, error: errors.join(", ") };
    }

    return { success: true, data: data as T };
  } catch (error) {
    return {
      success: false,
      error: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
