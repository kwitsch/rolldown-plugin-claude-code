import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "fixture", version: "0.0.0" });
server.registerTool("ping", { description: "Replies with pong." }, () => ({
  content: [{ type: "text", text: "pong" }],
}));
await server.connect(new StdioServerTransport());
