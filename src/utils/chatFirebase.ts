import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { firestore } from './counterFirebase';
import { isAdminUser } from './adminFirestore';
import type { User } from './firebase';

// ========================================
// CONFIGURATION - Update these values
// ========================================

// Support person UID - the Firebase UID of the account that receives all support messages
// To find this: login with the support account, open console, run: firebase.auth().currentUser.uid
export const SUPPORT_UID = 'vka12e2umlZS89BObKGl5hpthej2';

// Who may use the support dashboard: the original support account plus every
// ADMIN_EMAILS account. Mirrors isSupportAdmin() in firestore.rules.
export const isSupportUser = (user: User | null): boolean =>
  user?.uid === SUPPORT_UID || isAdminUser(user);

// File upload server configuration
const FILE_UPLOAD_URL = 'https://shakirtech.com/imageservice/contactus';
const FILE_UPLOAD_SECRET = 'img@676510';

// ========================================
// TYPES
// ========================================

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  senderPhoto: string | null;
  type: 'text' | 'image' | 'audio' | 'video' | 'app_name';
  content: string; // text content or file URL
  fileName?: string; // original filename for media
  timestamp: Timestamp | null;
  read: boolean;
}

export interface ChatRoom {
  id: string; // Same as user UID
  userName: string;
  userEmail: string;
  userPhoto: string | null;
  lastMessage: string;
  lastMessageTime: Timestamp | null;
  lastMessageType: 'text' | 'image' | 'audio' | 'video' | 'app_name';
  unreadCount: number;
  createdAt: Timestamp | null;
}

// ========================================
// CHAT ROOM FUNCTIONS
// ========================================

// Get or create a chat room for a user
export const getOrCreateChatRoom = async (
  userId: string,
  userName: string,
  userEmail: string,
  userPhoto: string | null
): Promise<ChatRoom> => {
  const chatRoomRef = doc(firestore, 'chatRooms', userId);
  const snapshot = await getDoc(chatRoomRef);

  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() } as ChatRoom;
  }

  // Create new chat room
  const newRoom: Omit<ChatRoom, 'id'> = {
    userName,
    userEmail,
    userPhoto,
    lastMessage: '',
    lastMessageTime: null,
    lastMessageType: 'text',
    unreadCount: 0,
    createdAt: serverTimestamp() as Timestamp,
  };

  await setDoc(chatRoomRef, newRoom);
  return { id: userId, ...newRoom };
};

// Send a message
export const sendMessage = async (
  chatRoomId: string,
  senderId: string,
  senderName: string,
  senderEmail: string,
  senderPhoto: string | null,
  type: 'text' | 'image' | 'audio' | 'video' | 'app_name',
  content: string,
  fileName?: string
): Promise<ChatMessage> => {
  const messagesRef = collection(firestore, 'chatRooms', chatRoomId, 'messages');
  const newMessageRef = doc(messagesRef);

  const message: Omit<ChatMessage, 'id'> = {
    senderId,
    senderName,
    senderEmail,
    senderPhoto,
    type,
    content,
    timestamp: serverTimestamp() as Timestamp,
    read: false,
  };

  // Only add fileName if it's defined (Firestore doesn't accept undefined)
  if (fileName) {
    message.fileName = fileName;
  }

  await setDoc(newMessageRef, message);

  // Update chat room with last message
  const chatRoomRef = doc(firestore, 'chatRooms', chatRoomId);
  const lastMessagePreview = type === 'text' ? content.substring(0, 50) : `[${type}]`;

  await setDoc(chatRoomRef, {
    lastMessage: lastMessagePreview,
    lastMessageTime: serverTimestamp(),
    lastMessageType: type,
  }, { merge: true });

  return { id: newMessageRef.id, ...message };
};

// Subscribe to messages in a chat room (real-time)
export const subscribeToMessages = (
  chatRoomId: string,
  callback: (messages: ChatMessage[]) => void
): (() => void) => {
  const messagesRef = collection(firestore, 'chatRooms', chatRoomId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() } as ChatMessage);
    });
    callback(messages);
  });
};

