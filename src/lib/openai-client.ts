import OpenAI from 'openai'
import { createClient } from '../../supabase/server'

interface EmailContext {
  userId: string
  connectedProviders: string[]
  accountCount: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

class OpenAIEmailClient {
  private openai: OpenAI
  
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
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

  private async sendEmail(userId: string, to: string, subject: string, body: string, provider?: 'gmail' | 'microsoft') {
    // Get the base URL from environment variable or default to localhost
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    const response = await fetch(`${baseUrl}/api/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        body,
        provider
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to send email')
    }

    return await response.json()
  }

  async generateResponse(userMessage: string, userId: string, subscription: any, conversationHistory: Message[] = []): Promise<string> {
    // Get email context
    const emailContext = await this.getEmailContext(userId)
    
    // Check if this is a confirmation message
    const isConfirmation = userMessage.toLowerCase().trim() === 'yes' || userMessage.toLowerCase().trim() === 'confirm'
    
    if (isConfirmation) {
      // Look for the last assistant message in the conversation history
      const lastAssistantMessage = [...conversationHistory].reverse()
        .find(msg => msg.role === 'assistant')?.content

      if (!lastAssistantMessage) {
        return "I don't see any email to confirm sending. Please try composing your email again."
      }

      // Get user's email accounts
      const supabase = await createClient()
      const { data: accounts, error: accountsError } = await supabase.rpc('get_user_email_accounts', {
        p_user_id: userId
      })
      
      if (accountsError || !accounts || accounts.length === 0) {
        return "❌ No email accounts connected. Please connect an email account first."
      }
      
      // Use the first available account
      const account = accounts[0]
      
      try {
        // Extract email details from the previous message
        const parseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { 
            role: 'system' as const, 
            content: `You are an email parser. Your task is to extract email details from a message that contains an email preview.

The message will contain the email details in this format:
I'll help you send this email. Please review the details:

📧 **Email Details**
To: [email]
Subject: [subject]

**Email Body:**
[body]

If you find these details, return them in this EXACT format (no other text):
{
  "to": "[email address]",
  "subject": "[subject line]",
  "body": "[complete body]"
}

If you cannot find valid email details, respond with exactly: "NO_EMAIL_FOUND"

Rules:
1. Only return the JSON object or "NO_EMAIL_FOUND", nothing else
2. Include the complete email body with all line breaks
3. Do not modify any of the content
4. If any required field is missing, return "NO_EMAIL_FOUND"`
          },
          { role: 'user' as const, content: lastAssistantMessage }
        ]
        
        const parseCompletion = await this.openai.chat.completions.create({
          model: 'gpt-4',
          messages: parseMessages,
          temperature: 0.1,
          max_tokens: 1000,
        })
        
        const parseResponse = parseCompletion.choices[0]?.message?.content || ''
        
        if (parseResponse === 'NO_EMAIL_FOUND') {
          return "I don't see any email to confirm sending. Please try composing your email again."
        }
        
        try {
          const emailDetails = JSON.parse(parseResponse)
          
          if (!emailDetails.to || !emailDetails.subject || !emailDetails.body) {
            return "I couldn't find all the required email details. Please try composing your email again."
          }
          
          // Send the email
          if (account.provider === 'gmail') {
            const email = [
              'Content-Type: text/plain; charset="UTF-8"',
              'MIME-Version: 1.0',
              `To: ${emailDetails.to}`,
              `Subject: ${emailDetails.subject}`,
              '',
              emailDetails.body
            ].join('\n')
            
            const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
            
            const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ raw: encodedEmail }),
            })
            
            if (!sendResponse.ok) {
              throw new Error('Failed to send Gmail')
            }
          } else if (account.provider === 'microsoft') {
            const sendResponse = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  subject: emailDetails.subject,
                  body: {
                    contentType: 'Text',
                    content: emailDetails.body
                  },
                  toRecipients: [
                    {
                      emailAddress: {
                        address: emailDetails.to
                      }
                    }
                  ]
                }
              }),
            })
            
            if (!sendResponse.ok) {
              throw new Error('Failed to send Microsoft email')
            }
          }
          
          return `✅ Email sent successfully!\n\nTo: ${emailDetails.to}\nSubject: ${emailDetails.subject}\n\nBody:\n${emailDetails.body}\n\nIs there anything else you'd like me to help you with?`
        } catch (error: any) {
          console.error('Error parsing email details:', error)
          return "I couldn't process the email details. Please try composing your email again."
        }
      } catch (error: any) {
        console.error('Error sending email:', error)
        return `❌ Failed to send email: ${error.message}`
      }
    }
    
    // If not a confirmation, handle as a regular message or email composition request
    const parseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { 
        role: 'system' as const, 
        content: `You are an AI email assistant. Your job is to help users compose and send emails.

When a user wants to send an email, follow these steps:

1. Extract the recipient's email address, subject, and message content.
2. Format the email professionally with proper salutation, body, and sign-off.
3. Show the formatted email to the user and ask for confirmation.

IMPORTANT RULES:
- Always include a proper salutation (e.g., "Dear", "Hi", "Hello")
- Always include a proper sign-off (e.g., "Best regards", "Sincerely", "Thanks")
- Always include the sender's name
- Preserve all line breaks and formatting
- Keep all URLs and links exactly as provided
- If any required information is missing, ask the user for it

For email requests, respond in this format:
"I'll help you send this email. Please review the details:

📧 **Email Details**
To: [email address]
Subject: [subject]

**Email Body:**
[formatted email with proper salutation, body, and sign-off]

Does this look correct? Please respond with "yes" or "confirm" to send the email."

If the message is not about sending an email or if information is missing, respond naturally to help the user.`
      },
      ...conversationHistory,
      { role: 'user' as const, content: userMessage }
    ]
    
    const parseCompletion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: parseMessages,
      temperature: 0.7,
      max_tokens: 1000,
    })
    
    return parseCompletion.choices[0]?.message?.content || ''
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
    
    let prompt = `You are an AI email assistant powered by GPT-4 with access to the user's connected email accounts. You can help with email management, search, summarization, and composition.

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
- When showing email data, format it clearly using markdown
- Respect user privacy and data security
- If no relevant emails found, suggest alternative searches
- Use emojis appropriately to make responses engaging

When sending an email, you MUST format your response EXACTLY like this:
To: recipient@example.com
Subject: Email Subject
Body: 
Dear [Name],

[Your message here]

Best regards,
[Your name]

IMPORTANT FORMATTING RULES:
1. The Body section MUST include the COMPLETE message with ALL line breaks and formatting
2. Preserve ALL whitespace, line breaks, and indentation exactly as provided
3. Do not modify or truncate any part of the message
4. Include the entire signature and any closing text
5. Keep all URLs and links exactly as provided`

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

  private formatEmailDataForGPT(emailData: any): string {
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
• Gmail (Google) 📧
• Microsoft Outlook 📫

**What you can do once connected:**
• Search and read emails 🔍
• Compose and send emails ✍️
• Get AI-powered summaries 📄
• Email insights and analytics 📊

Click the "⚙️ Manage Accounts" button in the header to get started!`
  }
}

export { OpenAIEmailClient } 