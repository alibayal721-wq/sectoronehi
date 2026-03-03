import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import Login from './components/Login';
import { encryptMessage, decryptMessage } from './lib/crypto';
import SettingsModal from './components/SettingsModal';
import MembersModal from './components/MembersModal';
import CallOverlay from './components/CallOverlay';
import { User, Channel, Message, PollData } from './types';
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
import { db, auth, storage, messaging } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, deleteObject } from 'firebase/storage';
import { getToken } from 'firebase/messaging';

export default function App() {
  const [user, setUser] = useState<User | null>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeDM, setActiveDM] = useState<User | null>(null);
  const [recentDMs, setRecentDMs] = useState<User[]>([]);

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
  const activeDMRef = useRef<User | null>(null);
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
    activeDMRef.current = activeDM;
  }, [activeChannel, activeDM]);

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

  // 1.1 Service Worker & Notification Permission
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!user) return;

    const setupNotifications = async () => {
      try {
        // Request notification permission
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          console.log('Notification permission:', permission);
        }

        // Register Service Worker for background notifications
        if ('serviceWorker' in navigator) {
          const basePath = import.meta.env.BASE_URL || '/';
          const registration = await navigator.serviceWorker.register(
            `${basePath}sw.js`,
            { scope: basePath }
          );
          swRegistrationRef.current = registration;
          if (Notification.permission === 'default') {
            await Notification.requestPermission();
          }

          if (Notification.permission === 'granted' && user) {
            // Register for FCM Token for 24/7 Push Notifications
            try {
              const token = await getToken(messaging, {
                // REPLACE THIS WITH YOUR ACTUAL VAPID KEY FROM FIREBASE CONSOLE
                vapidKey: 'BOu7U9kYy3S7f6lS-G_R0iA_U-W0X-8p-mU4X7V8X7V8X7V8X7V8X7V8_PLACEHOLDER'
              });

              if (token) {
                // Store/Update token in Firestore for server-side push
                await setDoc(doc(db, 'user_tokens', user.id), {
                  token,
                  userId: user.id,
                  username: user.username,
                  updatedAt: serverTimestamp()
                });
                console.log('📡 [FCM] Device registered successfully.');
              }
            } catch (fcmErr) {
              console.warn('FCM Token registration failed:', fcmErr);
            }
          }
        }
      } catch (err) {
        console.warn('Notification setup error:', err);
      }
    };

    setupNotifications();
  }, [user]);

  // 1.2 Global Notifications Listener (All Channels + DMs)
  useEffect(() => {
    if (!user || channels.length === 0) return;

    const sessionStart = new Date();
    const q = query(
      collectionGroup(db, 'messages'),
      where('timestamp', '>=', sessionStart)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'added') {
          const msg = change.doc.data();

          const isFromOther = msg.user_id !== user.id;
          const isNotCurrentChannel = activeChannelRef.current?.id !== msg.channel_id;
          const isNotCurrentDM = activeDMRef.current?.id !== msg.user_id;

          if (isFromOther && (document.hidden || (isNotCurrentChannel && isNotCurrentDM))) {
            const channel = channels.find((c: Channel) => c.id === msg.channel_id);
            const channelName = channel?.name;
            const decryptedContent = decryptMessage(msg.content);

            let title = `[#${channelName?.toUpperCase() || 'DM'}] ${msg.username.toUpperCase()}`;
            if (!channelName) {
              title = `[ПРЯМАЯ_СВЯЗЬ] ${msg.username.toUpperCase()}`;
            }
            const body = msg.type === 'text' ? decryptedContent : `[${msg.type.toUpperCase()}]`;

            // Use service worker for persistent background notifications
            if (swRegistrationRef.current?.active) {
              swRegistrationRef.current.active.postMessage({
                type: 'SHOW_NOTIFICATION',
                title,
                body,
                tag: msg.channel_id
              });
            } else if ('Notification' in window && Notification.permission === 'granted') {
              // Fallback to regular Notification API
              new Notification(title, { body, icon: '/logo.png', tag: msg.channel_id });
            }
          }
        }
      });
    }, (err) => {
      console.warn('Global Notification Listener error:', err);
    });

    return () => unsubscribe();
  }, [user, channels]);

  // 1.3 Incoming Call Notification (background vibrate + notification)
  useEffect(() => {
    if (callState.isActive && callState.isIncoming && callState.callerName) {
      // Send call notification via service worker (for background vibration)
      if (swRegistrationRef.current?.active) {
        swRegistrationRef.current.active.postMessage({
          type: 'SHOW_CALL_NOTIFICATION',
          callerName: callState.callerName
        });
      }

      // Also vibrate the device directly
      if ('vibrate' in navigator) {
        const vibrateInterval = setInterval(() => {
          navigator.vibrate([500, 200, 500, 200, 500]);
        }, 2500);

        return () => {
          clearInterval(vibrateInterval);
          navigator.vibrate(0); // Stop vibrating
        };
      }
    }
  }, [callState.isActive, callState.isIncoming, callState.callerName]);

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
    localStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
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
    if (!user) return;
    if (!activeChannel && !activeDM) return;

    const pc = await setupPeerConnection(isAudioOnly);
    const callDoc = doc(collection(db, 'calls'));
    const callTargetId = activeDM ? [user.id, activeDM.id].sort().join('_') : activeChannel!.id;
    const callTargetName = activeDM ? activeDM.username : activeChannel!.name;

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
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
      channelId: callTargetId,
      isDM: !!activeDM,
      toId: activeDM?.id || null
    });

    setCallState({
      isActive: true,
      isIncoming: false,
      callerName: callTargetName,
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
      snapshot.docChanges().forEach((change: any) => {
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

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
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
      snapshot.docChanges().forEach((change: any) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });

    setCallState(prev => ({ ...prev, isIncoming: false }));
  };

  // Listen for incoming calls (channel calls + DM calls addressed to me)
  useEffect(() => {
    if (!user) return;

    // Listen for DM calls addressed to this user
    const qDM = query(collection(db, 'calls'), where('toId', '==', user.id));
    // Listen for channel calls (in current active channel if any)
    const qChannel = activeChannel
      ? query(collection(db, 'calls'), where('channelId', '==', activeChannel.id))
      : null;

    const handleChange = (snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
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
    };

    const unsubDM = onSnapshot(qDM, handleChange);
    const unsubChannel = qChannel ? onSnapshot(qChannel, handleChange) : () => { };
    return () => {
      unsubDM();
      unsubChannel();
    };
  }, [user, activeChannel, endCall]);

  // ─────────────────────────────────────────────
  // MESSAGING & CHANNELS (Via Firestore)
  // ─────────────────────────────────────────────

  const startDM = (otherUser: User) => {
    setActiveChannel(null);
    setActiveDM(otherUser);
    setRecentDMs((prev: User[]) => {
      if (prev.find((u: User) => u.id === otherUser.id)) return prev;
      return [otherUser, ...prev];
    });
  };

  const sendMessage = async (content: string, type: string = 'text', fileUrl?: string, pollData?: any) => {
    if (!user) return;

    try {
      if (activeDM) {
        const dmId = [user.id, activeDM.id].sort().join('_');
        await addDoc(collection(db, 'dms', dmId, 'messages'), {
          channel_id: dmId, // Reuse field for DM ID
          user_id: user.id,
          receiver_id: activeDM.id,
          username: user.username,
          user_role: user.role,
          content: encryptMessage(content),
          type,
          file_url: fileUrl || null,
          poll_data: pollData ? encryptMessage(JSON.stringify(pollData)) : null,
          votes: {},
          is_pinned: false,
          timestamp: serverTimestamp()
        });
      } else if (activeChannel) {
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
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      // Optional: alert or toast for user visibility on mobile
    }
  };

  const pinMessage = async (id: string, isPinned: boolean) => {
    if (activeDM) {
      const dmId = [user!.id, activeDM.id].sort().join('_');
      await updateDoc(doc(db, 'dms', dmId, 'messages', id), { is_pinned: isPinned });
    } else if (activeChannel) {
      await updateDoc(doc(db, 'channels', activeChannel.id, 'messages', id), { is_pinned: isPinned });
    }
  };

  const handleVote = async (messageId: string, optionIndex: number) => {
    if (!user) return;
    const msgRef = activeDM
      ? doc(db, 'dms', [user.id, activeDM.id].sort().join('_'), 'messages', messageId)
      : (activeChannel ? doc(db, 'channels', activeChannel.id, 'messages', messageId) : null);

    if (!msgRef) return;

    try {
      await runTransaction(db, async (transaction) => {
        const msgDoc = await transaction.get(msgRef);
        if (!msgDoc.exists()) return;

        const data = msgDoc.data();
        const pollData = JSON.parse(decryptMessage(data.poll_data)) as PollData;
        const currentVotes = data.votes || {};

        // If user already voted for this exact option, return early to prevent duplicates
        if (currentVotes[user.id] === optionIndex) {
          return;
        }

        // Update the votes map
        const newVotes = { ...currentVotes, [user.id]: optionIndex };

        // Recalculate all option counts from the source of truth (the votes map)
        pollData.options.forEach((opt: any, idx: number) => {
          opt.votes = Object.values(newVotes).filter(v => Number(v) === idx).length;
        });

        transaction.update(msgRef, {
          poll_data: encryptMessage(JSON.stringify(pollData)),
          votes: newVotes
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

  const deleteMessage = async (id: string, fileUrl?: string) => {
    try {
      if (fileUrl) {
        const fileRef = ref(storage, fileUrl);
        await deleteObject(fileRef).catch(e => console.warn("Storage delete failed (already gone?):", e));
      }

      if (activeDM) {
        const dmId = [user!.id, activeDM.id].sort().join('_');
        await deleteDoc(doc(db, 'dms', dmId, 'messages', id));
      } else if (activeChannel) {
        await deleteDoc(doc(db, 'channels', activeChannel.id, 'messages', id));
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // Fetch Channels
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'channels'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const channelList = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as Channel));
      setChannels(channelList);
      if (channelList.length > 0 && !activeChannelRef.current && !activeDM) {
        setActiveChannel(channelList[0]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Listen for incoming DMs to populate sidebar
  useEffect(() => {
    if (!user) return;

    // Listen to ALL DM messages where I am a participant (as sender or receiver)
    const qSender = query(collectionGroup(db, 'messages'), where('user_id', '==', user.id));
    const qReceiver = query(collectionGroup(db, 'messages'), where('receiver_id', '==', user.id));

    const handleNewMessage = async (change: any) => {
      if (change.type === 'added') {
        const msg = change.doc.data();
        if (!msg.receiver_id) return; // Ignore channel messages

        const otherId = msg.user_id === user.id ? msg.receiver_id : msg.user_id;

        if (!recentDMs.find((u: User) => u.id === otherId)) {
          const { getDoc, doc } = await import('firebase/firestore');
          const userSnap = await getDoc(doc(db, 'users', otherId));
          if (userSnap.exists()) {
            const userData = { id: userSnap.id, ...userSnap.data() } as User;
            setRecentDMs((prev: User[]) => {
              if (prev.find((u: User) => u.id === otherId)) return prev;
              return [...prev, userData];
            });
          }
        }
      }
    };

    const unsubSender = onSnapshot(qSender, (snapshot) => snapshot.docChanges().forEach(handleNewMessage));
    const unsubReceiver = onSnapshot(qReceiver, (snapshot) => snapshot.docChanges().forEach(handleNewMessage));

    return () => {
      unsubSender();
      unsubReceiver();
    };
  }, [user, recentDMs]);

  // Fetch Messages when channel OR active DM changes
  useEffect(() => {
    if (!user || (!activeChannel && !activeDM)) return;
    isFirstLoadRef.current = true;

    const messagesRef = activeDM
      ? collection(db, 'dms', [user.id, activeDM.id].sort().join('_'), 'messages')
      : collection(db, 'channels', activeChannel!.id, 'messages');

    const q = query(messagesRef, orderBy('timestamp', 'asc'));
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
  }, [user, activeChannel, activeDM]);

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg" style={{ height: '100dvh', minHeight: '-webkit-fill-available' }}>
      <div className="scanline" />

      <Sidebar
        channels={channels}
        activeChannel={activeChannel}
        user={user}
        onLogout={handleLogout}
        onCreateChannel={createChannel}
        onEditChannel={editChannel}
        onDeleteChannel={deleteChannel}
        onOpenSettings={() => setShowSettings(true)}
        onOpenMembers={() => setShowMembers(true)}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        directMessages={recentDMs}
        activeDM={activeDM}
        onSelectDM={startDM}
        onSelectChannel={(channel) => {
          setActiveDM(null);
          setActiveChannel(channel);
        }}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <AnimatePresence mode="wait">
          {activeChannel || activeDM ? (
            <motion.div
              key={activeChannel ? activeChannel.id : `dm-${activeDM?.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 min-h-0"
            >
              <Chat
                channel={activeChannel || {
                  id: activeDM!.id,
                  name: activeDM!.username,
                  description: `ПРЯМОЙ_ДЕШИФРОВАННЫЙ_КАНАЛ_С_${activeDM!.username.toUpperCase()}`,
                  can_post_role: 'user'
                }}
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
          onStartDM={startDM}
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
