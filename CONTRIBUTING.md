# Contributing to PostMCP AI MCP Server

Thank you for considering contributing to the official PostMCP AI Model Context Protocol (MCP) Server! We welcome bug reports, feature requests, pull requests, and feedback.

---

## Code of Conduct

Please be respectful and constructive in all interactions, issues, and pull requests.

---

## Project Architecture Overview

The codebase is organized modularly inside the `src/` directory:

```
mcp-server/
├── bin/
│   └── cli.js            # Executable CLI entry point
├── src/
│   ├── config.js         # Environment & default configuration
│   ├── client.js         # Backend API client & API key extraction helpers
│   ├── tools/
│   │   ├── definitions.js# MCP tool JSON schemas & descriptions
│   │   ├── handlers.js   # MCP tool execution handlers
│   │   └── index.js      # Tools aggregator
│   ├── server.js         # MCP Server instance factory
│   ├── routes/
│   │   ├── oauth.js      # OAuth 2.0 & RFC 9728 discovery endpoints
│   │   ├── openapi.js    # OpenAPI 3.0 schema & ChatGPT Custom GPT endpoints
│   │   ├── mcpHttp.js    # MCP Streamable HTTP transport (/mcp)
│   │   └── health.js     # Health check & status endpoints
│   ├── app.js            # Express application builder
│   └── index.js          # Library export entry point
├── index.js              # Root executable wrapper
├── package.json
└── README.md
```

---

## Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/postmcpai/postmcp-mcp-server.git
   cd postmcp-mcp-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set environment variables:**
   Copy `.env.example` to `.env` and populate your development API key:
   ```bash
   cp .env.example .env
   ```

4. **Run in Stdio Mode:**
   ```bash
   npm start
   ```

5. **Run in Remote HTTP / SSE Mode:**
   ```bash
   npm run start:sse
   ```

---

## Adding a New MCP Tool

To add a new tool to the MCP server:

1. **Define the tool schema** in [`src/tools/definitions.js`](src/tools/definitions.js).
2. **Implement the execution logic** in [`src/tools/handlers.js`](src/tools/handlers.js).
3. **If supporting ChatGPT Actions**, update the OpenAPI schema and action routes in [`src/routes/openapi.js`](src/routes/openapi.js).
4. **Update documentation** in [`README.md`](README.md).

---

## Pull Request Guidelines

1. **Fork the repo** and create your branch from `main`.
2. Ensure your changes preserve backward compatibility with all transport modes (Stdio & HTTP).
3. Ensure no `console.log` statements are added without redirecting to `console.error` (stdout is reserved for JSON-RPC in stdio mode).
4. Submit a descriptive Pull Request explaining the rationale for your changes.

---

## License

By contributing to this repository, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
