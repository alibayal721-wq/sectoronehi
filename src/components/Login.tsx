import React, { useState } from 'react';
import { Terminal, Lock, ArrowRight, ShieldOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { encryptMessage, decryptMessage } from '../lib/crypto';

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Import Firebase Auth
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { auth, db } = await import('../lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');

      // Convert username to email format (Firebase Auth requires emails)
      const email = `${username.toLowerCase()}@sector.one`;

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (authErr: any) {
        // If login fails, check if there's a pending creation request
        if (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/user-not-found') {
          const { query, collection, where, getDocs, setDoc } = await import('firebase/firestore');
          const { createUserWithEmailAndPassword } = await import('firebase/auth');

          const q = query(
            collection(db, 'user_requests'),
            where('username', '==', encryptMessage(username)),
            where('password', '==', encryptMessage(password))
          );
          const requestSnap = await getDocs(q);

          if (!requestSnap.empty) {
            // Valid request found! Auto-create the user
            const requestData = requestSnap.docs[0].data();
            const newRes = await createUserWithEmailAndPassword(auth, email, password);

            // Create user profile in Firestore
            await setDoc(doc(db, 'users', newRes.user.uid), {
              username: decryptMessage(requestData.username),
              role: 'user',
              avatar_url: null,
              created_at: new Date().toISOString()
            });

            userCredential = newRes;
          } else {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

      const firebaseUser = userCredential.user;

      // Fetch official profile from Firestore
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

      if (!userDoc.exists()) {
        // This person logged in with Auth, but someone deleted their record (Access revoked)
        await auth.signOut();
        throw new Error('access-revoked');
      }

      const userData = userDoc.data();

      if ('Notification' in window) {
        Notification.requestPermission();
      }

      onLogin('firebase-session', {
        id: firebaseUser.uid,
        username: userData.username || username,
        role: userData.role || 'user',
        avatar_url: userData.avatar_url
      });
    } catch (err: any) {
      console.error(err);
      if (err.message === 'access-revoked') {
        setError('ОШИБКА_ДОСТУПА: ВАШ ДОПУСК БЫЛ АННУЛИРОВАН.');
      } else if (err.code === 'auth/invalid-api-key' || err.message.includes('API key')) {
        setError('ОШИБКА: Нужно настроить API ключ в src/lib/firebase.ts');
      } else if (err.code) {
        setError(`${err.code}: ${err.message}`);
      } else {
        setError('Неизвестная ошибка: ' + err.toString());
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="scanline" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="hacker-panel p-8 space-y-6">
          <div className="flex flex-col items-center space-y-2">
            <div className="w-24 h-24 bg-accent/5 rounded-lg flex items-center justify-center border border-accent/20 overflow-hidden">
              <div className="text-accent font-mono font-bold text-center leading-tight">
                <div className="text-xs opacity-50">SECTOR</div>
                <div className="text-2xl tracking-tighter">ØNE</div>
              </div>
            </div>
            <h1 className="text-2xl font-mono font-bold tracking-tighter text-accent">SECTOR_ONE_v2.0</h1>
            <p className="text-text-secondary text-sm font-mono uppercase tracking-widest text-center">
              Установка соединения
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-mono text-text-secondary uppercase">Позывной</label>
                <div className="relative">
                  <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="hacker-input w-full pl-10"
                    placeholder="USERNAME"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-text-secondary uppercase">Пароль</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="hacker-input w-full pl-10"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono leading-tight">
                ОШИБКА_СИСТЕМЫ: {error.toUpperCase()}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="hacker-btn-primary w-full font-mono uppercase tracking-widest flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'ОБРАБОТКА...' : 'АВТОРИЗОВАТЬ_ДОСТУП'}</span>
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          {/* No-registration notice */}
          <div className="pt-4 border-t border-border">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="w-full text-xs font-mono text-text-secondary hover:text-accent transition-colors uppercase text-center"
            >
              Нет аккаунта?
            </button>

            <AnimatePresence>
              {showInfo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-3 bg-accent/5 border border-accent/20 rounded-sm flex items-start space-x-3">
                    <ShieldOff className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                    <p className="text-[10px] font-mono text-text-secondary leading-relaxed">
                      Самостоятельная регистрация закрыта.<br />
                      Аккаунт выдаёт <span className="text-accent">администратор</span> системы.<br />
                      Обратитесь к нему для получения доступа.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
