'use client'

import { useEffect, useState } from 'react'
import { useChat } from '@/hooks/useChat'
import { useRouter, useSearchParams } from 'next/navigation'

interface Message {
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

interface Conversation {
  id: string
  title: string
  last_message: string
  updated_at: string
}

export default function ChatPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const conversationId = searchParams.get('id')
  
  const [conversations, setConversations] = useState<Conversation[]>([])
  const { 
    messages, 
    sendMessage, 
    isLoading, 
    error,
    getConversations,
    createNewConversation,
    deleteConversation
  } = useChat(conversationId || undefined)

  useEffect(() => {
    loadConversations()
  }, [])

  const loadConversations = async () => {
    try {
      const convs = await getConversations()
      setConversations(convs)
    } catch (err) {
      console.error('Failed to load conversations:', err)
    }
  }

  const handleNewConversation = async () => {
    try {
      const newId = await createNewConversation()
      router.push(`/chat?id=${newId}`)
      await loadConversations()
    } catch (err) {
      console.error('Failed to create conversation:', err)
    }
  }

  const handleDeleteConversation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) return
    
    try {
      await deleteConversation(id)
      await loadConversations()
      if (id === conversationId) {
        router.push('/chat')
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const message = formData.get('message') as string
    
    if (!message.trim()) return
    
    try {
      await sendMessage(message, messages)
      e.currentTarget.reset()
      await loadConversations() // Refresh conversation list
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r">
        <div className="p-4">
          <button
            onClick={handleNewConversation}
            className="w-full py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            New Conversation
          </button>
        </div>
        
        <div className="overflow-y-auto h-[calc(100vh-80px)]">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 flex justify-between items-center ${
                conv.id === conversationId ? 'bg-blue-50' : ''
              }`}
            >
              <div 
                className="flex-1 min-w-0"
                onClick={() => router.push(`/chat?id=${conv.id}`)}
              >
                <h3 className="font-medium truncate">{conv.title}</h3>
                <p className="text-sm text-gray-500 truncate">
                  {conv.last_message || 'No messages yet'}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDeleteConversation(conv.id)}
                className="ml-2 text-red-500 hover:text-red-700"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div 
              key={index} 
              className={`p-4 rounded-lg max-w-[80%] ${
                message.role === 'user' 
                  ? 'bg-blue-100 ml-auto' 
                  : 'bg-white shadow-sm mr-auto'
              }`}
            >
              <div className="flex items-center mb-2">
                <span className="font-medium">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </span>
                {message.created_at && (
                  <span className="text-xs text-gray-500 ml-2">
                    {new Date(message.created_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
            </div>
          ))}
          
          {error && (
            <div className="bg-red-100 text-red-700 p-4 rounded-lg">
              Error: {error}
            </div>
          )}
          
          {isLoading && (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          )}
        </div>

        {/* Input Form */}
        <div className="border-t bg-white p-4">
          <form onSubmit={handleSubmit} className="flex space-x-4">
            <input
              type="text"
              name="message"
              placeholder="Type your message..."
              className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
} 