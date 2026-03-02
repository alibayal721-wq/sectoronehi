export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  avatar_url?: string;
}

export interface PollData {
  question: string;
  options: { text: string; votes: number }[];
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  can_post_role: 'admin' | 'user';
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  username: string;
  user_role: 'admin' | 'user';
  content: string;
  type: 'text' | 'image' | 'video' | 'file' | 'poll';
  file_url?: string;
  poll_data?: string; // JSON string
  user_vote?: number | null;
  is_pinned: boolean;
  timestamp: any; // Firestore Timestamp
}

export type SocketMessage =
  | { type: 'new_message'; message: Message }
  | { type: 'message_deleted'; messageId: string }
  | { type: 'channel_created'; channel: Channel }
  | { type: 'channel_updated'; channel: Channel }
  | { type: 'channel_deleted'; id: string }
  | { type: 'message_pinned'; messageId: string; isPinned: boolean }
  | { type: 'poll_vote'; messageId: string; pollData: string; optionIndex: number; userId: string }
  | { type: 'call-offer'; offer: any; from: string; fromId: string; isAudioOnly?: boolean }
  | { type: 'call-answer'; answer: any; from: string; fromId: string }
  | { type: 'ice-candidate'; candidate: any; from: string; fromId: string }
  | { type: 'call-hangup'; from: string; fromId: string };
