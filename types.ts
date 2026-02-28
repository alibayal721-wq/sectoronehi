export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  avatar_url?: string;
}

export interface PollData {
  question: string;
  options: { text: string; votes: number }[];
}

export interface Channel {
  id: number;
  name: string;
  description: string;
  can_post_role: 'admin' | 'user';
}

export interface Message {
  id: number;
  channel_id: number;
  user_id: number;
  username: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'file' | 'poll';
  file_url?: string;
  poll_data?: string; // JSON string
  user_vote?: number | null;
  is_pinned: boolean;
  timestamp: string;
}

export type SocketMessage =
  | { type: 'new_message'; message: Message }
  | { type: 'message_deleted'; messageId: number }
  | { type: 'channel_created'; channel: Channel }
  | { type: 'channel_updated'; channel: Channel }
  | { type: 'channel_deleted'; id: number }
  | { type: 'message_pinned'; messageId: number; isPinned: boolean }
  | { type: 'poll_vote'; messageId: number; pollData: string; optionIndex: number; userId: number }
  | { type: 'call-offer'; offer: any; from: string; fromId: number; isAudioOnly?: boolean }
  | { type: 'call-answer'; answer: any; from: string; fromId: number }
  | { type: 'ice-candidate'; candidate: any; from: string; fromId: number }
  | { type: 'call-hangup'; from: string; fromId: number };
