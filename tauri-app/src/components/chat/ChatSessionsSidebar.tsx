import { MessageSquarePlus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { ChatSession } from '../../hooks/useChatSessions';

interface Props {
    sessions: ChatSession[];
    activeId: string | null;
    onSwitch: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
    collapsed: boolean;
    onToggle: () => void;
}

function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function ChatSessionsSidebar({ sessions, activeId, onSwitch, onNew, onDelete, collapsed, onToggle }: Props) {
    if (collapsed) {
        return (
            <div className="flex flex-col items-center py-2 px-1 border-r border-[#27272a] bg-[#09090b] gap-2 w-9 shrink-0">
                <button
                    onClick={onNew}
                    className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
                    title="Новый чат"
                >
                    <MessageSquarePlus className="w-4 h-4" />
                </button>
                <button
                    onClick={onToggle}
                    className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Открыть историю чатов"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col border-r border-[#27272a] bg-[#09090b] w-48 shrink-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#27272a]">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Чаты</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onNew}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white transition-colors"
                        title="Новый чат"
                    >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={onToggle}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Свернуть"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {sessions.length === 0 && (
                    <div className="px-3 py-4 text-[11px] text-zinc-600 text-center">
                        Нет сохранённых чатов
                    </div>
                )}
                {sessions.map(session => (
                    <div
                        key={session.id}
                        onClick={() => onSwitch(session.id)}
                        className={`group flex flex-col px-3 py-2 cursor-pointer border-b border-[#1a1a1d] transition-colors ${
                            session.id === activeId
                                ? 'bg-zinc-800/60 border-l-2 border-l-blue-500'
                                : 'hover:bg-zinc-900/60'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-1 min-w-0">
                            <span className={`text-[12px] leading-snug truncate flex-1 min-w-0 ${
                                session.id === activeId ? 'text-zinc-200' : 'text-zinc-400'
                            }`}>
                                {session.title}
                            </span>
                            <button
                                onClick={e => { e.stopPropagation(); onDelete(session.id); }}
                                className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                                title="Удалить"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                        <span className="text-[10px] text-zinc-600 mt-0.5">
                            {formatDate(session.updatedAt)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
