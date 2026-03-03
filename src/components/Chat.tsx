import React, { useState, useEffect, useRef } from 'react';
import { Send, Hash, Cpu, Pin, Paperclip, Video, Phone, Menu, X, BarChart3, Plus, Trash2, Cloud, Camera } from 'lucide-react';
import { Channel, Message, User, PollData } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { decryptMessage } from '../lib/crypto';

interface ChatProps {
  channel: Channel;
  messages: Message[];
  onSendMessage: (content: string, type?: string, fileUrl?: string, pollData?: any) => void;
  onPinMessage: (id: string, isPinned: boolean) => void;
  onDeleteMessage: (id: string, fileUrl?: string) => void;
  onVote: (messageId: string, optionIndex: number) => void;
  onStartCall: (isAudioOnly?: boolean) => void;
  user: User;
  onToggleSidebar: () => void;
  isCloud?: boolean;
}

export default function Chat({ channel, messages, onSendMessage, onPinMessage, onDeleteMessage, onVote, onStartCall, user, onToggleSidebar, isCloud }: ChatProps) {
  const [input, setInput] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [votingMsgId, setVotingMsgId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const canPost = (channel.can_post_role || 'user') === 'user' || user.role === 'admin';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    const filteredOptions = pollOptions.filter((opt: string) => opt.trim() !== '');
    if (pollQuestion.trim() && filteredOptions.length >= 2) {
      const pollData: PollData = {
        question: pollQuestion.trim(),
        options: filteredOptions.map(opt => ({ text: opt.trim(), votes: 0 }))
      };
      onSendMessage(pollQuestion.trim(), 'poll', undefined, pollData);
      setPollQuestion('');
      setPollOptions(['', '']);
      setShowPollModal(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        },
        (error) => {
          console.error('Upload error:', error);
          alert(`Upload failed: ${error.message}`);
          setIsUploading(false);
          setUploadProgress(null);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          onSendMessage(file.name, type, downloadURL);
          setIsUploading(false);
          setUploadProgress(null);
        }
      );
    } catch (err: any) {
      console.error('Upload catch error:', err);
      alert(`Unexpected error: ${err.message}`);
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const pinnedMessages = messages.filter((m: Message) => m.is_pinned);

  return (
    <div className="flex flex-col h-full bg-bg relative">
      {/* Background Grid Effect */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(#00ff41 1px, transparent 1px), linear-gradient(90deg, #00ff41 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Header */}
      <div className="h-auto min-h-[56px] border-b border-border flex items-center justify-between px-3 sm:px-4 lg:px-6 bg-surface/50 backdrop-blur-md z-10 py-2 gap-2">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
          <button onClick={onToggleSidebar} className="lg:hidden text-text-secondary hover:text-accent p-1.5 shrink-0">
            <Menu className="w-5 h-5" />
          </button>
          {isCloud ? (
            <Cloud className="w-5 h-5 text-accent animate-pulse shrink-0" />
          ) : (channel.description?.includes('ПРЯМОЙ_ДЕШИФРОВАННЫЙ_КАНАЛ') ? (
            <div className="w-8 h-8 rounded-full overflow-hidden border border-accent/20 shrink-0">
              <img src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${channel.name}`} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <Hash className={`w-5 h-5 shrink-0 ${channel.can_post_role === 'admin' ? 'text-red-500' : 'text-accent'}`} />
          ))}
          <div className="min-w-0 flex-1">
            <h2 className="font-mono font-bold text-sm tracking-tight truncate">{channel.name.toUpperCase()}</h2>
            <p className="hidden sm:block text-[10px] font-mono text-text-secondary truncate max-w-[200px] md:max-w-md">{channel.description}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
          {!isCloud && (
            <>
              <button
                onClick={() => onStartCall(true)}
                className="p-2.5 text-text-secondary hover:text-accent transition-colors rounded-sm hover:bg-accent/10 active:scale-95"
                title="Аудиозвонок"
              >
                <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={() => onStartCall(false)}
                className="p-2.5 text-text-secondary hover:text-accent transition-colors rounded-sm hover:bg-accent/10 active:scale-95"
                title="Видеозвонок"
              >
                <Video className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </>
          )}
          <button
            onClick={() => setShowPins(!showPins)}
            className={`p-2.5 transition-colors rounded-sm active:scale-95 ${showPins ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-accent hover:bg-accent/10'}`}
            title="Закреплённые сообщения"
          >
            <Pin className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Pinned Panel */}
      <AnimatePresence>
        {showPins && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-surface/80 backdrop-blur-md border-b border-border z-20 overflow-hidden"
          >
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-accent uppercase tracking-widest">Закрепленная информация</span>
                <button onClick={() => setShowPins(false)}><X className="w-4 h-4 text-text-secondary" /></button>
              </div>
              {pinnedMessages.length === 0 ? (
                <p className="text-[10px] font-mono text-text-secondary italic">Закрепленных данных не найдено.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {pinnedMessages.map((m: Message) => (
                    <div key={m.id} className="p-2 bg-bg border border-border rounded flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-mono text-accent">{m.username}</p>
                        <p className="text-xs font-mono truncate">{decryptMessage(m.content)}</p>
                      </div>
                      <button onClick={() => onPinMessage(m.id, false)} className="text-text-secondary hover:text-red-500" title="Открепить">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-6 space-y-4 z-10"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
            <Cpu className="w-12 h-12 text-accent animate-pulse" />
            <p className="font-mono text-xs text-accent uppercase tracking-widest">Ожидание пакетов входящих данных...</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prevMsg = messages[idx - 1];
            const showHeader = !prevMsg || prevMsg.user_id !== msg.user_id;

            return (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={msg.id}
                className={`flex flex-col ${showHeader ? 'mt-4' : 'mt-0.5'}`}
              >
                {showHeader && (
                  <div className="flex items-center space-x-2 mb-1">
                    <span className={`text-xs font-mono font-bold ${msg.username === 'admin' ? 'text-red-500' : 'text-accent'}`}>
                      {msg.username.toUpperCase()}
                    </span>
                    <span className={`text-[8px] font-mono px-1 rounded-sm uppercase tracking-tighter ${msg.user_role === 'admin' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-accent/10 text-accent border border-accent/20'}`}>
                      {msg.user_role === 'admin' ? 'ВЕРХОВНЫЙ ЛИДЕР' : 'ОПЕРАТИВНИК'}
                    </span>
                    <span className="text-[9px] font-mono text-text-secondary">
                      [{new Date(msg.timestamp).toLocaleTimeString()}]
                    </span>
                    {msg.is_pinned && <Pin className="w-3 h-3 text-accent" />}
                  </div>
                )}
                <div className="group flex items-start space-x-3 relative">
                  <div className="flex-1 text-sm font-mono text-text-primary leading-relaxed break-words">
                    {msg.type === 'poll' && msg.poll_data ? (
                      <div className="my-2 p-4 hacker-panel max-w-sm space-y-3 bg-accent/5 border-accent/20">
                        <div className="flex items-center space-x-2 text-accent mb-2">
                          <BarChart3 className="w-4 h-4" />
                          <span className="text-[10px] font-mono uppercase tracking-widest">Активный_Опрос</span>
                        </div>
                        <h4 className="text-sm font-bold text-text-primary">{decryptMessage(msg.content)}</h4>
                        <div className="space-y-2">
                          {(() => {
                            const poll = JSON.parse(decryptMessage(msg.poll_data!)) as PollData;
                            const totalVotes = poll.options.reduce((acc: number, opt: any) => acc + (opt.votes || 0), 0);
                            return poll.options.map((option, oIdx) => {
                              const percentage = totalVotes === 0 ? 0 : Math.round(((option.votes || 0) / totalVotes) * 100);
                              return (
                                <button
                                  key={oIdx}
                                  onClick={async () => {
                                    if (msg.user_vote === oIdx || votingMsgId === msg.id) return;
                                    setVotingMsgId(msg.id);
                                    try {
                                      await onVote(msg.id, oIdx);
                                    } finally {
                                      setVotingMsgId(null);
                                    }
                                  }}
                                  disabled={votingMsgId === msg.id}
                                  className="w-full text-left relative group/opt overflow-hidden"
                                >
                                  <div className={`flex items-center justify-between p-2 border rounded text-[11px] relative z-10 transition-colors
                                    ${msg.user_vote === oIdx
                                      ? 'border-accent bg-accent/10'
                                      : 'border-border hover:border-accent/50'
                                    }`}>
                                    <span className={msg.user_vote === oIdx ? 'text-accent font-bold' : ''}>{option.text}</span>
                                    <span className="text-[10px] text-text-secondary opacity-50 group-hover/opt:opacity-100">{option.votes || 0} [{percentage}%]</span>
                                  </div>
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    className="absolute inset-0 bg-accent/10 pointer-events-none"
                                  />
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : msg.type === 'image' && msg.file_url ? (
                      <img src={msg.file_url} alt="Uploaded" className="max-w-xs rounded border border-border mt-1" referrerPolicy="no-referrer" />
                    ) : msg.type === 'video' && msg.file_url ? (
                      <video src={msg.file_url} controls className="max-w-xs rounded border border-border mt-1" />
                    ) : msg.type === 'file' && msg.file_url ? (
                      <a href={msg.file_url} target="_blank" rel="noreferrer" className="flex items-center space-x-2 p-2 bg-surface border border-border rounded hover:border-accent transition-colors mt-1">
                        <Paperclip className="w-4 h-4 text-accent" />
                        <span className="text-xs underline">{decryptMessage(msg.content)}</span>
                      </a>
                    ) : (
                      decryptMessage(msg.content)
                    )}
                  </div>
                  <button
                    onClick={() => onPinMessage(msg.id, !msg.is_pinned)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-accent transition-all"
                    title="Закрепить"
                  >
                    <Pin className={`w-3.5 h-3.5 ${msg.is_pinned ? 'fill-accent text-accent' : ''}`} />
                  </button>
                  {(user.role === 'admin' || msg.user_id === user.id) && (
                    <button
                      onClick={() => {
                        if (window.confirm('Удалить сообщение?')) onDeleteMessage(msg.id, msg.file_url);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-text-secondary hover:text-red-500 transition-all"
                      title="Удалить сообщение"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="sticky bottom-0 p-3 sm:p-4 bg-bg border-t border-border z-20">
        <form
          onSubmit={handleSend}
          className="hacker-panel flex items-center p-1 bg-surface/80 backdrop-blur-md border-accent/20 focus-within:border-accent/50 transition-all"
        >
          {canPost && (
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="p-2 text-text-secondary hover:text-accent transition-colors"
                title="Сделать фото"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-text-secondary hover:text-accent transition-colors"
                title="Прикрепить файл"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="p-2 text-text-secondary hover:text-accent transition-colors"
                title="Снять видео"
              >
                <Video className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowPollModal(true)}
                className="p-2 text-text-secondary hover:text-accent transition-colors"
                title="Создать опрос"
              >
                <BarChart3 className="w-4 h-4" />
              </button>
            </div>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none px-2 py-2 text-base font-mono text-text-primary placeholder:text-text-secondary/30 disabled:cursor-not-allowed"
            style={{ fontSize: '16px' }}
            placeholder={!canPost ? 'РЕЖИМ_ЧТЕНИЯ' : (isUploading ? 'ЗАГРУЗКА...' : `СООБЩЕНИЕ...`)}
            disabled={isUploading || !canPost}
            enterKeyHint="send"
          />

          <button
            type="submit"
            disabled={!input.trim() || isUploading || !canPost}
            className="p-3 text-accent hover:bg-accent/10 rounded transition-colors disabled:opacity-30 active:bg-accent/20 shrink-0"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          >
            <Send className="w-5 h-5" />
          </button>

          {/* Hidden Inputs */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'file')}
          />
          <input
            type="file"
            ref={videoInputRef}
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'video')}
            accept="video/*"
            capture="environment"
          />
          <input
            type="file"
            ref={cameraInputRef}
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'image')}
            accept="image/*"
            capture="environment"
          />
        </form>
        <div className="mt-2 flex justify-between">
          <div className="flex space-x-3">
            <span className="text-[8px] font-mono text-text-secondary uppercase">Статус: Зашифровано</span>
            <span className="text-[8px] font-mono text-text-secondary uppercase">{isCloud ? 'Протокол: BROADCAST_CLOUD' : 'Протокол: P2P_ENCRYPTED'}</span>
          </div>
          <span className="text-[8px] font-mono text-text-secondary uppercase">Символов: {input.length}/2000</span>
        </div>
      </div>

      {/* Survey Creation Modal */}
      <AnimatePresence>
        {showPollModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPollModal(false)}
              className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="hacker-panel w-full max-w-md p-6 space-y-4 relative z-10"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-mono font-bold text-accent tracking-tighter uppercase flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Инициализировать_Опрос
                </h3>
                <button onClick={() => setShowPollModal(false)}><X className="w-5 h-5 text-text-secondary" /></button>
              </div>

              <form onSubmit={handleCreatePoll} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-text-secondary uppercase">Вопрос опроса</label>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    className="hacker-input w-full text-sm"
                    placeholder="Введите ваш вопрос..."
                    autoFocus
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-text-secondary uppercase flex justify-between">
                    Варианты
                    <span className="text-accent">{pollOptions.length}/5</span>
                  </label>
                  {pollOptions.map((option: string, idx: number) => (
                    <div key={idx} className="flex space-x-2">
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => {
                          const newOpts = [...pollOptions];
                          newOpts[idx] = e.target.value;
                          setPollOptions(newOpts);
                        }}
                        className="hacker-input flex-1 text-xs"
                        placeholder={`Option ${idx + 1}`}
                        required={idx < 2}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          className="p-2 text-text-secondary hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 5 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions([...pollOptions, ''])}
                      className="text-[10px] font-mono text-accent flex items-center hover:underline uppercase"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Добавить_вариант
                    </button>
                  )}
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowPollModal(false)}
                    className="flex-1 py-2 border border-border text-[10px] font-mono uppercase hover:bg-surface transition-all rounded-sm font-bold"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 hacker-btn-primary text-[10px] font-mono uppercase rounded-sm font-bold"
                  >
                    Развернуть_Опрос
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Upload Progress Overlay */}
      <AnimatePresence>
        {isUploading && uploadProgress !== null && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs"
          >
            <div className="hacker-panel p-4 space-y-2 bg-surface/90 backdrop-blur-xl border-accent/40 shadow-2xl shadow-accent/10">
              <div className="flex justify-between items-center text-[10px] font-mono text-accent uppercase tracking-widest">
                <span>Передача данных...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-bg border border-border rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[8px] font-mono text-text-secondary text-center uppercase">Максимальный размер (Firebase Cloud): 5GB</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
