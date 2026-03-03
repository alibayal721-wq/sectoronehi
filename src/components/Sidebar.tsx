import React, { useState } from 'react';
import { Hash, Plus, Trash2, LogOut, Settings, ShieldCheck, Edit, X as CloseIcon, UserPlus, Users, MessageSquare } from 'lucide-react';
import { Channel, User } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { encryptMessage } from '../lib/crypto';

interface SidebarProps {
  channels: Channel[];
  activeChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  user: User;
  onLogout: () => void;
  onCreateChannel: (name: string, desc: string, can_post_role: 'admin' | 'user') => void;
  onEditChannel: (id: string, name: string, desc: string, can_post_role: 'admin' | 'user') => void;
  onDeleteChannel: (id: string) => void;
  onOpenSettings: () => void;
  onOpenMembers: () => void;
  isOpen: boolean;
  onToggle: () => void;
  directMessages: User[];
  activeDM: User | null;
  onSelectDM: (user: User) => void;
}

export default function Sidebar({
  channels,
  activeChannel,
  onSelectChannel,
  user,
  onLogout,
  onCreateChannel,
  onEditChannel,
  onDeleteChannel,
  onOpenSettings,
  onOpenMembers,
  isOpen,
  onToggle,
  directMessages,
  activeDM,
  onSelectDM,
}: SidebarProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [canPostRole, setCanPostRole] = useState<'admin' | 'user'>('user');
  const [showDMPanel, setShowDMPanel] = useState(false);
  const [allMembers, setAllMembers] = useState<User[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userRequestStatus, setUserRequestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const fetchMembers = async () => {
    setMembersLoading(true);
    try {
      const { db } = await import('../lib/firebase');
      const { collection, getDocs, query } = await import('firebase/firestore');
      const snap = await getDocs(query(collection(db, 'users')));
      setAllMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
    } catch (e) {
      console.error('Failed to load members:', e);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleOpenDMPanel = () => {
    setShowDMPanel(v => {
      if (!v) fetchMembers();
      return !v;
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      if (editingChannel) {
        onEditChannel(editingChannel.id, newName.trim(), newDesc.trim(), canPostRole);
      } else {
        onCreateChannel(newName.trim(), newDesc.trim(), canPostRole);
      }
      setNewName('');
      setNewDesc('');
      setCanPostRole('user');
      setShowCreateModal(false);
      setEditingChannel(null);
    }
  };

  const openEdit = (channel: Channel) => {
    setEditingChannel(channel);
    setNewName(channel.name);
    setNewDesc(channel.description);
    setCanPostRole(channel.can_post_role || 'user');
    setShowCreateModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserUsername || !newUserPassword) return;

    setUserRequestStatus('loading');
    try {
      const { db } = await import('../lib/firebase');
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

      // Instead of an API call, we create a request in Firestore
      // Admins can then create the user in Firebase Console
      await addDoc(collection(db, 'user_requests'), {
        username: encryptMessage(newUserUsername),
        password: encryptMessage(newUserPassword),
        requestedBy: user.username,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      setUserRequestStatus('success');
      setNewUserUsername('');
      setNewUserPassword('');
      setTimeout(() => {
        setShowCreateUserModal(false);
        setUserRequestStatus('idle');
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setUserRequestStatus('error');
    }
  };

  const sidebarClasses = `
    fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-border flex flex-col transition-transform duration-300 ease-in-out
    ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    lg:relative
  `;

  return (
    <>
      {/* Mobile Scrim */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
            className="lg:hidden fixed inset-0 bg-bg/80 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>
      <div className={sidebarClasses}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 hacker-panel flex items-center justify-center">
              <span className="text-accent text-[10px] font-bold">SØ</span>
            </div>
            <span className="font-mono font-bold tracking-tighter text-sm">SECTOR_ONE</span>
          </div>
          <button onClick={onToggle} className="lg:hidden text-text-secondary hover:text-accent p-1">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {/* DM Button */}
          <div className="px-2 mb-4">
            <button
              onClick={handleOpenDMPanel}
              className={`w-full flex items-center px-3 py-2.5 rounded-sm transition-all font-mono border group
                ${showDMPanel
                  ? 'bg-accent/10 text-accent border-accent/40'
                  : 'text-text-secondary border-border/40 hover:bg-surface hover:text-text-primary hover:border-accent/20'
                }`}
            >
              <MessageSquare className={`w-4 h-4 mr-3 transition-transform ${showDMPanel ? 'text-accent scale-110' : 'text-text-secondary'}`} />
              <div className="flex flex-col items-start">
                <span className="text-xs font-bold tracking-wider">ПРЯМАЯ_СВЯЗЬ</span>
                <span className="text-[9px] opacity-50">Выбрать оперативника...</span>
              </div>
              <span className={`ml-auto text-[9px] font-mono transition-transform ${showDMPanel ? 'rotate-180 text-accent' : ''}`}>▾</span>
            </button>

            {/* Members List Panel */}
            <AnimatePresence>
              {showDMPanel && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="mt-1 border border-border/60 rounded-sm bg-bg overflow-y-auto max-h-56">
                    {membersLoading ? (
                      <div className="p-4 flex justify-center">
                        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : allMembers.length === 0 ? (
                      <p className="p-3 text-[10px] font-mono text-text-secondary italic text-center">Нет оперативников</p>
                    ) : (
                      allMembers
                        .filter(m => m.id !== user.id)
                        .map(member => (
                          <button
                            key={member.id}
                            onClick={() => {
                              onSelectDM(member);
                              setShowDMPanel(false);
                              // Only close sidebar on mobile (when it's an overlay)
                              if (isOpen) onToggle();
                            }}
                            className="w-full flex items-center px-3 py-3 hover:bg-accent/10 hover:text-accent transition-all text-left border-b border-border/30 last:border-0 active:bg-accent/20"
                          >
                            <div className="w-7 h-7 rounded-sm overflow-hidden border border-border mr-2.5 flex-shrink-0">
                              <img
                                src={member.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${member.username}`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-mono font-bold truncate">{member.username.toUpperCase()}</p>
                              <p className="text-[9px] font-mono text-text-secondary">{member.role === 'admin' ? 'ВЕРХОВНЫЙ ЛИДЕР' : 'ОПЕРАТИВНИК'}</p>
                            </div>
                            <MessageSquare className="w-3.5 h-3.5 ml-auto text-accent/50 shrink-0" />
                          </button>
                        ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="px-2 py-2 flex items-center justify-between text-text-secondary">
            <span className="text-[10px] font-mono uppercase tracking-widest">Каналы</span>
            <div className="flex items-center space-x-2">
              <button
                onClick={onOpenMembers}
                className="hover:text-accent transition-colors"
                title="Список оперативников"
              >
                <Users className="w-4 h-4" />
              </button>
              {user.role === 'admin' && (
                <>
                  <button
                    onClick={() => setShowCreateUserModal(true)}
                    className="hover:text-accent transition-colors"
                    title="Создать нового оперативника"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingChannel(null);
                      setNewName('');
                      setNewDesc('');
                      setShowCreateModal(true);
                    }}
                    className="hover:text-accent transition-colors"
                    title="Создать канал"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          <nav className="space-y-0.5 px-2">
            {channels.map((channel) => (
              <div key={channel.id} className="group flex items-center">
                <button
                  onClick={() => {
                    onSelectChannel(channel);
                    if (isOpen) onToggle(); // Dismiss mobile menu when channel selected
                  }}
                  className={`flex-1 flex items-center px-3 py-2.5 rounded-sm transition-all text-xs font-mono relative overflow-hidden group active:bg-accent/20
                    ${activeChannel?.id === channel.id
                      ? 'bg-accent/10 text-accent border-l-2 border-accent'
                      : 'text-text-secondary hover:bg-surface/50 hover:text-text-primary'
                    }`}
                >
                  <Hash className={`w-3.5 h-3.5 mr-2 ${activeChannel?.id === channel.id ? 'text-accent' : 'text-text-secondary'}`} />
                  <span className="truncate">{channel.name}</span>
                  {activeChannel?.id === channel.id && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute right-2 w-1 h-3 bg-accent rounded-full"
                    />
                  )}
                </button>
                <div className="flex items-center space-x-1 px-1">
                  {channel.can_post_role === 'admin' && (
                    <div title="Только для админов">
                      <ShieldCheck className="w-3 h-3 text-red-500 opacity-50" />
                    </div>
                  )}
                  {user.role === 'admin' && (
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(channel);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-accent transition-all"
                        title="Редактировать"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Удалить канал #${channel.name}?`)) {
                            onDeleteChannel(channel.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </nav>

          <div className="px-2 py-4 flex items-center justify-between text-text-secondary">
            <span className="text-[10px] font-mono uppercase tracking-widest">Прямая_Связь</span>
          </div>

          <nav className="space-y-0.5 px-2">
            {directMessages.length === 0 ? (
              <p className="px-3 py-2 text-[10px] font-mono text-text-secondary/50 italic uppercase">Нет активных контактов</p>
            ) : (
              directMessages.map((dmUser) => (
                <button
                  key={dmUser.id}
                  onClick={() => {
                    onSelectDM(dmUser);
                    if (isOpen) onToggle();
                  }}
                  className={`w-full flex items-center px-3 py-1.5 rounded-sm transition-all text-xs font-mono relative overflow-hidden group
                    ${activeDM?.id === dmUser.id
                      ? 'bg-accent/10 text-accent border-l-2 border-accent'
                      : 'text-text-secondary hover:bg-surface/50 hover:text-text-primary'
                    }`}
                >
                  <div className="w-3.5 h-3.5 mr-2 rounded-full overflow-hidden border border-current opacity-70">
                    <img
                      src={dmUser.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${dmUser.username}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="truncate">{dmUser.username}</span>
                  {activeDM?.id === dmUser.id && (
                    <motion.div
                      layoutId="active-dm-pill"
                      className="absolute right-2 w-1 h-3 bg-accent rounded-full"
                    />
                  )}
                </button>
              ))
            )}
          </nav>
        </div>

        <div className="p-4 border-t border-border bg-surface/50">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 rounded-sm overflow-hidden border border-accent/20">
              <img src={user.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${user.username}`} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-mono font-bold truncate">{user.username.toUpperCase()}</p>
              <div className="flex items-center text-[10px] font-mono text-text-secondary">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
                <span>{user.role === 'admin' ? 'ВЕРХОВНЫЙ ЛИДЕР' : 'ОПЕРАТИВНИК'}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-center py-2 hacker-button text-[10px] font-mono uppercase"
            >
              <Settings className="w-3 h-3 mr-1.5" />
              Настройки
            </button>
            <button
              onClick={onLogout}
              className="flex items-center justify-center py-2 border border-border hover:bg-red-500/10 hover:text-red-500 transition-all text-[10px] font-mono uppercase rounded-sm"
            >
              <LogOut className="w-3 h-3 mr-1.5" />
              Выход
            </button>
          </div>
        </div>

        {/* Create/Edit Channel Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingChannel(null);
                }}
                className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="hacker-panel w-full max-w-sm p-6 space-y-4 relative z-10"
              >
                <h3 className="text-lg font-mono font-bold text-accent">
                  {editingChannel ? 'НАСТРОЙКА_КАНАЛА' : 'ИНИЦИАЛИЗАЦИЯ_КАНАЛА'}
                </h3>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-secondary uppercase">Название канала</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
                      className="hacker-input w-full text-xs"
                      placeholder="напр. скрытые-операции"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-secondary uppercase">Описание</label>
                    <textarea
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className="hacker-input w-full text-xs min-h-[80px]"
                      placeholder="Детали передачи..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-secondary uppercase">Разрешения на отправку</label>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => setCanPostRole('user')}
                        className={`flex-1 py-1.5 text-[10px] font-mono uppercase rounded-sm border ${canPostRole === 'user' ? 'bg-accent/20 border-accent text-accent' : 'border-border text-text-secondary hover:bg-surface'}`}
                      >
                        Все
                      </button>
                      <button
                        type="button"
                        onClick={() => setCanPostRole('admin')}
                        className={`flex-1 py-1.5 text-[10px] font-mono uppercase rounded-sm border ${canPostRole === 'admin' ? 'bg-accent/20 border-accent text-accent' : 'border-border text-text-secondary hover:bg-surface'}`}
                      >
                        Только админы
                      </button>
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setEditingChannel(null);
                      }}
                      className="flex-1 py-2 border border-border text-[10px] font-mono uppercase hover:bg-surface transition-all rounded-sm"
                    >
                      ОТМЕНА
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 hacker-btn-primary text-[10px] font-mono uppercase rounded-sm"
                    >
                      {editingChannel ? 'СОХРАНИТЬ' : 'СОЗДАТЬ'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Create Operative Modal */}
        <AnimatePresence>
          {showCreateUserModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowCreateUserModal(false)}
                className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="hacker-panel w-full max-w-sm p-6 space-y-4 relative z-10"
              >
                <h3 className="text-lg font-mono font-bold text-accent">СОЗДАТЬ_НОВОГО_ОПЕРАТИВНИКА</h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-secondary uppercase">Позывной (Имя пользователя)</label>
                    <input
                      type="text"
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      className="hacker-input w-full text-xs"
                      placeholder="напр. s.ivanov-42"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-text-secondary uppercase">Ключ доступа (Пароль)</label>
                    <input
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="hacker-input w-full text-xs"
                      placeholder="УСТАНОВИТЬ_ПАРОЛЬ"
                    />
                  </div>

                  {userRequestStatus === 'success' && <p className="text-[10px] font-mono text-green-500 uppercase">Успех: Оперативник создан</p>}
                  {userRequestStatus === 'error' && <p className="text-[10px] font-mono text-red-500 uppercase">Ошибка: Не удалось создать оперативника</p>}

                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateUserModal(false)}
                      className="flex-1 py-2 border border-border text-[10px] font-mono uppercase hover:bg-surface transition-all rounded-sm"
                    >
                      ОТМЕНА
                    </button>
                    <button
                      type="submit"
                      disabled={userRequestStatus === 'loading'}
                      className="flex-1 py-2 hacker-btn-primary text-[10px] font-mono uppercase rounded-sm"
                    >
                      {userRequestStatus === 'loading' ? 'СОЗДАНИЕ...' : 'ИНИЦИАЛИЗИРОВАТЬ'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
