import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import {McpServer} from "@modelcontextprotocol/server";
import {StdioServerTransport} from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./server.ts";
import cors from 'cors';
import type { Request, Response } from 'express';

/**
 * Starts an mcp server with streamable http transport in stateles mode
 * @param createMcpServer - main function that creates a new mcpserver instance per request
 */

export async function startStreamableHTTPServer (createMcpServer: () => McpServer,): Promise<void> {
    const port = parseInt(process.env.PORT ?? '3001', 10);
    const app = createMcpExpressApp({ host: '0.0.0.0' });
    app.use(cors());

    app.all('/mcp', async (req: Request, res: Response) => {
        const server = createMcpServer();
        const transport = new NodeStreamableHTTPServerTransport({sessionIdGenerator: undefined, });

        res.on('close', () => {
            transport.close().catch(() => {});
            server.close().catch(() => {});
        });

        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('MCP error:', error);
            if (!res.headersSent){
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: null,
                });
            }
        }
    });

    const httpServer = app.listen(port, (err) => {
        if (err) {
            console.error('Failed to start server:', err);
            process.exit(1);
        }
        console.log(`MCP server listening on http://localhost:${port}/mcp`);
    });

    const shutdown = () => {
        console.log('\nShutting down server...');
        httpServer.close(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
} 

export async function startStdioServer(createMcpServer: () => McpServer): Promise<void> {
        await createMcpServer().connect(new StdioServerTransport());
    }

async function main() {
    if (process.argv.includes('--stdio')) {
        await startStdioServer(createMcpServer);
    } else {
        await startStreamableHTTPServer(createMcpServer);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});