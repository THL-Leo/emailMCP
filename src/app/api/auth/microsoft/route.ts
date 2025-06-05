import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../../supabase/server'

const MICROSOFT_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/User.Read',
  'offline_access'
].join(' ')

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // If no code, redirect to Microsoft OAuth
  if (!code) {
    const clientId = process.env.MICROSOFT_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 500 })
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/microsoft`
    console.log('Microsoft OAuth redirect URI:', redirectUri) // Debug log
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
    const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`)
    
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', MICROSOFT_SCOPES)
    authUrl.searchParams.set('response_mode', 'query')
    authUrl.searchParams.set('state', user.id)

    return NextResponse.redirect(authUrl.toString())
  }

  // Handle OAuth callback
  try {
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common'
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/microsoft`,
        scope: MICROSOFT_SCOPES,
      }),
    })

    const tokens = await tokenResponse.json()

    if (!tokenResponse.ok) {
      throw new Error(tokens.error_description || 'Failed to exchange code for tokens')
    }

    // Get user info from Microsoft Graph
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    })
    const userInfo = await userInfoResponse.json()

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info from Microsoft Graph')
    }

    // Store the email account using the new schema
    const { error: dbError } = await supabase.rpc('upsert_email_account', {
      p_user_id: user.id,
      p_provider: 'microsoft',
      p_email: userInfo.mail || userInfo.userPrincipalName,
      p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token,
      p_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      p_account_data: {
        displayName: userInfo.displayName,
        givenName: userInfo.givenName,
        surname: userInfo.surname,
        id: userInfo.id
      }
    })

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to save account' }, { status: 500 })
    }

    // Redirect back to dashboard with success
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?microsoft_connected=true`
    )

  } catch (error) {
    console.error('Microsoft OAuth error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?error=microsoft_connection_failed`
    )
  }
} 