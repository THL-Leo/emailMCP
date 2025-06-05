# Email MCP Server Setup Guide

This guide explains how to set up the Email MCP (Model Context Protocol) server that gives AI (GPT-4 or Claude) access to your connected Gmail and Microsoft Outlook accounts.

## What You've Built

✅ **MCP Server** (`src/lib/email-mcp-server.ts`) - Provides email tools to AI models
✅ **OpenAI Integration** (`src/lib/openai-client.ts`) - GPT-4 API client with email context  
✅ **Claude Integration** (`src/lib/claude-client.ts`) - Claude API client with email context  
✅ **API Endpoint** (`src/app/api/chat/route.ts`) - Chat API supporting both AI providers
✅ **Updated UI** - Chat interface with AI provider selector and real AI responses

## Environment Variables Required

Add these to your `.env.local` file:

```bash
# Existing variables
NEXT_PUBLIC_SITE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common

# AI Providers (you need at least one)
OPENAI_API_KEY=your_openai_api_key_here          # For GPT-4 (recommended)
ANTHROPIC_API_KEY=your_anthropic_api_key_here    # For Claude (optional)

# Optional: For standalone MCP server
MCP_USER_ID=your_user_id_here
```

## Getting Your API Keys

### OpenAI API Key (Recommended)
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up/log in to your account
3. Navigate to **API Keys**
4. Create a new API key
5. Copy the key and add it to your `.env.local`

### Claude API Key (Optional)
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up/log in to your account
3. Navigate to **API Keys**
4. Create a new API key
5. Copy the key and add it to your `.env.local`

## How It Works

### 1. **In Your Web App** (Current Setup)
```
User message → /api/chat → AI Provider (GPT-4/Claude) → Email data → AI response
```

- User types a message in the chat interface
- User can select AI provider (GPT-4 or Claude) from dropdown
- Chat interface calls `/api/chat` API route with selected provider
- API route uses the chosen AI client to:
  - Detect if message is email-related
  - Fetch relevant email data from connected accounts
  - Send message + email context to AI model
  - Return AI's intelligent response

### 2. **With Claude Desktop** (Optional Advanced Setup)
```
Claude Desktop → MCP Server → Your email accounts → Real-time access
```

## Current Features

### ✅ **Working Now**
- **Dual AI Support** - Choose between GPT-4 and Claude
- **Real AI responses** (no more mock data!)
- **Email context awareness** for both AI models
- **Automatic email data fetching** for relevant queries
- **Smart query detection** (email vs general questions)
- **Token refresh** for expired OAuth tokens
- **Fallback support** - If one AI fails, tries the other
- **Provider selection** - Switch between AI models in the UI

### 🔄 **Email Tools Available**
- **Search emails** - Find specific emails across all connected accounts
- **Email summarization** - Get AI summaries of email content
- **Smart responses** - Context-aware answers about your emails
- **Account management** - Handles multiple Gmail/Outlook accounts

## Test Your Setup

1. **Add your OpenAI API key** to `.env.local`:
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   ```

2. **Start your app**:
   ```bash
   npm run dev
   ```

3. **Connect an email account** using the "⚙️ Connect Email" button

4. **Choose your AI model** from the dropdown in the header (GPT-4 or Claude)

5. **Try these queries** in the chat:
   - "Show me my recent emails"
   - "Summarize my unread messages" 
   - "Find emails from [someone]"
   - "What emails did I get today?"

## AI Model Comparison

### GPT-4 (OpenAI) 🤖
- **Strengths**: Fast, versatile, great for general tasks
- **Best for**: Quick email searches, casual conversations
- **Model**: gpt-4o (latest)
- **Response style**: Concise and practical

### Claude (Anthropic) 🧠  
- **Strengths**: Thoughtful, detailed analysis, excellent reasoning
- **Best for**: Complex email analysis, detailed summaries
- **Model**: claude-3-5-sonnet-20241022
- **Response style**: Detailed and comprehensive

## Example Interactions

### With GPT-4:
**Query**: "Show me recent emails"
**GPT-4 Response:**
```
📧 **Recent Emails Found**

I found 5 recent emails in your Gmail account:

1. **Meeting Reminder: Team Standup Tomorrow**
   • From: sarah@company.com
   • Date: Dec 5, 2024
   • Preview: Quick reminder about team standup meeting tomorrow...

2. **Your Order Has Shipped! 📦**
   • From: orders@amazon.com  
   • Date: Dec 5, 2024
   • Preview: Good news! Your order #123-456 has shipped...

Would you like me to summarize any of these or help with responses? 🤔
```

### With Claude:
**Query**: "Help me write a follow-up email"
**Claude Response:**
```
I'd be delighted to help you craft a thoughtful follow-up email. To ensure I write something that perfectly captures your intent and maintains the appropriate tone, I'll need to understand a few key details:

**Essential Information:**
1. **Recipient & Context**: Who are you following up with, and what was your previous interaction about?
2. **Objective**: What specific outcome are you hoping to achieve with this follow-up?
3. **Tone & Relationship**: Is this a formal business relationship, a casual colleague, or something in between?
4. **Timeline Sensitivity**: Is this time-sensitive or more of a gentle check-in?

Based on your recent email history, I can see you've been corresponding with several contacts about various topics. Would you like me to reference any of these existing conversations, or is this follow-up related to something entirely new?
```

## Advanced: Standalone MCP Server

For use with Claude Desktop app:

1. **Build the server**:
   ```bash
   npm run build
   # This compiles src/mcp-server.ts to dist/mcp-server.js
   ```

2. **Configure Claude Desktop**:
   Add to your Claude Desktop MCP config:
   ```json
   {
     "mcpServers": {
       "email": {
         "command": "node",
         "args": ["/path/to/your/project/dist/mcp-server.js", "your-user-id"],
         "env": {
           "NODE_ENV": "production",
           "SUPABASE_URL": "your_supabase_url",
           "SUPABASE_ANON_KEY": "your_supabase_key"
         }
       }
     }
   }
   ```

## Troubleshooting

### "No AI provider configured" Error
- Add at least one API key: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- Restart your development server after adding keys
- Verify the API keys are valid in their respective consoles

### AI Provider Not Working
- Check the API key is correct in your `.env.local`
- Verify you have credits/billing set up with the provider
- The app will automatically fallback to the other provider if available

### "No email accounts connected" 
- Connect Gmail/Outlook using "⚙️ Manage Accounts"
- Check OAuth redirect URIs are correctly configured
- Verify tokens haven't expired

### Email data not loading
- Check browser console for API errors
- Verify OAuth tokens are valid
- Test `/api/emails` endpoint directly

## Next Steps

- **Email Composition**: Implement sending emails through AI
- **Advanced Search**: Add semantic search capabilities  
- **Email Analytics**: Build email pattern analysis
- **Automation**: Create email rules and filters
- **Calendar Integration**: Connect Google Calendar/Outlook Calendar
- **AI Model Fine-tuning**: Optimize prompts for each provider

## Security Notes

- OAuth tokens are securely stored in your Supabase database
- Row Level Security (RLS) ensures users only access their own data
- AI API calls include minimal necessary context
- All communication uses HTTPS encryption
- API keys are server-side only, never exposed to clients

Your Email MCP Assistant is now powered by real AI with dual provider support! 🚀 