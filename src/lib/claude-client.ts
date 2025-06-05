import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '../../supabase/server'

interface EmailContext {
  userId: string
  connectedProviders: string[]
  accountCount: number
}

class ClaudeEmailClient {
  private anthropic: Anthropic
  
  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required')
    }
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  async getEmailContext(userId: string): Promise<EmailContext> {
    const supabase = await createClient()
    const { data: accounts, error } = await supabase.rpc('get_user_email_accounts', {
      p_user_id: userId
    })
    
    if (error) {
      throw new Error(`Failed to get email accounts: ${error.message}`)
    }
    
    return {
      userId,
      connectedProviders: accounts?.map((acc: any) => acc.provider) || [],
      accountCount: accounts?.length || 0
    }
  }

  async searchEmails(userId: string, query: string, maxResults = 20, provider?: 'gmail' | 'microsoft') {
    const supabase = await createClient()
    const { data: accounts, error } = await supabase.rpc('get_user_email_accounts', {
      p_user_id: userId
    })
    
    if (error || !accounts || accounts.length === 0) {
      return {
        emails: [],
        message: 'No email accounts connected'
      }
    }
    
    const filteredAccounts = provider 
      ? accounts.filter((acc: any) => acc.provider === provider)
      : accounts

    // Use the existing email search logic
    const emailPromises = filteredAccounts.map(async (account: any) => {
      try {
        const accessToken = await this.refreshTokenIfNeeded(account, userId)
        
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
      emails: allEmails.slice(0, maxResults),
      total: allEmails.length,
      accounts: filteredAccounts.map((acc: any) => ({
        provider: acc.provider,
        email: acc.email,
        connected: true
      }))
    }
  }

  private async refreshTokenIfNeeded(account: any, userId: string) {
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
            p_user_id: userId,
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

  async generateResponse(userMessage: string, userId: string, subscription: any): Promise<string> {
    const emailContext = await this.getEmailContext(userId)
    
    // Determine if this is an email-related query
    const isEmailQuery = this.isEmailRelatedQuery(userMessage)
    
    if (isEmailQuery && emailContext.accountCount === 0) {
      return this.generateConnectAccountsResponse()
    }

    // Build system prompt with email context
    const systemPrompt = this.buildSystemPrompt(emailContext, subscription)
    
    let contextData = ''
    
    // If email query, fetch relevant emails
    if (isEmailQuery && emailContext.accountCount > 0) {
      try {
        const emailData = await this.getRelevantEmailData(userMessage, userId)
        contextData = this.formatEmailDataForClaude(emailData)
      } catch (error) {
        console.error('Error fetching email data:', error)
        contextData = 'Error: Unable to access email data at this time.'
      }
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: contextData ? `${contextData}\n\nUser request: ${userMessage}` : userMessage
          }
        ]
      })

      return response.content[0].type === 'text' ? response.content[0].text : 'Sorry, I could not generate a response.'
    } catch (error) {
      console.error('Claude API error:', error)
      return 'I apologize, but I encountered an error while processing your request. Please try again.'
    }
  }

  private isEmailRelatedQuery(message: string): boolean {
    const emailKeywords = [
      'email', 'emails', 'inbox', 'message', 'messages', 'mail',
      'gmail', 'outlook', 'microsoft', 'search', 'find', 'recent',
      'unread', 'compose', 'send', 'reply', 'forward', 'summarize',
      'summary', 'from', 'to', 'subject', 'thread'
    ]
    
    const lowerMessage = message.toLowerCase()
    return emailKeywords.some(keyword => lowerMessage.includes(keyword))
  }

  private buildSystemPrompt(emailContext: EmailContext, subscription: any): string {
    const { connectedProviders, accountCount } = emailContext
    
    let prompt = `You are an AI email assistant with access to the user's connected email accounts. You can help with email management, search, summarization, and composition.

Connected accounts: ${accountCount}
Providers: ${connectedProviders.join(', ') || 'None'}
Subscription: ${subscription?.price_id === 'basic_plan' ? 'Basic' : 'Premium'}

Capabilities:
- Search and find emails across accounts
- Summarize email content and threads
- Help compose professional emails
- Analyze email patterns and insights
- Organize and manage inbox

Guidelines:
- Always be helpful and professional
- Provide specific, actionable responses
- When showing email data, format it clearly
- Respect user privacy and data security
- If no relevant emails found, suggest alternative searches
`

    if (subscription?.price_id === 'basic_plan') {
      prompt += `
Note: User has Basic plan with limited features:
- Search limited to last 30 days
- Basic summaries only (5 per day)
- Standard search capabilities
`
    }

    return prompt
  }

  private async getRelevantEmailData(userMessage: string, userId: string) {
    const lowerMessage = userMessage.toLowerCase()
    
    // Extract search intent and parameters
    let query = ''
    let maxResults = 10
    
    if (lowerMessage.includes('recent') || lowerMessage.includes('latest')) {
      query = 'in:inbox'
      maxResults = 5
    } else if (lowerMessage.includes('unread')) {
      query = 'is:unread'
    } else if (lowerMessage.includes('from')) {
      // Extract email address or name after "from"
      const fromMatch = userMessage.match(/from\s+([^\s]+)/i)
      if (fromMatch) {
        query = `from:${fromMatch[1]}`
      }
    } else if (lowerMessage.includes('about') || lowerMessage.includes('subject')) {
      // Extract topic after "about" or "subject"
      const aboutMatch = userMessage.match(/(?:about|subject)\s+([^.!?]+)/i)
      if (aboutMatch) {
        query = aboutMatch[1].trim()
      }
    } else {
      // General search - extract key terms
      const words = userMessage.split(' ').filter(word => 
        word.length > 3 && !['email', 'emails', 'show', 'find', 'search'].includes(word.toLowerCase())
      )
      query = words.slice(0, 3).join(' ')
    }

    return await this.searchEmails(userId, query, maxResults)
  }

  private formatEmailDataForClaude(emailData: any): string {
    if (!emailData.emails || emailData.emails.length === 0) {
      return 'Email context: No emails found matching the criteria.'
    }

    const emailSummaries = emailData.emails.map((email: any, index: number) => {
      return `Email ${index + 1}:
Subject: ${email.subject}
From: ${email.from}
Date: ${new Date(email.date).toLocaleDateString()}
Preview: ${email.snippet}
Provider: ${email.provider}
---`
    }).join('\n')

    return `Email context (${emailData.emails.length} emails found):
${emailSummaries}

Note: This is real email data from the user's connected accounts (${emailData.accounts?.map((acc: any) => acc.email).join(', ')}).`
  }

  private generateConnectAccountsResponse(): string {
    return `🔗 **Connect Your Email Account First**

To use email features, you need to connect your email accounts first.

**Available providers:**
• Gmail (Google)
• Microsoft Outlook

**What you can do once connected:**
• Search and read emails
• Compose and send emails  
• Get AI-powered summaries
• Email insights and analytics

Click the "⚙️ Manage Accounts" button in the header to get started!`
  }
}

export { ClaudeEmailClient } 