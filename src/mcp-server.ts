#!/usr/bin/env node

import { EmailMCPServer } from './lib/email-mcp-server.js'

async function main() {
  // Get user ID from environment variable or command line argument
  const userId = process.env.MCP_USER_ID || process.argv[2]
  
  if (!userId) {
    console.error('Error: User ID is required')
    console.error('Usage: node mcp-server.js <user-id>')
    console.error('Or set MCP_USER_ID environment variable')
    process.exit(1)
  }

  console.error(`Starting Email MCP server for user: ${userId}`)
  
  const server = new EmailMCPServer(userId)
  await server.run()
}

// Handle cleanup
process.on('SIGINT', () => {
  console.error('Shutting down Email MCP server...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.error('Shutting down Email MCP server...')
  process.exit(0)
})

main().catch((error) => {
  console.error('Failed to start MCP server:', error)
  process.exit(1)
}) 