import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Save, UserCircle, Camera } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { storage, auth } from '../lib/firebase';

interface SettingsModalProps {
  user: any;
  onClose: () => void;
  onUpdate: (username: string, avatar_url?: string) => void;
}

export default function SettingsModal({ user, onClose, onUpdate }: SettingsModalProps) {
  const [username, setUsername] = useState(user.username);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const storageRef = ref(storage, `avatars/${user.id}_${Date.now()}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      setAvatarUrl(downloadURL);
    } catch (err: any) {
      setError('Ошибка загрузки аватара');
    } finally {
      setLoading(false);
    }
  };

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handlePasswordChange = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!oldPassword.trim() || !newPassword.trim()) {
      setError('Требуются и старый, и новый пароли');
      return;
    }
    setLoading(true);
    setPasswordSuccess(false);
    setError('');
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || !firebaseUser.email) throw new Error('Пользователь не авторизован');

      const credential = EmailAuthProvider.credential(firebaseUser.email, oldPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);

      setPasswordSuccess(true);
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      console.error(err);
      setError(err.code === 'auth/wrong-password' ? 'Неверный текущий пароль' : 'Ошибка смены пароля');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // In Firebase flow, the update logic is handled by the parent App component
      // which updates the Firestore 'users' collection.
      await onUpdate(username, avatarUrl);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="hacker-panel w-full max-w-md p-6 space-y-6 overflow-y-auto max-h-[90vh]"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-mono font-bold text-accent">СИСТЕМНЫЕ_НАСТРОЙКИ</h3>
          <button onClick={onClose} className="text-text-secondary hover:text-accent">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <div className="relative group">
            <div className="w-24 h-24 bg-accent/10 border border-accent/20 rounded-full flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="w-12 h-12 text-accent" />
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full"
            >
              <Camera className="w-6 h-6 text-white" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleAvatarUpload}
              accept="image/*"
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-mono font-bold underline decoration-accent/30">{user.username}</p>
            <p className="text-[10px] font-mono text-text-secondary uppercase">{user.role === 'admin' ? 'Администратор' : 'Оперативник'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-text-secondary uppercase tracking-widest">Обновить позывной</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="hacker-input w-full text-xs"
              placeholder="NEW_USERNAME"
            />
          </div>

          <button
            type="submit"
            disabled={loading || (username === user.username && avatarUrl === user.avatar_url)}
            className="hacker-btn-primary w-full flex items-center justify-center space-x-2 py-2 text-xs"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'ОБНОВЛЕНИЕ...' : 'ОБНОВИТЬ_ПРОФИЛЬ'}</span>
          </button>
        </form>

        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-text-secondary uppercase tracking-widest">Обновить пароль</label>
            <div className="space-y-3">
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="hacker-input w-full text-xs"
                placeholder="CURRENT_PASSWORD"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="hacker-input w-full text-xs"
                placeholder="NEW_PASSWORD"
              />
            </div>
          </div>

          {passwordSuccess && <p className="text-[10px] font-mono text-green-500 uppercase">Успех: Ключ доступа обновлен</p>}

          <button
            onClick={handlePasswordChange}
            type="button"
            disabled={loading || !newPassword || !oldPassword}
            className="w-full py-2 border border-accent/20 hover:bg-accent/10 text-accent text-[10px] font-mono uppercase transition-all rounded-sm"
          >
            Обновить пароль
          </button>
        </div>

        {error && <p className="text-[10px] font-mono text-red-500 bg-red-500/10 p-2 border border-red-500/20 uppercase">Ошибка: {error}</p>}
      </motion.div>
    </div>
  );
}
