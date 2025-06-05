import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../supabase/server'

// Helper function to refresh tokens if needed
async function refreshTokenIfNeeded(account: any, supabase: any) {
  const now = new Date()
  const expiresAt = new Date(account.expires_at)
  
  // If token expires in the next 5 minutes, refresh it
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
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
        // Update the account in the user's email_accounts array
        await supabase.rpc('upsert_email_account', {
          p_user_id: account.user_id,
          p_provider: account.provider,
          p_email: account.email,
          p_access_token: tokens.access_token,
          p_refresh_token: account.refresh_token,
          p_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          p_account_data: account.account_data
        })
        
        return tokens.access_token
      }
    } else if (account.provider === 'microsoft') {
      const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
      const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          refresh_token: account.refresh_token,
          grant_type: 'refresh_token',
        }),
      })
      
      const tokens = await tokenResponse.json()
      if (tokenResponse.ok) {
        // Update the account in the user's email_accounts array
        await supabase.rpc('upsert_email_account', {
          p_user_id: account.user_id,
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

// Fetch emails from Gmail
async function fetchGmailEmails(accessToken: string, query?: string, maxResults = 20) {
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
  
  // Fetch detailed information for each message
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

// Fetch emails from Microsoft Graph
async function fetchMicrosoftEmails(accessToken: string, query?: string, maxResults = 20) {
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

// Send email using Gmail API
async function sendGmailEmail(accessToken: string, to: string, subject: string, body: string) {
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

// Send email using Microsoft Graph API
async function sendMicrosoftEmail(accessToken: string, to: string, subject: string, body: string) {
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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const provider = searchParams.get('provider')
    const maxResults = parseInt(searchParams.get('limit') || '20')

    // Get connected email accounts using the new schema
    const { data: accounts, error: accountsError } = await supabase.rpc('get_user_email_accounts', {
      p_user_id: user.id
    })

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError)
      return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ 
        emails: [], 
        message: 'No email accounts connected' 
      })
    }

    // Filter by provider if specified
    const filteredAccounts = provider 
      ? accounts.filter((acc: any) => acc.provider === provider)
      : accounts

    // Fetch emails from all accounts
    const emailPromises = filteredAccounts.map(async (account: any) => {
      try {
        // Add user_id to account for token refresh
        const accountWithUserId = { ...account, user_id: user.id }
        const accessToken = await refreshTokenIfNeeded(accountWithUserId, supabase)
        
        if (account.provider === 'gmail') {
          return await fetchGmailEmails(accessToken, query || undefined, maxResults)
        } else if (account.provider === 'microsoft') {
          return await fetchMicrosoftEmails(accessToken, query || undefined, maxResults)
        }
        return []
      } catch (error) {
        console.error(`Error fetching emails from ${account.provider}:`, error)
        return []
      }
    })

    const emailResults = await Promise.all(emailPromises)
    const allEmails = emailResults.flat()

    // Sort by date (newest first)
    allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({
      emails: allEmails.slice(0, maxResults),
      total: allEmails.length,
      accounts: filteredAccounts.map((acc: any) => ({
        provider: acc.provider,
        email: acc.email,
        connected: true
      }))
    })

  } catch (error) {
    console.error('Error fetching emails:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { to, subject, body, provider } = await request.json()

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get connected email accounts
    const { data: accounts, error: accountsError } = await supabase.rpc('get_user_email_accounts', {
      p_user_id: user.id
    })

    if (accountsError || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No email accounts connected' }, { status: 400 })
    }

    // Filter by provider if specified
    const filteredAccounts = provider 
      ? accounts.filter((acc: any) => acc.provider === provider)
      : accounts

    if (filteredAccounts.length === 0) {
      return NextResponse.json({ 
        error: provider 
          ? `No ${provider} account connected`
          : 'No email accounts connected'
      }, { status: 400 })
    }

    // Use the first available account
    const account = filteredAccounts[0]
    const accessToken = await refreshTokenIfNeeded(account, supabase)

    let result
    if (account.provider === 'gmail') {
      result = await sendGmailEmail(accessToken, to, subject, body)
    } else if (account.provider === 'microsoft') {
      result = await sendMicrosoftEmail(accessToken, to, subject, body)
    } else {
      throw new Error(`Unsupported email provider: ${account.provider}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Email sent successfully',
      provider: account.provider,
      to: to,
      subject: subject,
      messageId: result.messageId,
    })

  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to send email'
    }, { status: 500 })
  }
} 