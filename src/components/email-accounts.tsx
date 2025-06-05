'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { Button } from './ui/button'
import { Card, CardHeader, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { 
  Mail, 
  Plus, 
  Check, 
  X, 
  Loader2,
  AlertCircle,
  ExternalLink,
  Trash2
} from 'lucide-react'
import { createClient } from '../../supabase/client'

interface EmailAccount {
  id: string
  provider: 'gmail' | 'microsoft'
  email: string
  created_at: string
  account_data: any
}

interface EmailAccountsProps {
  user: User
}

export default function EmailAccounts({ user }: EmailAccountsProps) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_user_email_accounts', {
        p_user_id: user.id
      })

      if (error) throw error
      setAccounts(data || [])
    } catch (err) {
      console.error('Error fetching accounts:', err)
      setError('Failed to load email accounts')
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async (provider: 'gmail' | 'microsoft') => {
    setConnecting(provider)
    setError(null)
    
    try {
      // Redirect to OAuth flow
      window.location.href = `/api/auth/${provider}`
    } catch (err) {
      console.error('Error connecting account:', err)
      setError(`Failed to connect ${provider} account`)
      setConnecting(null)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('remove_email_account', {
        p_user_id: user.id,
        p_account_id: accountId
      })

      if (error) throw error
      
      setAccounts(accounts.filter(acc => acc.id !== accountId))
    } catch (err) {
      console.error('Error disconnecting account:', err)
      setError('Failed to disconnect account')
    }
  }

  const getProviderInfo = (provider: string) => {
    switch (provider) {
      case 'gmail':
        return {
          name: 'Gmail',
          color: 'bg-red-500',
          icon: '📧'
        }
      case 'microsoft':
        return {
          name: 'Microsoft Outlook',
          color: 'bg-blue-500',
          icon: '📫'
        }
      default:
        return {
          name: provider,
          color: 'bg-gray-500',
          icon: '📬'
        }
    }
  }

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading email accounts...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Connected Email Accounts</h2>
        <p className="text-gray-600">
          Connect your email accounts to enable AI-powered email management
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Connected Accounts */}
      {accounts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Connected Accounts</h3>
          <div className="grid gap-4">
            {accounts.map((account) => {
              const providerInfo = getProviderInfo(account.provider)
              return (
                <Card key={account.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 ${providerInfo.color} rounded-lg flex items-center justify-center text-white text-xl`}>
                        {providerInfo.icon}
                      </div>
                      <div>
                        <div className="font-medium">{account.email}</div>
                        <div className="text-sm text-gray-500">
                          {providerInfo.name} • Connected {new Date(account.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Connected
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(account.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Available Connections */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Available Connections</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Gmail */}
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center text-white text-xl">
                📧
              </div>
              <div>
                <h4 className="font-semibold">Gmail</h4>
                <p className="text-sm text-gray-600">
                  Connect your Google email account
                </p>
              </div>
            </div>
            
            {accounts.some(acc => acc.provider === 'gmail') ? (
              <Button disabled className="w-full">
                <Check className="h-4 w-4 mr-2" />
                Already Connected
              </Button>
            ) : (
              <Button 
                onClick={() => handleConnect('gmail')}
                disabled={connecting === 'gmail'}
                className="w-full"
              >
                {connecting === 'gmail' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Connect Gmail
                  </>
                )}
              </Button>
            )}
            
            <div className="mt-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                Read and search emails
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                Compose and send emails
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                AI analysis and insights
              </div>
            </div>
          </Card>

          {/* Microsoft */}
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center text-white text-xl">
                📫
              </div>
              <div>
                <h4 className="font-semibold">Microsoft Outlook</h4>
                <p className="text-sm text-gray-600">
                  Connect your Microsoft email account
                </p>
              </div>
            </div>
            
            {accounts.some(acc => acc.provider === 'microsoft') ? (
              <Button disabled className="w-full">
                <Check className="h-4 w-4 mr-2" />
                Already Connected
              </Button>
            ) : (
              <Button 
                onClick={() => handleConnect('microsoft')}
                disabled={connecting === 'microsoft'}
                className="w-full"
              >
                {connecting === 'microsoft' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Connect Outlook
                  </>
                )}
              </Button>
            )}
            
            <div className="mt-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                Read and search emails
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                Compose and send emails
              </div>
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3" />
                AI analysis and insights
              </div>
            </div>
          </Card>
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No email accounts connected yet</p>
          <p className="text-sm">Connect your first account to get started</p>
        </div>
      )}
    </div>
  )
} 