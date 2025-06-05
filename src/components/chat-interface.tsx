'use client'

import { useState, useRef, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { Button } from './ui/button'
import { Input } from './ui/input'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { 
  Send, 
  Bot, 
  User as UserIcon, 
  Plus, 
  Crown, 
  ArrowUpRight, 
  MessageSquare,
  Trash2,
  Edit3,
  Menu,
  X,
  Mail
} from 'lucide-react'
import Link from 'next/link'
import EmailAccounts from './email-accounts'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
  type?: 'text' | 'email' | 'action'
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  lastMessage: Date
}

interface ChatInterfaceProps {
  user: User
  subscription: any
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  content: `Welcome to your Email MCP Assistant! 🚀

I'm powered by AI (GPT-4 & Claude) and can help you manage your emails with intelligent features:

• **Search emails** - Find specific messages or conversations
• **Summarize emails** - Get quick summaries of long email threads  
• **Compose emails** - Help you write professional emails
• **Email insights** - Analyze your email patterns and productivity
• **Organize inbox** - Sort and categorize your messages

**🔗 First, connect your email accounts** by clicking "⚙️ Manage Accounts" in the header above.

**Supported providers:**
• Gmail (Google) 📧
• Microsoft Outlook 📫

**🤖 AI Models Available:**
• GPT-4 (OpenAI) - Fast and versatile
• Claude (Anthropic) - Thoughtful and detailed

Once connected, try asking me:
- "Show me emails from last week"
- "Summarize my unread emails"
- "Help me write a follow-up email"

What would you like to do with your emails today?`,
  role: 'assistant',
  timestamp: new Date(),
  type: 'text'
}

const SUGGESTED_PROMPTS = [
  "Show me recent emails",
  "Summarize unread messages", 
  "Help me compose an email",
  "Search for specific emails"
]

