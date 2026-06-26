const fs = require('fs');

let appTs = fs.readFileSync('src/app.ts', 'utf8');

// replace descriptions correctly
appTs = appTs.replace(
  /description: 'Register an MCP server to monitor\. Supports http, sse, and stdio transports\.',/g,
  "description: 'Register an MCP server to monitor. Accepts HTTP, SSE, and stdio servers.',"
);

appTs = appTs.replace(
  /description:\s*'Check the health of a registered MCP server, list tools, and measure response time\.',/g,
  "description: 'Check the health of a registered MCP server, list tools, and measure response time. Returns detailed connection info.',"
);

appTs = appTs.replace(
  /description: 'Check health of all registered MCP servers in parallel\.',/g,
  "description: 'Check health of all registered MCP servers in parallel. Useful for system-wide diagnostic.',"
);

fs.writeFileSync('src/app.ts', appTs);
