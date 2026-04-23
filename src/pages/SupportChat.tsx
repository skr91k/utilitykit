import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import {
  subscribeToChatRooms,
  subscribeToMessages,
  sendMessage,
  uploadFile,
  SUPPORT_UID,
} from '../utils/chatFirebase'
import type { ChatMessage, ChatRoom } from '../utils/chatFirebase'
import './ContactUs.css'

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

export function SupportChat() {
  const { user, loading, login } = useAuth()
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  useSEO({
    title: 'Support Dashboard',
    description: 'Support chat dashboard',
    keywords: 'support, chat, admin',
  })

  // Check if user is support admin
  const isSupport = user?.uid === SUPPORT_UID

  // Subscribe to all chat rooms
  useEffect(() => {
    if (!user || !isSupport) return

    const unsubscribe = subscribeToChatRooms((rooms) => {
      setChatRooms(rooms)
    })

    return () => unsubscribe()
  }, [user, isSupport])

  // Subscribe to messages when a room is selected
  useEffect(() => {
    if (!selectedRoom) return
    let prevCount = 0

    const unsubscribe = subscribeToMessages(selectedRoom.id, (msgs) => {
      // Play sound if new message from user (not own message)
      if (msgs.length > prevCount && user) {
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg && lastMsg.senderId !== user.uid) {
          playNotificationSound()
        }
      }
      prevCount = msgs.length
      setMessages(msgs)
    })

    return () => unsubscribe()
  }, [selectedRoom, user])

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user || !selectedRoom || sending) return

    setSending(true)
    try {
      await sendMessage(
        selectedRoom.id,
        user.uid,
        'Support',
        user.email || 'support@utilitykit.app',
        user.photoURL,
        'text',
        newMessage.trim()
      )
      setNewMessage('')
    } catch (err) {
      console.error('Failed to send:', err)
    } finally {
      setSending(false)
    }
  }

  const handleFileUpload = useCallback(async (
    file: File,
    type: 'image' | 'audio' | 'video'
  ) => {
    if (!user || !selectedRoom || uploading) return

    setUploading(true)
    try {
      const url = await uploadFile(file, user.uid)
      if (url) {
        await sendMessage(
          selectedRoom.id,
          user.uid,
          'Support',
          user.email || 'support@utilitykit.app',
          user.photoURL,
          type,
          url,
          file.name
        )
      }
    } catch (err) {
      console.error('Failed to upload:', err)
    } finally {
      setUploading(false)
    }
  }, [user, selectedRoom, uploading])

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
          <div className={`message-bubble ${msg.type === 'app_name' ? 'app-name-bubble' : ''}`}>
            {msg.type === 'app_name' && <p className="app-name-label">App: {msg.content}</p>}
            {msg.type === 'text' && <p>{msg.content}</p>}
            {msg.type === 'image' && (
              <a href={msg.content} target="_blank" rel="noopener noreferrer">
                <img src={msg.content} alt={msg.fileName || 'Image'} className="message-image" />
              </a>
            )}
            {msg.type === 'audio' && (
              <audio controls src={msg.content} className="message-audio" />
            )}
            {msg.type === 'video' && (
              <video controls src={msg.content} className="message-video" />
            )}
            <span className="message-time">{formatTime(msg.timestamp)}</span>
          </div>
        </div>
      </div>
    )
  }

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const date = formatDate(msg.timestamp)
    if (!groups[date]) groups[date] = []
    groups[date].push(msg)
    return groups
  }, {} as Record<string, ChatMessage[]>)

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

  if (!user) {
    return (
      <div className="contact-page">
        <Link to="/" className="back-link">Home</Link>
        <div className="contact-container">
          <div className="login-prompt">
            <h2>Support Login</h2>
            <p>Please login with the support account</p>
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

  if (!isSupport) {
    return (
      <div className="contact-page">
        <Link to="/" className="back-link">Home</Link>
        <div className="contact-container">
          <div className="login-prompt">
            <h2>Access Denied</h2>
            <p>This page is only for support staff</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="contact-page support-page">
      <Link to="/" className="back-link">Home</Link>

      <div className="support-layout">
        {/* Chat Rooms List */}
        <div className="chat-rooms-list">
          <h3>Conversations</h3>
          {chatRooms.length === 0 ? (
            <div className="no-chats">No conversations yet</div>
          ) : (
            chatRooms.map((room) => (
              <div
                key={room.id}
                className={`chat-room-item ${selectedRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => setSelectedRoom(room)}
              >
                <div className="room-avatar">
                  {room.userPhoto ? (
                    <img src={room.userPhoto} alt="" />
                  ) : (
                    <span>{room.userName?.charAt(0) || 'U'}</span>
                  )}
                </div>
                <div className="room-info">
                  <div className="room-name">{room.userName}</div>
                  <div className="room-preview">{room.lastMessage || 'No messages'}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat Area */}
        <div className="contact-container">
          {!selectedRoom ? (
            <div className="empty-chat">
              <p>Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="contact-header-small">
                <div className="header-left">
                  <div className="support-avatar">
                    {selectedRoom.userPhoto ? (
                      <img src={selectedRoom.userPhoto} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                    ) : (
                      selectedRoom.userName?.charAt(0) || 'U'
                    )}
                  </div>
                  <div className="support-info">
                    <span className="support-name">{selectedRoom.userName}</span>
                    <span className="support-email">{selectedRoom.userEmail}</span>
                  </div>
                </div>
              </div>

              <div className="chat-messages">
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

              <div className="chat-input-area">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'image')}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                <input
                  type="file"
                  ref={audioInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'audio')}
                  accept="audio/*"
                  style={{ display: 'none' }}
                />
                <input
                  type="file"
                  ref={videoInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'video')}
                  accept="video/*"
                  style={{ display: 'none' }}
                />

                <div className="media-buttons">
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="media-btn" title="Image">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </button>
                  <button onClick={() => audioInputRef.current?.click()} disabled={uploading} className="media-btn" title="Audio">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  </button>
                  <button onClick={() => videoInputRef.current?.click()} disabled={uploading} className="media-btn" title="Video">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                  </button>
                </div>

                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  disabled={sending || uploading}
                  rows={1}
                  className="chat-input"
                />

                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sending || uploading}
                  className="send-btn"
                >
                  {sending || uploading ? (
                    <span className="sending-spinner" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