export default function ChatInterface({ user, subscription }: ChatInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: 'default',
      title: 'Email Assistant',
      messages: [WELCOME_MESSAGE],
      lastMessage: new Date()
    }
  ])
  const [currentConversationId, setCurrentConversationId] = useState('default')
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showAccountsModal, setShowAccountsModal] = useState(false)
  const [emailAccounts, setEmailAccounts] = useState<{provider: string, email: string}[]>([])
  const [aiProvider, setAiProvider] = useState<'openai' | 'claude'>('openai') // Default to OpenAI
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const currentConversation = conversations.find(c => c.id === currentConversationId)
  const messages = currentConversation?.messages || []

  // Check for OAuth success/error messages
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('gmail_connected') === 'true') {
      // Show success message for Gmail connection
      const successMessage: Message = {
        id: Date.now().toString(),
        content: "🎉 **Gmail Connected Successfully!**\n\nYour Gmail account has been connected. I can now help you with:\n\n• Reading and searching your emails\n• Composing and sending emails\n• Providing AI-powered insights\n\nTry asking me something like 'Show me my recent emails' or 'Summarize unread messages'",
        role: 'assistant',
        timestamp: new Date(),
        type: 'text'
      }
      
      setConversations(prev => prev.map(c => 
        c.id === currentConversationId 
          ? { ...c, messages: [...c.messages, successMessage] }
          : c
      ))
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    
    if (urlParams.get('microsoft_connected') === 'true') {
      // Show success message for Microsoft connection
      const successMessage: Message = {
        id: Date.now().toString(),
        content: "🎉 **Microsoft Outlook Connected Successfully!**\n\nYour Microsoft account has been connected. I can now help you with:\n\n• Reading and searching your emails\n• Composing and sending emails\n• Providing AI-powered insights\n\nTry asking me something like 'Show me my recent emails' or 'Summarize unread messages'",
        role: 'assistant',
        timestamp: new Date(),
        type: 'text'
      }
      
      setConversations(prev => prev.map(c => 
        c.id === currentConversationId 
          ? { ...c, messages: [...c.messages, successMessage] }
          : c
      ))
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    
    if (urlParams.get('error')) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "❌ **Connection Failed**\n\nThere was an error connecting your email account. Please try again or contact support if the issue persists.",
        role: 'assistant',
        timestamp: new Date(),
        type: 'text'
      }
      
      setConversations(prev => prev.map(c => 
        c.id === currentConversationId 
          ? { ...c, messages: [...c.messages, errorMessage] }
          : c
      ))
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [currentConversationId])

  // Fetch email accounts on load
  useEffect(() => {
    fetchEmailAccounts()
  }, [])

  const fetchEmailAccounts = async () => {
    try {
      const supabase = (await import('../../supabase/client')).createClient()
      const { data, error } = await supabase.rpc('get_user_email_accounts', {
        p_user_id: user.id
      })

      if (error) throw error
      setEmailAccounts(data?.map((acc: any) => ({ provider: acc.provider, email: acc.email })) || [])
    } catch (error) {
      console.error('Error fetching email accounts:', error)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const createNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [WELCOME_MESSAGE],
      lastMessage: new Date()
    }
    setConversations(prev => [newConversation, ...prev])
    setCurrentConversationId(newConversation.id)
  }

  const deleteConversation = (id: string) => {
    if (conversations.length === 1) return // Don't delete last conversation
    setConversations(prev => prev.filter(c => c.id !== id))
    if (currentConversationId === id) {
      setCurrentConversationId(conversations[0].id)
    }
  }

  const updateConversationTitle = (id: string, title: string) => {
    setConversations(prev => prev.map(c => 
      c.id === id ? { ...c, title } : c
    ))
  }

  const generateResponse = async (input: string, subscription: any): Promise<string> => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: input,
          provider: aiProvider,
          confirmEmail: input.toLowerCase().includes('yes') || input.toLowerCase().includes('confirm')
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate response')
      }

      const data = await response.json()
      
      // Handle email verification request
      if (data.requiresConfirmation) {
        return data.message
      }
      
      // Handle regular message or email sent confirmation
      return data.message
    } catch (error) {
      console.error('Error calling AI API:', error)
      
      // Fallback to basic responses if AI API fails
      return generateFallbackResponse(input, subscription)
    }
  }

  const generateFallbackResponse = (input: string, subscription: any): string => {
    const lowercaseInput = input.toLowerCase()
    
    // Check if user has connected email accounts
    if (emailAccounts.length === 0) {
      if (lowercaseInput.includes('email') || lowercaseInput.includes('search') || lowercaseInput.includes('recent') || lowercaseInput.includes('compose')) {
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

    // Basic fallback responses
    if (lowercaseInput.includes('help')) {
      return `I'm your AI email assistant! Here's what I can help you with:

**📧 Email Management:**
• Search and filter emails
• Read and summarize messages
• Compose and send emails
• Analyze email patterns

**🔧 Getting Started:**
1. Connect your email accounts using "⚙️ Manage Accounts"
2. Ask me to search your emails
3. Request summaries or analysis
4. Get help composing emails

**📊 Account Status:**
• Connected accounts: ${emailAccounts.length}
• Subscription: ${subscription?.price_id === 'basic_plan' ? 'Basic Plan' : 'Premium Plan'}

What would you like to do with your emails?`
    }

    return `I understand you're asking about: "${input}"

I'm your AI email assistant powered by Claude. I can help you with:
• Searching and managing emails
• Summarizing conversations
• Composing professional emails
• Email analytics and insights

To get started, make sure you have email accounts connected, then try asking me something like:
• "Show me my recent emails"
• "Summarize unread messages"
• "Help me write a follow-up email"

How can I help you with your emails today?`
  }

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      role: 'user',
      timestamp: new Date(),
      type: 'text'
    }

    setConversations(prev => prev.map(c => 
      c.id === currentConversationId 
        ? { 
            ...c, 
            messages: [...c.messages, userMessage],
            lastMessage: new Date(),
            title: c.title === 'New Chat' ? content.trim().slice(0, 30) + '...' : c.title
          }
        : c
    ))
    
    setInputValue('')
    setIsLoading(true)

    try {
      const response = await generateResponse(content, subscription)
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response,
        role: 'assistant',
        timestamp: new Date(),
        type: 'text'
      }
      
      setConversations(prev => prev.map(c => 
        c.id === currentConversationId 
          ? { 
              ...c, 
              messages: [...c.messages, assistantMessage],
              lastMessage: new Date()
            }
          : c
      ))
    } catch (error) {
      console.error('Error generating response:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        role: 'assistant',
        timestamp: new Date(),
        type: 'text'
      }
      
      setConversations(prev => prev.map(c => 
        c.id === currentConversationId 
          ? { 
              ...c, 
              messages: [...c.messages, errorMessage],
              lastMessage: new Date()
            }
          : c
      ))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestedPrompt = (prompt: string) => {
    setInputValue(prompt)
    handleSendMessage(prompt)
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden`}>
        {sidebarOpen && (
          <>
            {/* Logo */}
            <div className="p-4 border-b border-gray-200">
              <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">L</span>
                </div>
                <span className="font-semibold text-lg">Logo</span>
              </Link>
            </div>

            {/* Sidebar Header */}
            <div className="p-4 border-b border-gray-200">
              <Button 
                onClick={createNewConversation}
                className="w-full justify-start gap-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300"
                variant="outline"
              >
                <Plus size={16} />
                New chat
              </Button>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group relative p-3 mb-1 rounded-lg cursor-pointer transition-colors ${
                    currentConversationId === conversation.id 
                      ? 'bg-white shadow-sm border border-gray-200' 
                      : 'hover:bg-white/50'
                  }`}
                  onClick={() => setCurrentConversationId(conversation.id)}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-gray-500 flex-shrink-0" />
                    <span className="text-sm truncate flex-1">{conversation.title}</span>
                    {conversations.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 p-1 h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteConversation(conversation.id)
                        }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {conversation.lastMessage.toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>

            {/* User Profile */}
            <div className="p-4 border-t border-gray-200">
              {/* Email Accounts Quick Access */}
              <div className="mb-4">
                <Button
                  onClick={() => setShowAccountsModal(true)}
                  variant="outline"
                  size="sm"
                  className={`w-full justify-start gap-2 ${
                    emailAccounts.length === 0 
                      ? 'border-blue-500 text-blue-600 bg-blue-50 hover:bg-blue-100' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Mail size={16} />
                  {emailAccounts.length === 0 ? (
                    <>
                      Connect Email
                      <div className="ml-auto w-2 h-2 bg-red-500 rounded-full"></div>
                    </>
                  ) : (
                    <>
                      Email Accounts
                      <div className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                        {emailAccounts.length}
                      </div>
                    </>
                  )}
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserIcon size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{user.email}</div>
                    {subscription && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Crown size={12} className={subscription.price_id === 'basic_plan' ? "text-blue-500" : "text-yellow-500"} />
                        {subscription.price_id === 'basic_plan' ? 'Basic' : 'Premium'}
                      </div>
                    )}
                  </div>
                </div>
                {subscription?.price_id === 'basic_plan' && (
                  <Link href="/pricing">
                    <Button size="sm" variant="outline" className="h-7">
                      <ArrowUpRight size={12} />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Bot size={16} className="text-blue-600" />
              </div>
              <div>
                <h1 className="font-medium">Email MCP Assistant</h1>
                <p className="text-sm text-gray-500">AI-powered email management</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* AI Provider Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">AI:</span>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as 'openai' | 'claude')}
                className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="openai">GPT-4 🤖</option>
                <option value="claude">Claude 🧠</option>
              </select>
            </div>
            
            {/* Email Accounts Button */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowAccountsModal(true)}
              className={`flex items-center gap-2 ${
                emailAccounts.length === 0 
                  ? 'border-blue-500 text-blue-600 bg-blue-50 hover:bg-blue-100 animate-pulse' 
                  : ''
              }`}
            >
              <Mail size={16} />
              {emailAccounts.length === 0 ? (
                <>
                  🔗 Connect Email
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                </>
              ) : (
                `⚙️ Manage Accounts (${emailAccounts.length})`
              )}
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            {messages.map((message, index) => (
              <div key={message.id} className="border-b border-gray-100 last:border-b-0">
                <div className="p-6">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      {message.role === 'assistant' ? (
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <Bot size={16} className="text-blue-600" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                          <UserIcon size={16} className="text-gray-600" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="border-b border-gray-100">
                <div className="p-6">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Bot size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Suggested prompts (show only if first conversation with welcome message) */}
        {messages.length === 1 && currentConversationId === 'default' && (
          <div className="max-w-4xl mx-auto px-6 py-4">
            {/* Email Connection CTA (show if no accounts connected) */}
            {emailAccounts.length === 0 && (
              <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail size={32} className="text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Connect Your Email Accounts
                  </h3>
                  <p className="text-gray-600 mb-4 max-w-md mx-auto">
                    Get started by connecting your Gmail or Microsoft Outlook accounts to unlock AI-powered email management.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button 
                      onClick={() => setShowAccountsModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Mail size={16} className="mr-2" />
                      Connect Email Accounts
                    </Button>
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-6 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-red-500 rounded flex items-center justify-center text-white text-xs">📧</div>
                      Gmail
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-white text-xs">📫</div>
                      Outlook
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SUGGESTED_PROMPTS.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="p-4 text-left border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium text-sm">{prompt}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white">
          <div className="max-w-4xl mx-auto p-6">
            <div className="relative">
              <div className="border border-gray-300 rounded-2xl p-4 focus-within:border-blue-500 transition-colors">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Message Email MCP Assistant..."
                  className="w-full resize-none border-none outline-none text-sm pr-12"
                  style={{ minHeight: '24px', maxHeight: '200px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage(inputValue)
                    }
                  }}
                  disabled={isLoading}
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = '24px'
                    target.style.height = target.scrollHeight + 'px'
                  }}
                />
                <Button 
                  onClick={() => handleSendMessage(inputValue)}
                  disabled={isLoading || !inputValue.trim()}
                  className="absolute right-2 bottom-2 w-8 h-8 p-0 rounded-lg bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100"
                  variant="ghost"
                >
                  <Send size={16} className="text-gray-600" />
                </Button>
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2 text-center">
              Press Enter to send • Shift+Enter for new line
            </div>
          </div>
        </div>
      </div>
      
      {/* Email Accounts Modal */}
      {showAccountsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Email Account Management</h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowAccountsModal(false)}
              >
                <X size={20} />
              </Button>
            </div>
            <div className="p-6">
              <EmailAccounts user={user} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 