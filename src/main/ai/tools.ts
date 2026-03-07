import type Anthropic from "@anthropic-ai/sdk";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "navigate",
    description: "Navigate the browser to a URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL to navigate to" },
      },
      required: ["url"],
    },
  },
  {
    name: "go_back",
    description: "Go back to the previous page in browser history.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "go_forward",
    description: "Go forward in browser history.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "reload",
    description: "Reload the current page.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "click",
    description:
      "Click an element on the page. Use the element index from the page content listing, or a CSS selector.",
    input_schema: {
      type: "object" as const,
      properties: {
        index: {
          type: "number",
          description: "The element index number from the page content",
        },
        selector: {
          type: "string",
          description: "CSS selector as fallback if index is not available",
        },
      },
    },
  },
  {
    name: "type_text",
    description:
      "Type text into an input field or textarea. Clears existing content first.",
    input_schema: {
      type: "object" as const,
      properties: {
        index: { type: "number", description: "The element index number" },
        selector: { type: "string", description: "CSS selector as fallback" },
        text: { type: "string", description: "The text to type" },
      },
      required: ["text"],
    },
  },
  {
    name: "scroll",
    description: "Scroll the page up or down.",
    input_schema: {
      type: "object" as const,
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down"],
          description: "Scroll direction",
        },
        amount: {
          type: "number",
          description: "Pixels to scroll (default 500)",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "read_page",
    description:
      "Re-read the current page content. Use after navigation or interaction to see updated content.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];
