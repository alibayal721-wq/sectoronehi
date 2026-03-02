import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import Login from './components/Login';
import { encryptMessage, decryptMessage } from './lib/crypto';
import SettingsModal from './components/SettingsModal';
import MembersModal from './components/MembersModal';
import CallOverlay from './components/CallOverlay';
import { User, Channel, Message } from './types';
import {
  collection,
  collectionGroup,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDocs,
  where,
  limit,
  runTransaction
} from 'firebase/firestore';
import { db, auth, messaging } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getToken, onMessage } from 'firebase/messaging';

export default function App() {
  const [user, setUser] = useState<User | null>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [callState, setCallState] = useState<{
    isActive: boolean;
    isIncoming: boolean;
    callerName: string;
    callerId: string | null;
    isAudioOnly?: boolean;
    callId?: string;
  }>({
    isActive: false,
    isIncoming: false,
    callerName: '',
    callerId: null
  });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const activeChannelRef = useRef<Channel | null>(null);
  const isFirstLoadRef = useRef(true);

  // 1. Developer Backdoor: Auto-initialize Admin
  const initializeAdmin = useCallback(async () => {
    try {
      const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import('firebase/auth');
      const { setDoc, doc, getDoc } = await import('firebase/firestore');

      const adminEmail = "al1bek@sector.one";
      const adminPass = "bolotbek743";

      let uid = "";
      try {
        // Try to create the user
        const res = await createUserWithEmailAndPassword(auth, adminEmail, adminPass);
        uid = res.user.uid;
        console.log("SECTOR_ONE: Admin Auth Created");
      } catch (e: any) {
        if (e.code === 'auth/email-already-in-use') {
          // If already exists, just get the ID (we'll need to sign in briefly to get it)
          const res = await signInWithEmailAndPassword(auth, adminEmail, adminPass);
          uid = res.user.uid;
        } else {
          throw e;
        }
      }

      // Ensure Firestore record exists
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          username: "al1bek",
          role: "admin",
          created_at: new Date().toISOString()
        });
        console.log("SECTOR_ONE: Admin Record Initialized");
      }
    } catch (err) {
      // Silently fail if already set up or network issues
      console.warn("Admin init status:", err);
    }
  }, []);

  useEffect(() => {
    initializeAdmin();
  }, [initializeAdmin]);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // Firebase Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        localStorage.removeItem('user');
      }
    });
    return () => unsubscribe();
  }, []);

  // 1.1 Notification Permission & FCM Token Registration
  useEffect(() => {
    if (!user) return;

    const setupNotifications = async () => {
      try {
        if (!('Notification' in window)) return;

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          // Register for FCM Push Tokens
          const token = await getToken(messaging, {
            // Replace with your VAPID Key from Firebase Console > Project Settings > Cloud Messaging
            // vapidKey: 'YOUR_PUBLIC_VAPID_KEY'
          }).catch(err => {
            console.warn("FCM Token failed (VAPID likely missing):", err);
            return null;
          });

          if (token) {
            await setDoc(doc(db, 'user_tokens', user.id), {
              token,
              userId: user.id,
              lastUpdated: serverTimestamp()
            }, { merge: true });
          }

          // Register Service Worker for FCM
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/firebase-messaging-sw.js')
              .then((registration) => {
                console.log('FCM Service Worker registered:', registration);
              })
              .catch((err) => {
                console.error('FCM Service Worker registration failed:', err);
              });
          }

          // Handle foreground FCM messages
          onMessage(messaging, (payload) => {
            if (document.hidden) {
              new Notification(payload.notification?.title || 'SECTOR_ONE', {
                body: payload.notification?.body,
                icon: '/logo.png'
              });
            }
          });
        }
      } catch (err) {
        console.error("Notification setup error:", err);
      }
    };

    setupNotifications();
  }, [user]);

  // 1.2 Global Notifications Listener (All Channels)
  useEffect(() => {
    if (!user || channels.length === 0) return;

    const sessionStart = new Date();
    // Listen to ALL messages collections across ALL channels
    const q = query(
      collectionGroup(db, 'messages'),
      where('timestamp', '>=', sessionStart)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const msg = change.doc.data();

          // Only notify if:
          // 1. Not from current user
          // 2. Tab is hidden OR message is in a different channel than the active one
          const isFromOther = msg.user_id !== user.id;
          const isNotCurrentChannel = activeChannelRef.current?.id !== msg.channel_id;

          if (isFromOther && (document.hidden || isNotCurrentChannel)) {
            const channelName = channels.find(c => c.id === msg.channel_id)?.name || 'UNKNOWN';
            const decryptedContent = decryptMessage(msg.content);
            const title = `[#${channelName.toUpperCase()}] ${msg.username.toUpperCase()}`;

            new Notification(title, {
              body: msg.type === 'text' ? decryptedContent : `[${msg.type.toUpperCase()}]`,
              icon: '/logo.png',
              tag: msg.channel_id // Group notifications by channel
            });
          }
        }
      });
    }, (err) => {
      // This is where the index error will show up if not created yet
      console.warn("Global Notification Listener error (Check Firestore Indexes):", err);
    });

    return () => unsubscribe();
  }, [user, channels]); // Listen for channel list updates to ensure name mapping works

  const handleLogin = (_token: string, newUser: User) => {
    setUser(newUser);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    localStorage.removeItem('user');
  };

  const handleUserUpdate = async (newUsername: string, avatar_url?: string) => {
    if (user) {
      const updatedUser: User = {
        ...user,
        username: newUsername,
        avatar_url: avatar_url || user.avatar_url
      };
      // Update Firestore
      await updateDoc(doc(db, 'users', user.id), {
        username: newUsername,
        avatar_url: avatar_url || user.avatar_url || null
      });
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  // ─────────────────────────────────────────────
  // WEB RTC & CALLING (Via Firestore)
  // ─────────────────────────────────────────────

  const endCall = useCallback(async () => {
    peerConnection.current?.close();
    peerConnection.current = null;
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setCallState({ isActive: false, isIncoming: false, callerName: '', callerId: null });

    if (callState.callId) {
      const callRef = doc(db, 'calls', callState.callId);
      await deleteDoc(callRef);
    }
  }, [localStream, callState.callId]);

  const setupPeerConnection = useCallback(async (isAudioOnly: boolean = false) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
      ]
    });

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !isAudioOnly,
        audio: true
      });
      setLocalStream(stream);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    } catch (err) {
      console.error('Media access denied:', err);
      pc.close();
      throw err;
    }

    peerConnection.current = pc;
    return pc;
  }, []);

  const startCall = async (isAudioOnly: boolean = false) => {
    if (!activeChannel || !user) return;

    const pc = await setupPeerConnection(isAudioOnly);
    const callDoc = doc(collection(db, 'calls'));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(callDoc, 'callerCandidates'), event.candidate.toJSON());
      }
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await setDoc(callDoc, {
      offer,
      from: user.username,
      fromId: user.id,
      isAudioOnly,
      channelId: activeChannel.id
    });

    setCallState({
      isActive: true,
      isIncoming: false,
      callerName: activeChannel.name,
      callerId: null,
      isAudioOnly,
      callId: callDoc.id
    });

    // Listen for answer
    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    // Listen for remote ICE candidates
    onSnapshot(collection(callDoc, 'calleeCandidates'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  };

  const acceptCall = async () => {
    if (!callState.callId || !user) return;

    const pc = await setupPeerConnection(callState.isAudioOnly);
    const callDoc = doc(db, 'calls', callState.callId);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(callDoc, 'calleeCandidates'), event.candidate.toJSON());
      }
    };

    const callSnapshot = await getDocs(query(collection(db, 'calls'), where('channelId', '==', activeChannel?.id || ''), limit(1)));
    if (callSnapshot.empty) return;

    const callData = callSnapshot.docs[0].data();
    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await updateDoc(callDoc, { answer });

    onSnapshot(collection(callDoc, 'callerCandidates'), (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });

    setCallState(prev => ({ ...prev, isIncoming: false }));
  };

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'calls'), where('channelId', '==', activeChannel?.id || ''));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.fromId !== user.id) {
            setCallState({
              isActive: true,
              isIncoming: true,
              callerName: data.from,
              callerId: data.fromId,
              isAudioOnly: data.isAudioOnly,
              callId: change.doc.id
            });
          }
        }
        if (change.type === 'removed') {
          endCall();
        }
      });
    });
    return () => unsubscribe();
  }, [user, activeChannel, endCall]);

  // ─────────────────────────────────────────────
  // MESSAGING & CHANNELS (Via Firestore)
  // ─────────────────────────────────────────────

  const sendMessage = async (content: string, type: string = 'text', fileUrl?: string, pollData?: any) => {
    if (!activeChannel || !user) return;

    await addDoc(collection(db, 'channels', activeChannel.id, 'messages'), {
      channel_id: activeChannel.id,
      user_id: user.id,
      username: user.username,
      user_role: user.role,
      content: encryptMessage(content),
      type,
      file_url: fileUrl || null,
      poll_data: pollData ? encryptMessage(JSON.stringify(pollData)) : null,
      votes: {}, // Initialize votes map for polls
      is_pinned: false,
      timestamp: serverTimestamp()
    });
  };

  const pinMessage = async (id: string, isPinned: boolean) => {
    if (!activeChannel) return;
    await updateDoc(doc(db, 'channels', activeChannel.id, 'messages', id), { is_pinned: isPinned });
  };

  const handleVote = async (messageId: string, optionIndex: number) => {
    if (!activeChannel || !user) return;
    const msgRef = doc(db, 'channels', activeChannel.id, 'messages', messageId);

    try {
      await runTransaction(db, async (transaction) => {
        const msgDoc = await transaction.get(msgRef);
        if (!msgDoc.exists()) return;

        const data = msgDoc.data();
        const pollData = JSON.parse(decryptMessage(data.poll_data));
        const currentVotes = data.votes || {};
        const previousVote = currentVotes[user.id];

        // Ensure we are comparing numbers and handle undefined/null
        const prevVoteIndex = (previousVote !== undefined && previousVote !== null) ? Number(previousVote) : null;

        // If user already voted for this exact option, do nothing
        if (prevVoteIndex === optionIndex) return;

        // If user voted for something else, decrement that
        if (prevVoteIndex !== null) {
          const oldOption = pollData.options[prevVoteIndex];
          if (oldOption) {
            oldOption.votes = Math.max(0, (oldOption.votes || 0) - 1);
          }
        }

        // Increment new vote
        const newOption = pollData.options[optionIndex];
        if (newOption) {
          newOption.votes = (newOption.votes || 0) + 1;
        }

        transaction.update(msgRef, {
          poll_data: encryptMessage(JSON.stringify(pollData)),
          votes: { ...currentVotes, [user.id]: optionIndex }
        });
      });
    } catch (e) {
      console.error("Transaction failed: ", e);
    }
  };

  const createChannel = async (name: string, description: string, can_post_role: 'admin' | 'user') => {
    await addDoc(collection(db, 'channels'), { name, description, can_post_role, created_at: serverTimestamp() });
  };

  const editChannel = async (id: string, name: string, description: string, can_post_role: 'admin' | 'user') => {
    await updateDoc(doc(db, 'channels', id), { name, description, can_post_role });
  };

  const deleteChannel = async (id: string) => {
    await deleteDoc(doc(db, 'channels', id));
  };

  const deleteMessage = async (id: string) => {
    if (!activeChannel) return;
    await deleteDoc(doc(db, 'channels', activeChannel.id, 'messages', id));
  };

  // Fetch Channels
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'channels'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const channelList = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as Channel));
      setChannels(channelList);
      if (channelList.length > 0 && !activeChannelRef.current) {
        setActiveChannel(channelList[0]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Messages when channel changes
  useEffect(() => {
    if (!user || !activeChannel) return;
    isFirstLoadRef.current = true; // Reset when channel changes
    const q = query(collection(db, 'channels', activeChannel.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageList = snapshot.docs.map(document => {
        const data = document.data();
        return {
          id: document.id,
          ...data,
          timestamp: data.timestamp?.toDate().toISOString() || new Date().toISOString(),
          user_vote: data.votes?.[user.id] // Get user's vote from the tracked votes map
        } as Message;
      });

      setMessages(messageList);
      isFirstLoadRef.current = false;
    });
    return () => unsubscribe();
  }, [user, activeChannel]); // Removed 'messages' from dependency to avoid loop, but need to check lastMsg logic

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <div className="scanline" />

      <Sidebar
        channels={channels}
        activeChannel={activeChannel}
        onSelectChannel={setActiveChannel}
        user={user}
        onLogout={handleLogout}
        onCreateChannel={createChannel}
        onEditChannel={editChannel}
        onDeleteChannel={deleteChannel}
        onOpenSettings={() => setShowSettings(true)}
        onOpenMembers={() => setShowMembers(true)}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {activeChannel ? (
            <motion.div
              key={activeChannel.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 min-h-0"
            >
              <Chat
                channel={activeChannel}
                messages={messages}
                onSendMessage={sendMessage}
                onPinMessage={pinMessage}
                onDeleteMessage={deleteMessage}
                onVote={handleVote}
                onStartCall={startCall}
                user={user}
                onToggleSidebar={() => setIsSidebarOpen(true)}
              />
            </motion.div>
          ) : (
            <div className="flex-1 flex items-center justify-center opacity-20">
              <p className="font-mono text-sm uppercase tracking-widest">Выберите канал для начала передачи</p>
            </div>
          )}
        </AnimatePresence>
      </main>

      {showSettings && (
        <SettingsModal
          user={user}
          onClose={() => setShowSettings(false)}
          onUpdate={handleUserUpdate}
        />
      )}

      {showMembers && (
        <MembersModal
          currentUser={user}
          onClose={() => setShowMembers(false)}
        />
      )}

      {callState.isActive && (
        <CallOverlay
          isIncoming={callState.isIncoming}
          callerName={callState.callerName}
          onAccept={acceptCall}
          onReject={endCall}
          onHangup={endCall}
          localStream={localStream}
          remoteStream={remoteStream}
          isAudioOnly={callState.isAudioOnly}
        />
      )}
    </div>
  );
}