// Get all chat rooms (for support person)
export const getAllChatRooms = async (): Promise<ChatRoom[]> => {
  const chatRoomsRef = collection(firestore, 'chatRooms');
  const q = query(chatRoomsRef, orderBy('lastMessageTime', 'desc'));
  const snapshot = await getDocs(q);

  const rooms: ChatRoom[] = [];
  snapshot.forEach((doc) => {
    rooms.push({ id: doc.id, ...doc.data() } as ChatRoom);
  });
  return rooms;
};

// Subscribe to chat rooms (for support person - real-time)
export const subscribeToChatRooms = (
  callback: (rooms: ChatRoom[]) => void
): (() => void) => {
  const chatRoomsRef = collection(firestore, 'chatRooms');
  const q = query(chatRoomsRef, orderBy('lastMessageTime', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const rooms: ChatRoom[] = [];
    snapshot.forEach((doc) => {
      rooms.push({ id: doc.id, ...doc.data() } as ChatRoom);
    });
    callback(rooms);
  });
};

// Upload file (image/audio/video)
export const uploadFile = async (
  file: File,
  userId: string
): Promise<string | null> => {
  try {
    const formData = new FormData();

    // Generate unique filename
    const extension = file.name.split('.').pop() || 'bin';
    const filename = `${userId}_${Date.now()}.${extension}`;

    formData.append('file', file, filename);

    const response = await fetch(`${FILE_UPLOAD_URL}/upload`, {
      method: 'POST',
      headers: {
        'x-secret': FILE_UPLOAD_SECRET,
      },
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      // Return the full URL to the uploaded file
      // Server returns relative path like /imageservice/contactus/filename.png
      return `https://shakirtech.com${data.url}`;
    } else {
      throw new Error(`Upload failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    return null;
  }
};

// Mark messages as read
export const markMessagesAsRead = async (
  chatRoomId: string,
  readerId: string
): Promise<void> => {
  const messagesRef = collection(firestore, 'chatRooms', chatRoomId, 'messages');
  const q = query(messagesRef, where('read', '==', false), where('senderId', '!=', readerId));

  const snapshot = await getDocs(q);
  const updates = snapshot.docs.map((docSnap) =>
    setDoc(doc(messagesRef, docSnap.id), { read: true }, { merge: true })
  );

  await Promise.all(updates);
};

// ========================================
// PRESENCE TRACKING
// ========================================

// Update support presence (call this periodically from SupportChat)
export const updateSupportPresence = async (): Promise<void> => {
  const presenceRef = doc(firestore, 'presence', SUPPORT_UID);
  await setDoc(presenceRef, {
    lastSeen: serverTimestamp(),
    online: true,
  });
};

// Check if support is online (lastSeen within 60 seconds)
export const isSupportOnline = async (): Promise<boolean> => {
  const presenceRef = doc(firestore, 'presence', SUPPORT_UID);
  const snapshot = await getDoc(presenceRef);

  if (!snapshot.exists()) return false;

  const data = snapshot.data();
  if (!data.lastSeen) return false;

  const lastSeen = data.lastSeen.toDate();
  const now = new Date();
  const diffSeconds = (now.getTime() - lastSeen.getTime()) / 1000;

  return diffSeconds < 60; // Online if seen within last 60 seconds
};

// ========================================
// TELEGRAM NOTIFICATION
// ========================================

export const sendTelegramNotification = async (
  senderName: string,
  message: string,
  messageType: string
): Promise<void> => {
  try {
    const text = `💬 New message from ${senderName}\n\n${messageType === 'text' ? message : `[${messageType}]`}\n\nhttps://utilitykit.web.app/support`;

    await fetch(`https://shakirtech.com/tg/send-repeat?text=${encodeURIComponent(text)}&count=5`, {
      method: 'POST',
    });
  } catch (e) {
    console.log('Failed to send Telegram notification');
  }
};

export { firestore };
