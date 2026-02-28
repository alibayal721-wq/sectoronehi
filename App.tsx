import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import Login from './components/Login';
import SettingsModal from './components/SettingsModal';
import CallOverlay from './components/CallOverlay';
import { User, Channel, Message, SocketMessage } from './types';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(JSON.parse(localStorage.getItem('user') || 'null'));
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [callState, setCallState] = useState<{
    isActive: boolean;
    isIncoming: boolean;
    callerName: string;
    callerId: number | null;
    isAudioOnly?: boolean;
  }>({
    isActive: false,
    isIncoming: false,
    callerName: '',
    callerId: null
  });

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const activeChannelRef = useRef<Channel | null>(null);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  const handleLogin = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    socketRef.current?.close();
  };

  const handleUserUpdate = (newUsername: string, avatar_url?: string) => {
    if (user) {
      const updatedUser = {
        ...user,
        username: newUsername,
        avatar_url: avatar_url || user.avatar_url
      };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const endCall = useCallback(() => {
    peerConnection.current?.close();
    peerConnection.current = null;
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    pendingCandidates.current = [];
    setCallState({ isActive: false, isIncoming: false, callerName: '', callerId: null });
    socketRef.current?.send(JSON.stringify({ type: 'call-hangup' }));
  }, [localStream]);

  const setupPeerConnection = useCallback(async (isAudioOnly: boolean = false) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
      }
    };

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
      alert('Permission denied: Unable to access camera or microphone.');
      pc.close();
      throw err;
    }

    peerConnection.current = pc;
    return pc;
  }, []);

  const startCall = async (isAudioOnly: boolean = false) => {
    const pc = await setupPeerConnection(isAudioOnly);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socketRef.current?.send(JSON.stringify({
      type: 'call-offer',
      offer,
      isAudioOnly
    }));
    setCallState({
      isActive: true,
      isIncoming: false,
      callerName: activeChannelRef.current?.name || 'Канал',
      callerId: null,
      isAudioOnly
    });
  };

  const acceptCall = async () => {
    const pc = await setupPeerConnection(callState.isAudioOnly);
    await pc.setRemoteDescription(new RTCSessionDescription((window as any).pendingOffer));

    while (pendingCandidates.current.length > 0) {
      const candidate = pendingCandidates.current.shift();
      if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current?.send(JSON.stringify({ type: 'call-answer', answer }));
    setCallState(prev => ({ ...prev, isIncoming: false }));
  };

  const sendMessage = (content: string, type: string = 'text', fileUrl?: string, pollData?: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && activeChannel) {
      socketRef.current.send(JSON.stringify({
        type: 'message',
        channelId: activeChannel.id,
        content,
        msgType: type,
        fileUrl,
        pollData
      }));
    }
  };

  const pinMessage = async (id: number, isPinned: boolean) => {
    await fetch(`/api/messages/${id}/pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ is_pinned: isPinned })
    });
  };

  const handleVote = async (messageId: number, optionIndex: number) => {
    await fetch(`/api/messages/${messageId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ optionIndex })
    });
  };

  const createChannel = async (name: string, description: string, can_post_role: string) => {
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, description, can_post_role })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
    }
  };

  const editChannel = async (id: number, name: string, description: string, can_post_role: string) => {
    const res = await fetch(`/api/channels/${id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, description, can_post_role })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
    }
  };

  const deleteChannel = async (id: number) => {
    const res = await fetch(`/api/channels/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
    }
  };

  const deleteMessage = async (id: number) => {
    await fetch(`/api/messages/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  // Fetch Channels
  useEffect(() => {
    if (!token) return;
    fetch('/api/channels', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setChannels(data);
        if (data.length > 0 && !activeChannelRef.current) {
          setActiveChannel(data[0]);
        }
      });
  }, [token]);

  // Fetch Messages when channel changes
  useEffect(() => {
    if (!token || !activeChannel) return;
    fetch(`/api/channels/${activeChannel.id}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setMessages(data));
  }, [token, activeChannel]);

  // WebSocket Setup
  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = async (event) => {
      const data: SocketMessage = JSON.parse(event.data);
      const currentChannel = activeChannelRef.current;

      if (data.type === 'new_message') {
        if (currentChannel && data.message.channel_id === currentChannel.id) {
          setMessages(prev => [...prev, data.message]);
        }
        // Notification
        if (data.message.user_id !== user?.id && Notification.permission === 'granted') {
          new Notification(`New message in #${activeChannelRef.current?.name || 'channel'}`, {
            body: `${data.message.username}: ${data.message.content}`,
          });
        }
      } else if (data.type === 'channel_created') {
        setChannels(prev => [...prev, data.channel]);
      } else if (data.type === 'channel_updated') {
        setChannels(prev => prev.map(c => c.id === data.channel.id ? data.channel : c));
        if (activeChannelRef.current?.id === data.channel.id) {
          setActiveChannel(data.channel);
        }
      } else if (data.type === 'poll_vote') {
        setMessages(prev => prev.map(m =>
          m.id === data.messageId ? {
            ...m,
            poll_data: data.pollData,
            user_vote: data.userId === user?.id ? data.optionIndex : m.user_vote
          } : m
        ));
      } else if (data.type === 'channel_deleted') {
        setChannels(prev => {
          const filtered = prev.filter(c => c.id !== data.id);
          if (currentChannel?.id === data.id) {
            setActiveChannel(filtered[0] || null);
          }
          return filtered;
        });
      } else if (data.type === 'message_pinned') {
        setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, is_pinned: data.isPinned } : m));
      } else if (data.type === 'message_deleted') {
        setMessages(prev => prev.filter(m => m.id !== data.messageId));

      } else if (data.type === 'call-offer') {
        setCallState({
          isActive: true,
          isIncoming: true,
          callerName: data.from,
          callerId: data.fromId,
          isAudioOnly: data.isAudioOnly
        });
        (window as any).pendingOffer = data.offer;
      } else if (data.type === 'call-answer') {
        if (peerConnection.current) {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          while (pendingCandidates.current.length > 0) {
            const candidate = pendingCandidates.current.shift();
            if (candidate) await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      } else if (data.type === 'ice-candidate') {
        if (peerConnection.current && peerConnection.current.remoteDescription) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          pendingCandidates.current.push(data.candidate);
        }
      } else if (data.type === 'call-hangup') {
        endCall();
      }
    };

    socketRef.current = ws;
    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [token, user, endCall]);

  if (!token || !user) {
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
