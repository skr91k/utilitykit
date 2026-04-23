import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import {
  getOrCreateChatRoom,
  sendMessage,
  subscribeToMessages,
  uploadFile,
} from '../utils/chatFirebase'
import type { ChatMessage } from '../utils/chatFirebase'
import './ContactUs.css'

const SUPPORT_EMAIL = 'shakir676510@gmail.com'

// Notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.3)
  } catch (e) {
    console.log('Could not play notification sound')
  }
}

export function ContactUs() {
  const { user, loading, login } = useAuth()
  const [searchParams] = useSearchParams()
  const appId = searchParams.get('id') || ''
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [chatReady, setChatReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appNameSent, setAppNameSent] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  useSEO({
    title: 'Contact Us - Live Chat Support',
    description: 'Get in touch with us via live chat support.',
    keywords: 'contact, support, chat, help',
  })

  // Check if user has email (Gmail login)
  const hasEmail = user?.email != null

  // Initialize chat room when user logs in
  useEffect(() => {
    if (!user || !hasEmail) return

    const initChat = async () => {
      try {
        await getOrCreateChatRoom(
          user.uid,
          user.displayName || 'Anonymous',
          user.email!,
          user.photoURL
        )
        setChatReady(true)
      } catch (err) {
        console.error('Failed to initialize chat:', err)
        setError('Failed to connect to chat. Please try again.')
      }
    }

    initChat()
  }, [user, hasEmail])

  // Subscribe to messages
  useEffect(() => {
    if (!user || !chatReady) return
    let prevCount = 0

    const unsubscribe = subscribeToMessages(user.uid, (msgs) => {
      // Play sound if new message from support (not own message)
      if (msgs.length > prevCount) {
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg && lastMsg.senderId !== user.uid) {
          playNotificationSound()
        }
      }
      prevCount = msgs.length
      setMessages(msgs)
    })

    return () => unsubscribe()
  }, [user, chatReady])

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendAppNameIfNeeded = async () => {
    if (appId && !appNameSent && user && hasEmail) {
      await sendMessage(
        user.uid,
        user.uid,
        user.displayName || 'User',
        user.email!,
        user.photoURL,
        'app_name',
        appId
      )
      setAppNameSent(true)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user || !hasEmail || sending) return

    setSending(true)
    setError(null)

    try {
      // Send app_name message before first message
      await sendAppNameIfNeeded()

      await sendMessage(
        user.uid,
        user.uid,
        user.displayName || 'User',
        user.email!,
        user.photoURL,
        'text',
        newMessage.trim()
      )
      setNewMessage('')
    } catch (err) {
      console.error('Failed to send message:', err)
      setError('Failed to send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleFileUpload = useCallback(async (
    file: File,
    type: 'image' | 'audio' | 'video'
  ) => {
    if (!user || !hasEmail || uploading) return

    setUploading(true)
    setError(null)

    try {
      // Send app_name message before first message
      if (appId && !appNameSent) {
        await sendMessage(
          user.uid,
          user.uid,
          user.displayName || 'User',
          user.email!,
          user.photoURL,
          'app_name',
          appId
        )
        setAppNameSent(true)
      }

      const url = await uploadFile(file, user.uid)
      if (!url) {
        throw new Error('Upload failed')
      }

      await sendMessage(
        user.uid,
        user.uid,
        user.displayName || 'User',
        user.email!,
        user.photoURL,
        type,
        url,
        file.name
      )
    } catch (err) {
      console.error('Failed to upload file:', err)
      setError('Failed to upload file. Please try again.')
    } finally {
      setUploading(false)
    }
  }, [user, hasEmail, uploading, appId, appNameSent])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file, 'image')
    e.target.value = '' // Reset input
  }

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file, 'audio')
    e.target.value = ''
  }

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file, 'video')
    e.target.value = ''
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatTime = (timestamp: any) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString()
  }

  const renderMessage = (msg: ChatMessage) => {
    const isOwn = msg.senderId === user?.uid

    return (
      <div key={msg.id} className={`chat-message ${isOwn ? 'own' : 'other'}`}>
        {!isOwn && msg.senderPhoto && (
          <img src={msg.senderPhoto} alt="" className="message-avatar" />
        )}
        <div className="message-content">
          {!isOwn && <div className="message-sender">{msg.senderName}</div>}
          <div className="message-bubble">
            {msg.type === 'text' && <p>{msg.content}</p>}
            {msg.type === 'image' && (
              <a href={msg.content} target="_blank" rel="noopener noreferrer">
                <img src={msg.content} alt={msg.fileName || 'Image'} className="message-image" />
              </a>
            )}
            {msg.type === 'audio' && (
              <audio controls src={msg.content} className="message-audio">
                Your browser does not support audio.
              </audio>
            )}
            {msg.type === 'video' && (
              <video controls src={msg.content} className="message-video">
                Your browser does not support video.
              </video>
            )}
            <span className="message-time">{formatTime(msg.timestamp)}</span>
          </div>
        </div>
      </div>
    )
  }

  // Filter out app_name messages for user view and group by date
  const visibleMessages = messages.filter(msg => msg.type !== 'app_name')
  const groupedMessages = visibleMessages.reduce((groups, msg) => {
    const date = formatDate(msg.timestamp)
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {} as Record<string, ChatMessage[]>)

  // Loading state
  if (loading) {
    return (
      <div className="contact-page">
        <Link to="/" className="back-link">Home</Link>
        <div className="contact-container">
          <div className="loading-state">Loading...</div>
        </div>
      </div>
    )
  }

  // Not logged in or no email (anonymous user)
  if (!user || !hasEmail) {
    return (
      <div className="contact-page">
        <Link to="/" className="back-link">Home</Link>
        <div className="contact-container">
          <div className="contact-header-small">
            <span className="contact-email">{SUPPORT_EMAIL}</span>
          </div>
          <div className="login-prompt">
            <h2>Login Required</h2>
            <p>Please login with Google to chat with support</p>
            {user && !hasEmail && (
              <p className="login-note">You are logged in as a guest. Please login with Google to access chat.</p>
            )}
            <button onClick={login} className="google-login-btn">
              <svg viewBox="0 0 24 24" width="20" height="20" style={{ marginRight: '10px' }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="contact-page">
      <Link to="/" className="back-link">Home</Link>

      <div className="contact-container">
        {/* Header with small contact info */}
        <div className="contact-header-small">
          <div className="header-left">
            <div className="support-avatar">S</div>
            <div className="support-info">
              <span className="support-name">Support</span>
              <span className="support-email">{SUPPORT_EMAIL}</span>
            </div>
          </div>
          <div className="header-right">
            <span className="online-status">Online</span>
          </div>
        </div>

        {/* Chat Messages Area */}
        <div className="chat-messages">
          {messages.length === 0 && chatReady && (
            <div className="empty-chat">
              <p>Start a conversation with support</p>
              <p className="empty-hint">Send a message, image, audio, or video</p>
            </div>
          )}

          {Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date} className="message-group">
              <div className="date-divider">
                <span>{date}</span>
              </div>
              {msgs.map(renderMessage)}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="chat-error">
            {error}
            <button onClick={() => setError(null)} className="error-dismiss">x</button>
          </div>
        )}

        {/* Message Input Area */}
        <div className="chat-input-area">
          {/* Hidden file inputs */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <input
            type="file"
            ref={audioInputRef}
            onChange={handleAudioSelect}
            accept="audio/*"
            style={{ display: 'none' }}
          />
          <input
            type="file"
            ref={videoInputRef}
            onChange={handleVideoSelect}
            accept="video/*"
            style={{ display: 'none' }}
          />

          {/* Media buttons */}
          <div className="media-buttons">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="media-btn"
              title="Send Image"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            <button
              onClick={() => audioInputRef.current?.click()}
              disabled={uploading}
              className="media-btn"
              title="Send Audio"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={uploading}
              className="media-btn"
              title="Send Video"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            </button>
          </div>

          {/* Text input */}
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={sending || uploading}
            rows={1}
            className="chat-input"
          />

          {/* Send button */}
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || sending || uploading}
            className="send-btn"
          >
            {sending || uploading ? (
              <span className="sending-spinner" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
