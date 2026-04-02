import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { Minus, Square, X } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useBsl } from '../../contexts/BslContext';
import { useChat } from '../../contexts/ChatContext';
import { useConfigurator } from '../../contexts/ConfiguratorContext';
import { getConfiguratorApplySupport } from '../../api/configurator';
import { CodeSidePanel } from '../CodeSidePanel';
import { SettingsPanel } from '../SettingsPanel';
import { ConflictDialog } from '../ui/ConflictDialog';
import { Header } from './Header';
import { ChatArea } from '../chat/ChatArea';
import { OnboardingWizard } from '../Onboarding/OnboardingWizard';
import type { OverlayQuickActionSessionPayload } from '../../types/quickActionSessions';
import logo from '../../assets/logo.png';

interface OverlayDiffPayload {
    diffContent: string;
    originalCode?: string | null;
    confHwnd: number;
    useSelectAll: boolean;
}

interface OverlayExplainPayload {
    confHwnd: number;
    scope: 'selection' | 'current_method' | 'module';
    code: string;
    originalCode?: string | null;
    runtimeId?: string | null;
}

export function MainLayout() {
    const { settings } = useSettings();
    const { status: bslStatus, analyzeCode } = useBsl();
    const { clearChat, isLoading } = useChat();
    const { pasteCode, checkSelection } = useConfigurator();

    const [viewMode, setViewMode] = useState<'assistant' | 'split' | 'code'>('assistant');
    const [showSettings, setShowSettings] = useState(false);
    const [nodeAvailable, setNodeAvailable] = useState<boolean | null>(null);
    const [settingsTab, setSettingsTab] = useState<'llm' | 'configurator' | 'bsl' | 'mcp' | 'debug' | undefined>(undefined);
    const [isApplying, setIsApplying] = useState(false);
    const [isValidating, setIsValidating] = useState(false);

    const [lastConfiguratorCode, setLastConfiguratorCode] = useState(''); // Базовый код для проверки хэша (синхрон с 1С)
    const [uiBaselineCode, setUiBaselineCode] = useState(''); // Базовый код для отображения диффа в UI
    const [modifiedCode, setModifiedCode] = useState('');
    const [diagnostics, setDiagnostics] = useState<any[]>([]);
    const [showConflictDialog, setShowConflictDialog] = useState(false);
    const [selectionActive, setSelectionActive] = useState(true);
    const [activeDiffContent, setActiveDiffContent] = useState(''); // Стейт для диффов
    const [activeQuickActionSession, setActiveQuickActionSession] = useState<OverlayQuickActionSessionPayload | null>(null);
    const lastConfiguratorCodeRef = useRef(lastConfiguratorCode);

    // useMemo + try/catch защищает от ошибки "Cannot read properties of undefined (reading 'metadata')"
    // которая возникает если Tauri IPC не инициализирован (первый рендер / dev-режим браузера)
    const appWindow = useMemo(() => {
        try {
            return getCurrentWindow();
        } catch (e) {
            console.warn('[MainLayout] getCurrentWindow() failed:', e);
            return null;
        }
    }, []);

    // Check Node.js availability on startup
    useEffect(() => {
        invoke<string | null>('check_node_version_cmd')
            .then(ver => setNodeAvailable(ver !== null))
            .catch(() => setNodeAvailable(false));
    }, []);

    // Диагностика ошибок
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            if (event.message?.includes('metadata')) {
                console.error("Критическая ошибка UI (metadata):", {
                    message: event.message,
                    error: event.error,
                    stack: event.error?.stack,
                    settings_exists: !!settings,
                    bslStatus_exists: !!bslStatus
                });
            }
        };
        window.addEventListener('error', handleError);
        return () => window.removeEventListener('error', handleError);
    }, [settings, bslStatus]);

    // Problem #4: Listen for external diff reset events
    useEffect(() => {
        const unlisten = listen<string>('RESET_DIFF', (event) => {
            console.log("Diff Reset Event received", event.payload?.length);
            setLastConfiguratorCode(event.payload || '');
            setUiBaselineCode(event.payload || '');
            setActiveDiffContent(''); // Сбрасываем диффы при новом коде
        });
        return () => {
            unlisten.then(fn => fn());
        };
    }, []);


    // Держим ref в актуальном состоянии для использования внутри listener-а без пересоздания
    useEffect(() => {
        lastConfiguratorCodeRef.current = lastConfiguratorCode;
    }, [lastConfiguratorCode]);

    // Listen for overlay -> main window diff handoff.
    useEffect(() => {
        const unlisten = listen<OverlayDiffPayload>('open-diff-from-overlay', (event) => {
            const baseCode = event.payload.originalCode ?? lastConfiguratorCodeRef.current ?? '';
            setActiveQuickActionSession(null);
            setLastConfiguratorCode(baseCode);
            setUiBaselineCode(baseCode);
            setModifiedCode(baseCode);
            setActiveDiffContent(event.payload.diffContent || '');
            setViewMode(prev => prev === 'assistant' ? 'split' : prev);
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, []);


    const ensureExpandedWindow = useCallback(async () => {
        if (!appWindow) return;

        const size = await appWindow.innerSize();
        const factor = await appWindow.scaleFactor();
        const logicalWidth = size.width / factor;
        const logicalHeight = size.height / factor;

        if (logicalWidth < 500) {
            await appWindow.setSize(new LogicalSize(700, logicalHeight));
        }
    }, [appWindow]);

    useEffect(() => {
        const unlisten = listen<OverlayExplainPayload>('open-explain-from-overlay', (event) => {
            const explainCode = (event.payload.code || event.payload.originalCode || '').trim();
            if (!explainCode) {
                return;
            }

            void ensureExpandedWindow().catch((e) => {
                console.warn('[MainLayout] Failed to expand window for explain handoff:', e);
            });

            setActiveQuickActionSession(null);
            setLastConfiguratorCode(explainCode);
            setUiBaselineCode(explainCode);
            setModifiedCode(explainCode);
            setDiagnostics([]);
            setActiveDiffContent('');
            setViewMode('assistant');
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [ensureExpandedWindow]);

    useEffect(() => {
        const unlisten = listen<OverlayQuickActionSessionPayload>('open-quick-action-session-from-overlay', (event) => {
            const sessionCode = (event.payload.code || event.payload.originalCode || '').trim();
            if (!sessionCode) {
                return;
            }

            const baseCode = event.payload.originalCode?.trim() || sessionCode;

            void ensureExpandedWindow().catch((e) => {
                console.warn('[MainLayout] Failed to expand window for quick action handoff:', e);
            });

            setActiveQuickActionSession(event.payload);
            setLastConfiguratorCode(baseCode);
            setUiBaselineCode(baseCode);
            setModifiedCode(baseCode);
            setDiagnostics(event.payload.diagnostics ?? []);
            setActiveDiffContent('');
            setViewMode('split');
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [ensureExpandedWindow]);

    // Analysis effect — runs only when modifiedCode changes AND we are not streaming
    useEffect(() => {
        if (!modifiedCode || isLoading) return;
        const runAnalysis = async () => {
            setIsValidating(true);
            try {
                const results = await analyzeCode(modifiedCode);
                setDiagnostics(results || []);
            } catch (e) {
                console.error("Analysis failed:", e);
            } finally {
                setIsValidating(false);
            }
        };

        const timer = setTimeout(runAnalysis, 2000); // 1. Увеличен debounce до 2000мс
        return () => clearTimeout(timer);
    }, [modifiedCode, analyzeCode, isLoading]);

    const ensureQuickActionDirectApplyAvailable = useCallback(async (
        writeSession: OverlayQuickActionSessionPayload | null,
        useSelectAll: boolean,
        originalContent?: string,
    ) => {
        if (
            writeSession?.mode !== 'write'
            || settings?.configurator?.editor_bridge_enabled !== true
            || !writeSession.writeIntent
        ) {
            return;
        }

        const support = await getConfiguratorApplySupport(
            writeSession.confHwnd,
            useSelectAll,
            writeSession.action,
            writeSession.writeIntent,
            originalContent,
        );

        if (support.canApplyDirectly) {
            return;
        }

        throw new Error(
            support.reason
            || 'Семантическое применение изменений в 1С сейчас недоступно. Проверьте EditorBridge/Scintilla или отключите опцию быстрых действий в 1С Конфигураторе.',
        );
    }, [settings?.configurator?.editor_bridge_enabled]);

    void ensureQuickActionDirectApplyAvailable;

    const handleApply = useCallback(async () => {
        setIsApplying(true);
        try {
            const writeSession = activeQuickActionSession?.mode === 'write' ? activeQuickActionSession : null;
            const useSelectAll = writeSession
                ? writeSession.useSelectAll
                : (!lastConfiguratorCode || lastConfiguratorCode.trim().length === 0);
            const originalContent = writeSession?.originalCode || lastConfiguratorCode || undefined;

            await pasteCode(
                modifiedCode,
                useSelectAll,
                originalContent,
                writeSession
                    ? {
                        action: writeSession.action,
                        writeIntent: writeSession.writeIntent,
                        caretLine: writeSession.caretLine ?? null,
                        methodStartLine: writeSession.methodStartLine ?? null,
                        methodName: writeSession.methodName ?? null,
                        runtimeId: writeSession.runtimeId ?? null,
                        forceLegacyApply: true,
                    }
                    : { forceLegacyApply: true },
            );
            // При успешном применении - 1С теперь содержит modifiedCode
            setLastConfiguratorCode(modifiedCode);
            setUiBaselineCode(modifiedCode);
            setActiveQuickActionSession(null);
            // Сброс больше не нужен здесь, так как pasteCode вызовет событие RESET_DIFF
        } catch (e: any) {
            const errorMsg = typeof e === 'string' ? e : e?.message || String(e);
            if (errorMsg.includes('CONFLICT')) {
                const isActive = await checkSelection();
                setSelectionActive(isActive);
                setShowConflictDialog(true);
            } else {
                console.error("Apply failed", e);
                alert("Ошибка применения: " + errorMsg);
            }
        } finally {
            setIsApplying(false);
        }
    }, [activeQuickActionSession, modifiedCode, lastConfiguratorCode, pasteCode]);

    const handleConflictApplyToAll = useCallback(async () => {
        setShowConflictDialog(false);
        setIsApplying(true);
        try {
            // useSelectAll = true, originalContent = undefined (bypass hash check)
            const writeSession = activeQuickActionSession?.mode === 'write' ? activeQuickActionSession : null;
            await pasteCode(
                modifiedCode,
                true,
                undefined,
                writeSession
                    ? {
                        action: writeSession.action,
                        writeIntent: writeSession.writeIntent,
                        caretLine: writeSession.caretLine ?? null,
                        methodStartLine: writeSession.methodStartLine ?? null,
                        methodName: writeSession.methodName ?? null,
                        runtimeId: writeSession.runtimeId ?? null,
                        forceLegacyApply: true,
                    }
                    : { forceLegacyApply: true },
            );
            setActiveQuickActionSession(null);
        } catch (e: any) {
            alert("Ошибка применения: " + (e?.message || String(e)));
        } finally {
            setIsApplying(false);
        }
    }, [activeQuickActionSession, modifiedCode, pasteCode]);

    const handleConflictApplyToSelection = useCallback(async () => {
        setShowConflictDialog(false);
        setIsApplying(true);
        try {
            // useSelectAll = false, originalContent = undefined (bypass hash check)
            const writeSession = activeQuickActionSession?.mode === 'write' ? activeQuickActionSession : null;
            await pasteCode(
                modifiedCode,
                false,
                undefined,
                writeSession
                    ? {
                        action: writeSession.action,
                        writeIntent: writeSession.writeIntent,
                        caretLine: writeSession.caretLine ?? null,
                        methodStartLine: writeSession.methodStartLine ?? null,
                        methodName: writeSession.methodName ?? null,
                        runtimeId: writeSession.runtimeId ?? null,
                        forceLegacyApply: true,
                    }
                    : { forceLegacyApply: true },
            );
            setActiveQuickActionSession(null);
        } catch (e: any) {
            alert("Ошибка применения: " + (e?.message || String(e)));
        } finally {
            setIsApplying(false);
        }
    }, [activeQuickActionSession, modifiedCode, pasteCode]);

    const handleCodeLoaded = useCallback((code: string, _isSelection: boolean) => {
        setActiveQuickActionSession(null);
        setLastConfiguratorCode(code);
        setUiBaselineCode(code);
        setModifiedCode(code);
        setDiagnostics([]);
        setActiveDiffContent('');
        setViewMode(prev => prev === 'assistant' ? 'split' : prev);
    }, []);

    const handleCommitCode = useCallback((code: string) => {
        // "Принять" - значит сделать код НОВЫМ визуальным бейзлайном
        // Но НЕ обновлять lastConfiguratorCode, так как в 1С код еще старый
        setUiBaselineCode(code);
        setModifiedCode(code);
        setActiveDiffContent('');
    }, []);

    const handleNewChat = useCallback(() => {
        clearChat();
        setActiveQuickActionSession(null);
        setLastConfiguratorCode('');
        setUiBaselineCode('');
        setModifiedCode('');
        setDiagnostics([]);
        setActiveDiffContent('');
    }, [clearChat]);

    const minimize = () => appWindow?.minimize();
    const maximize = async () => {
        const isMaximized = await appWindow?.isMaximized();
        isMaximized ? appWindow?.unmaximize() : appWindow?.maximize();
    };
    const close = () => appWindow?.close();

    return (
        <div className="flex flex-col h-screen bg-transparent relative overflow-hidden">
            <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} initialTab={settingsTab as any} />

            {/* Custom Title Bar */}
            <div className="relative h-10 bg-[#09090b] flex items-center justify-between px-4 border-b border-[#27272a] select-none z-50">
                <div data-tauri-drag-region className="absolute inset-0 z-0" />
                <div className="relative z-10 flex items-center gap-2 pointer-events-none">
                    <img src={logo} alt="Logo" className="w-5 h-5" />
                    <span className="text-sm font-medium text-zinc-300">Mini AI 1C</span>
                </div>
                <div className="relative z-50 flex items-center gap-1 pointer-events-auto">
                    <button onClick={minimize} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"><Minus className="w-4 h-4" /></button>
                    <button onClick={maximize} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"><Square className="w-3 h-3" /></button>
                    <button onClick={close} className="p-1.5 hover:bg-red-900/50 hover:text-red-200 rounded text-zinc-400"><X className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="flex-1 flex flex-col relative overflow-hidden">
                {(settings && !settings.onboarding_completed) && (
                    <OnboardingWizard onComplete={() => window.location.reload()} />
                )}

                <Header
                    bslStatus={bslStatus}
                    nodeAvailable={nodeAvailable}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onNewChat={handleNewChat}
                    onOpenSettings={(tab) => { if (tab) setSettingsTab(tab as any); setShowSettings(true); }}
                />

                <div className="flex flex-1 overflow-hidden bg-[#09090b] relative">
                    <div className={`flex flex-1 overflow-hidden transition-all duration-300 ${viewMode === 'code' ? 'hidden' : 'opacity-100'}`}>
                        <ChatArea
                            originalCode={uiBaselineCode}
                            modifiedCode={modifiedCode}
                            onApplyCode={useCallback((code: string) => {
                                setModifiedCode(code);
                                setActiveDiffContent(''); // Очищаем стейл-дифф при явном применении блока кода
                                setViewMode(prev => prev === 'assistant' ? 'split' : prev);
                            }, [])}
                            onCommitCode={handleCommitCode}
                            onCodeLoaded={handleCodeLoaded}
                            diagnostics={diagnostics}
                            onOpenSettings={(tab) => {
                                setSettingsTab(tab as any);
                                setShowSettings(true);
                            }}
                            onActiveDiffChange={useCallback((content: string) => {
                                setActiveDiffContent(content);
                                if (content) {
                                    setViewMode(prev => prev === 'assistant' ? 'split' : prev); // Авто-открытие после завершения стриминга
                                }
                            }, [])}
                            activeDiffContent={activeDiffContent}
                        />
                    </div>

                    <div className={`${viewMode === 'assistant' ? 'hidden' : 'flex'} ${viewMode === 'code' ? 'flex-1 w-full' : ''} z-40 h-full transition-all duration-300`}>
                        <CodeSidePanel
                            isOpen={viewMode !== 'assistant'}
                            isFullWidth={viewMode === 'code'}
                            onClose={() => setViewMode('assistant')}
                            originalCode={uiBaselineCode}
                            modifiedCode={modifiedCode}
                            onModifiedCodeChange={setModifiedCode}
                            diagnostics={diagnostics}
                            onApply={handleApply}
                            isApplying={isApplying}
                            isValidating={isValidating}
                            activeDiffContent={activeDiffContent}
                            onActiveDiffChange={setActiveDiffContent}
                            onCommitCode={handleCommitCode}
                        />
                    </div>
                </div>

                <ConflictDialog
                    isOpen={showConflictDialog}
                    selectionActive={selectionActive}
                    onClose={() => setShowConflictDialog(false)}
                    onApplyToAll={handleConflictApplyToAll}
                    onApplyToSelection={handleConflictApplyToSelection}
                />
            </div>
        </div>
    );
}
