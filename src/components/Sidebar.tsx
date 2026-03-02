import React, { useState } from 'react';
import { Hash, Plus, Trash2, LogOut, Settings, ShieldCheck, Edit, X as CloseIcon, UserPlus } from 'lucide-react';
import { Channel, User } from '../types';
import { motion, AnimatePresence } from 'motion/react';
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
  onToggle
}: SidebarProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [canPostRole, setCanPostRole] = useState<'admin' | 'user'>('user');

  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userRequestStatus, setUserRequestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

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
    } catch (err) {
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
          <div className="px-2 py-2 flex items-center justify-between text-text-secondary">
            <span className="text-[10px] font-mono uppercase tracking-widest">Каналы</span>
            {user.role === 'admin' && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={onOpenMembers}
                  className="hover:text-accent transition-colors"
                  title="Управление оперативниками"
                >
                  <ShieldCheck className="w-4 h-4" />
                </button>
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
              </div>
            )}
          </div>

          <nav className="space-y-0.5 px-2">
            {channels.map((channel) => (
              <div key={channel.id} className="group flex items-center">
                <button
                  onClick={() => {
                    onSelectChannel(channel);
                    onToggle(); // Dismiss mobile menu when channel selected
                  }}
                  className={`flex-1 flex items-center px-3 py-1.5 rounded-sm transition-all text-xs font-mono relative overflow-hidden group
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
