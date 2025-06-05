import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../supabase/server'
import { ClaudeEmailClient } from '../../../lib/claude-client'
import { OpenAIEmailClient } from '../../../lib/openai-client'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const userId = session.user.id
    
    // Get user's subscription
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    if (subscriptionError) {
      console.error('Error fetching subscription:', subscriptionError)
      return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 })
    }
    
    // Parse request body
    const { message, aiProvider = 'openai', confirmEmail, conversationHistory = [] } = await request.json()
    
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    
    // Initialize AI client based on provider
    const aiClient = aiProvider === 'claude' 
      ? new ClaudeEmailClient()
      : new OpenAIEmailClient()
    
    // Generate response
    const response = await aiClient.generateResponse(message, userId, subscription, conversationHistory)
    
    // Return the response directly - all handling is now done in the OpenAI client
    return NextResponse.json({ message: response })
  } catch (error: any) {
    console.error('Error in chat API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 