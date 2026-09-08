/**
 * Translation between variable values and their wire representation.
 *
 * The API stores signed 64-bit integers but transports them as JSON strings,
 * since a JSON number loses everything past 2^53. Only the fields that carry
 * values are touched — a `value` key, or an entry of a `variables` map — so
 * identifiers that merely look numeric stay strings.
 */

const INTEGER_TEXT = /^-?\d+$/;

/** Renders a whole number as text; anything else passes through for validation. */
function toWireText(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value.toString();
  }
  return value;
}

/** Rewrites the variable values of a request body into their wire form. */
export function encodeVariableValues(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(encodeVariableValues);
  }
  if (node === null || typeof node !== "object") {
    return node;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "value") {
      result[key] = toWireText(value);
    } else if (key === "variables" && value !== null && typeof value === "object") {
      result[key] = encodeVariableMap(value as Record<string, unknown>);
    } else {
      result[key] = encodeVariableValues(value);
    }
  }
  return result;
}

/** Rewrites a `variables` map, preserving the `null` that deletes an entry. */
function encodeVariableMap(map: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(map)) {
    result[name] = value === null ? null : toWireText(value);
  }
  return result;
}

/** Parses the variable values of a response body back into `bigint`. */
export function decodeVariableValues<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map((item) => decodeVariableValues(item)) as T;
  }
  if (node === null || typeof node !== "object") {
    return node;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "value" && typeof value === "string" && INTEGER_TEXT.test(value)) {
      result[key] = BigInt(value);
    } else {
      result[key] = decodeVariableValues(value);
    }
  }
  return result as T;
}
