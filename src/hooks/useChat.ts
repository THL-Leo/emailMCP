import { useState, useEffect } from 'react'
import { createClient } from '../../supabase/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

interface ChatResponse {
  message: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface ConversationMetadata {
  id: string
  title: string
  last_message: string
  updated_at: string
}

export function useChat(conversationId?: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  // Load existing messages when conversationId changes
  useEffect(() => {
    if (conversationId) {
      loadMessages(conversationId)
    }
  }, [conversationId])

  const loadMessages = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages(data || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error loading messages:', err)
    }
  }

  const createNewConversation = async (title: string = 'New Conversation'): Promise<string> => {
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        { 
          title,
          last_message: '',
          user_id: (await supabase.auth.getUser()).data.user?.id
        }
      ])
      .select()
      .single()

    if (error) throw error
    return data.id
  }

  const getConversations = async (): Promise<ConversationMetadata[]> => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) throw error
    return data
  }

  const sendMessage = async (
    message: string, 
    existingMessages: Message[] = []
  ): Promise<ChatResponse> => {
    setIsLoading(true)
    setError(null)

    try {
      // Create new conversation if none exists
      if (!conversationId) {
        conversationId = await createNewConversation(message.slice(0, 50))
      }

      // Add message to database
      const { error: msgError } = await supabase
        .from('chat_messages')
        .insert([{
          conversation_id: conversationId,
          role: 'user',
          content: message,
          user_id: (await supabase.auth.getUser()).data.user?.id
        }])

      if (msgError) throw msgError

      // Send to API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationHistory: existingMessages,
          conversationId
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data: ChatResponse = await response.json()

      // Store assistant's response
      const { error: assistantError } = await supabase
        .from('chat_messages')
        .insert([{
          conversation_id: conversationId,
          role: 'assistant',
          content: data.message,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          tokens_used: data.usage?.total_tokens
        }])

      if (assistantError) throw assistantError

      // Update conversation metadata
      await supabase
        .from('conversations')
        .update({ 
          last_message: data.message.slice(0, 100),
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)

      // Update local messages
      await loadMessages(conversationId)

      return data
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const deleteConversation = async (convId: string) => {
    try {
      // Delete messages first (due to foreign key constraint)
      await supabase
        .from('chat_messages')
        .delete()
        .eq('conversation_id', convId)

      // Then delete conversation
      await supabase
        .from('conversations')
        .delete()
        .eq('id', convId)
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }

  return {
    sendMessage,
    isLoading,
    error,
    messages,
    createNewConversation,
    getConversations,
    deleteConversation
  }
} 