import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { createClient } from '../../supabase/server'

// Email tool schemas
const SearchEmailsArgsSchema = z.object({
  query: z.string().describe('Search query for emails'),
  maxResults: z.number().optional().default(20).describe('Maximum number of results'),
  provider: z.enum(['gmail', 'microsoft']).optional().describe('Specific provider to search'),
})

const GetEmailArgsSchema = z.object({
  emailId: z.string().describe('ID of the email to retrieve'),
  provider: z.enum(['gmail', 'microsoft']).describe('Email provider'),
})

const ComposeEmailArgsSchema = z.object({
  to: z.string().describe('Recipient email address'),
  subject: z.string().describe('Email subject'),
  body: z.string().describe('Email body content'),
  provider: z.enum(['gmail', 'microsoft']).optional().describe('Provider to send from'),
})

const SummarizeEmailsArgsSchema = z.object({
  emailIds: z.array(z.string()).describe('Array of email IDs to summarize'),
  provider: z.enum(['gmail', 'microsoft']).describe('Email provider'),
})

class EmailMCPServer {
  private server: Server
  private userId: string

  constructor(userId: string) {
    this.userId = userId
    this.server = new Server(
      {
        name: 'email-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.setupToolHandlers()
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_emails',
            description: 'Search for emails across connected accounts',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for emails',
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum number of results (default: 20)',
                  default: 20,
                },
                provider: {
                  type: 'string',
                  enum: ['gmail', 'microsoft'],
                  description: 'Specific provider to search (optional)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_email',
            description: 'Get detailed content of a specific email',
            inputSchema: {
              type: 'object',
              properties: {
                emailId: {
                  type: 'string',
                  description: 'ID of the email to retrieve',
                },
                provider: {
                  type: 'string',
                  enum: ['gmail', 'microsoft'],
                  description: 'Email provider',
                },
              },
              required: ['emailId', 'provider'],
            },
          },
          {
            name: 'compose_email',
            description: 'Compose and send an email',
            inputSchema: {
              type: 'object',
              properties: {
                to: {
                  type: 'string',
                  description: 'Recipient email address',
                },
                subject: {
                  type: 'string',
                  description: 'Email subject',
                },
                body: {
                  type: 'string',
                  description: 'Email body content',
                },
                provider: {
                  type: 'string',
                  enum: ['gmail', 'microsoft'],
                  description: 'Provider to send from (optional)',
                },
              },
              required: ['to', 'subject', 'body'],
            },
          },
          {
            name: 'summarize_emails',
            description: 'Get a summary of multiple emails',
            inputSchema: {
              type: 'object',
              properties: {
                emailIds: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of email IDs to summarize',
                },
                provider: {
                  type: 'string',
                  enum: ['gmail', 'microsoft'],
                  description: 'Email provider',
                },
              },
              required: ['emailIds', 'provider'],
            },
          },
        ],
      }
    })

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'search_emails':
          return await this.handleSearchEmails(request.params.arguments)
        case 'get_email':
          return await this.handleGetEmail(request.params.arguments)
        case 'compose_email':
          return await this.handleComposeEmail(request.params.arguments)
        case 'summarize_emails':
          return await this.handleSummarizeEmails(request.params.arguments)
        default:
          throw new Error(`Unknown tool: ${request.params.name}`)
      }
    })
  }

  private async getEmailAccounts() {
    const supabase = await createClient()
    const { data: accounts, error } = await supabase.rpc('get_user_email_accounts', {
      p_user_id: this.userId
    })
    
    if (error) {
      throw new Error(`Failed to get email accounts: ${error.message}`)
    }
    
    return accounts || []
  }

  private async refreshTokenIfNeeded(account: any) {
    const now = new Date()
    const expiresAt = new Date(account.expires_at)
    
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      const supabase = await createClient()
      
      if (account.provider === 'gmail') {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: account.refresh_token,
            grant_type: 'refresh_token',
          }),
        })
        
        const tokens = await tokenResponse.json()
        if (tokenResponse.ok) {
          await supabase.rpc('upsert_email_account', {
            p_user_id: this.userId,
            p_provider: account.provider,
            p_email: account.email,
            p_access_token: tokens.access_token,
            p_refresh_token: account.refresh_token,
            p_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            p_account_data: account.account_data
          })
          
          return tokens.access_token
        }
      }
    }
    
    return account.access_token
  }

  private async handleSearchEmails(args: any) {
    try {
      const { query, maxResults, provider } = SearchEmailsArgsSchema.parse(args)
      const accounts = await this.getEmailAccounts()
      
      const filteredAccounts = provider 
        ? accounts.filter((acc: any) => acc.provider === provider)
        : accounts

      if (filteredAccounts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No email accounts connected or no accounts match the specified provider.',
            },
          ],
        }
      }

      const emailPromises = filteredAccounts.map(async (account: any) => {
        try {
          const accessToken = await this.refreshTokenIfNeeded(account)
          
          if (account.provider === 'gmail') {
            return await this.searchGmailEmails(accessToken, query, maxResults)
          } else if (account.provider === 'microsoft') {
            return await this.searchMicrosoftEmails(accessToken, query, maxResults)
          }
          return []
        } catch (error) {
          console.error(`Error searching ${account.provider}:`, error)
          return []
        }
      })

      const emailResults = await Promise.all(emailPromises)
      const allEmails = emailResults.flat()
      
      // Sort by date (newest first)
      allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              emails: allEmails.slice(0, maxResults),
              total: allEmails.length,
              query: query,
              providers: filteredAccounts.map((acc: any) => acc.provider),
            }, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching emails: ${error}`,
          },
        ],
        isError: true,
      }
    }
  }

  private async searchGmailEmails(accessToken: string, query: string, maxResults: number) {
    const searchQuery = query || 'in:inbox'
    const searchResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${maxResults}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )
    
    if (!searchResponse.ok) {
      throw new Error('Failed to search Gmail messages')
    }
    
    const searchResults = await searchResponse.json()
    
    if (!searchResults.messages) {
      return []
    }
    
    const emailPromises = searchResults.messages.map(async (message: any) => {
      const detailResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      )
      
      if (detailResponse.ok) {
        const detail = await detailResponse.json()
        const headers = detail.payload.headers
        
        return {
          id: detail.id,
          threadId: detail.threadId,
          subject: headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject',
          from: headers.find((h: any) => h.name === 'From')?.value || 'Unknown',
          to: headers.find((h: any) => h.name === 'To')?.value || '',
          date: headers.find((h: any) => h.name === 'Date')?.value || '',
          snippet: detail.snippet,
          labelIds: detail.labelIds,
          provider: 'gmail'
        }
      }
      return null
    })
    
    const emails = await Promise.all(emailPromises)
    return emails.filter(email => email !== null)
  }

  private async searchMicrosoftEmails(accessToken: string, query: string, maxResults: number) {
    let url = `https://graph.microsoft.com/v1.0/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc`
    
    if (query) {
      url += `&$search="${encodeURIComponent(query)}"`
    }
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch Microsoft emails')
    }
    
    const data = await response.json()
    
    return data.value.map((email: any) => ({
      id: email.id,
      subject: email.subject,
      from: email.from?.emailAddress?.address || 'Unknown',
      to: email.toRecipients?.map((r: any) => r.emailAddress.address).join(', ') || '',
      date: email.receivedDateTime,
      snippet: email.bodyPreview,
      isRead: email.isRead,
      provider: 'microsoft'
    }))
  }

  private async handleGetEmail(args: any) {
    // Implementation for getting detailed email content
    return {
      content: [
        {
          type: 'text',
          text: 'Email detail retrieval not yet implemented',
        },
      ],
    }
  }

  private async handleComposeEmail(args: any) {
    try {
      const { to, subject, body, provider } = ComposeEmailArgsSchema.parse(args)
      const accounts = await this.getEmailAccounts()
      
      // Filter accounts by provider if specified, otherwise use the first available
      const filteredAccounts = provider 
        ? accounts.filter((acc: any) => acc.provider === provider)
        : accounts

      if (filteredAccounts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: provider 
                ? `No ${provider} account connected.`
                : 'No email accounts connected.',
            },
          ],
          isError: true,
        }
      }

      // Use the first available account
      const account = filteredAccounts[0]
      const accessToken = await this.refreshTokenIfNeeded(account)

      let result
      if (account.provider === 'gmail') {
        result = await this.sendGmailEmail(accessToken, to, subject, body)
      } else if (account.provider === 'microsoft') {
        result = await this.sendMicrosoftEmail(accessToken, to, subject, body)
      } else {
        throw new Error(`Unsupported email provider: ${account.provider}`)
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Email sent successfully',
              provider: account.provider,
              to: to,
              subject: subject,
              messageId: result.messageId,
            }, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error sending email: ${error}`,
          },
        ],
        isError: true,
      }
    }
  }

  private async sendGmailEmail(accessToken: string, to: string, subject: string, body: string) {
    // Create RFC 2822 formatted email
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      body
    ].join('\r\n')

    // Base64 encode the email (URL-safe)
    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodedEmail
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Gmail API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const result = await response.json()
    return {
      messageId: result.id,
      threadId: result.threadId
    }
  }

  private async sendMicrosoftEmail(accessToken: string, to: string, subject: string, body: string) {
    const emailData = {
      message: {
        subject: subject,
        body: {
          contentType: 'HTML',
          content: body
        },
        toRecipients: [
          {
            emailAddress: {
              address: to
            }
          }
        ]
      }
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Microsoft Graph API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    // Microsoft Graph sendMail returns 202 with no body for success
    return {
      messageId: 'sent', // Microsoft doesn't return a message ID for sent emails
    }
  }

  private async handleSummarizeEmails(args: any) {
    // Implementation for summarizing emails
    return {
      content: [
        {
          type: 'text',
          text: 'Email summarization not yet implemented',
        },
      ],
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Email MCP server running on stdio')
  }
}

export { EmailMCPServer } 