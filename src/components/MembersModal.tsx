import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Trash2, MessageSquare } from 'lucide-react';
import { User } from '../types';
import { db } from '../lib/firebase';
import { collection, query, getDocs, deleteDoc, doc } from 'firebase/firestore';

interface MembersModalProps {
    onClose: () => void;
    currentUser: User;
    onStartDM: (user: User) => void;
}

export default function MembersModal({ onClose, currentUser, onStartDM }: MembersModalProps) {
    const [members, setMembers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<{ id: string, username: string } | null>(null);

    const fetchMembers = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'users'));
            const snapshot = await getDocs(q);
            const membersList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as User));
            setMembers(membersList.filter(m => m.username !== 'admin')); // Filter out the master admin if needed, but the user asked for "deleting members"
        } catch (err: any) {
            setError('Ошибка загрузки базы данных оперативников');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMembers();
    }, []);

    const handleDelete = async () => {
        if (!confirmDelete) return;
        const { id, username } = confirmDelete;

        try {
            console.log(`SECTOR_ONE: Attempting to delete user ${id} (${username})`);
            await deleteDoc(doc(db, 'users', id));
            console.log("SECTOR_ONE: User document deleted from Firestore");
            setMembers(members.filter(m => m.id !== id));
            setConfirmDelete(null);
        } catch (err: any) {
            console.error("SECTOR_ONE: Delete error:", err);
            alert(`Ошибка при удалении допуска: ${err.code || err.message}`);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="hacker-panel w-full max-w-2xl p-6 space-y-6 overflow-y-auto max-h-[90vh] relative"
            >
                {/* Custom Confirmation Overlay */}
                <AnimatePresence>
                    {confirmDelete && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[110] bg-bg/95 flex flex-col items-center justify-center p-8 text-center space-y-6"
                        >
                            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center animate-pulse">
                                <Trash2 className="w-8 h-8 text-red-500" />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-xl font-mono font-bold text-red-500 uppercase">ВНИМАНИЕ_СИСТЕМЫ</h4>
                                <p className="text-xs font-mono text-text-secondary leading-relaxed max-w-xs">
                                    ВЫ ПЫТАЕТЕСЬ АННУЛИРОВАТЬ ДОПУСК ДЛЯ <span className="text-text-primary font-bold">[{confirmDelete.username.toUpperCase()}]</span>. ЭТО ДЕЙСТВИЕ НЕОБРАТИМО.
                                </p>
                            </div>
                            <div className="flex space-x-4 w-full max-w-xs">
                                <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="flex-1 py-3 border border-border hover:bg-surface text-[10px] font-mono uppercase transition-all"
                                >
                                    ОТМЕНА
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="flex-1 py-3 bg-red-500/20 border border-red-500 text-red-500 text-[10px] font-mono uppercase hover:bg-red-500 hover:text-white transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                                >
                                    АННУЛИРОВАТЬ
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <ShieldCheck className="w-6 h-6 text-accent" />
                        <h3 className="text-xl font-mono font-bold text-accent uppercase tracking-tighter">База_Данных_Оперативников</h3>
                    </div>
                    <button onClick={onClose} className="text-text-secondary hover:text-accent">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        <p className="text-[10px] font-mono text-accent uppercase animate-pulse">Сканирование_профилей...</p>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-mono uppercase text-center">
                        {error}
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {/* Header row - hidden on mobile */}
                        <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-mono text-text-secondary uppercase px-3 pb-2 border-b border-border">
                            <div className="col-span-1">#</div>
                            <div className="col-span-5">Позывной</div>
                            <div className="col-span-3">Статус</div>
                            <div className="col-span-3 text-right">Операции</div>
                        </div>
                        {members.length === 0 ? (
                            <p className="text-center py-10 text-xs font-mono text-text-secondary italic">Активные профили не обнаружены.</p>
                        ) : (
                            members.map((member, idx) => (
                                <div key={member.id} className="flex items-center gap-2 p-3 bg-bg border border-border/40 hover:border-accent/40 transition-colors group rounded-sm">
                                    {/* Index - hidden on very small */}
                                    <span className="hidden sm:block text-[10px] font-mono text-text-secondary w-4 shrink-0">{idx + 1}</span>
                                    {/* Avatar */}
                                    <img
                                        src={member.avatar_url || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${member.username}`}
                                        className="w-8 h-8 rounded-sm border border-border shrink-0"
                                        alt="avatar"
                                    />
                                    {/* Name + role */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold font-mono text-text-primary truncate">{member.username.toUpperCase()}</p>
                                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase ${member.role === 'admin' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-accent/10 text-accent border border-accent/20'}`}>
                                            {member.role === 'admin' ? 'ВЕРХОВНЫЙ ЛИДЕР' : 'ОПЕРАТИВНИК'}
                                        </span>
                                    </div>
                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {member.id !== currentUser.id && (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        onStartDM(member);
                                                        onClose();
                                                    }}
                                                    className="p-2.5 text-text-secondary hover:text-accent hover:bg-accent/10 transition-all rounded-sm active:scale-95"
                                                    title="Отправить личное сообщение"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                                {currentUser.role === 'admin' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmDelete({ id: member.id, username: member.username });
                                                        }}
                                                        className="p-2.5 text-text-secondary hover:text-red-500 hover:bg-red-500/10 transition-all rounded-sm active:scale-95"
                                                        title="Аннулировать доступ"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                <div className="pt-4 border-t border-border flex justify-between items-center text-[10px] font-mono text-text-secondary uppercase">
                    <span>Всего_записей: {members.length}</span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-border hover:bg-surface text-accent transition-all rounded-sm font-bold"
                    >
                        Закрыть_Терминал
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
