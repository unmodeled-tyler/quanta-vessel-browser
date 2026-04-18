export function assertString(
  value: unknown,
  name: string,
): asserts value is string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
}

export function assertOptionalString(
  value: unknown,
  name: string,
): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
}

export function assertNumber(
  value: unknown,
  name: string,
): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${name} must be a number`);
  }
}

export type SendToRendererViews = (
  channel: string,
  ...args: unknown[]
) => void;
