import React, { useState } from 'react';
import { Bug, FlaskConical, Save } from 'lucide-react';
import { AppSettings } from '../../types/settings';
import { setConfiguratorRdpMode } from '../../api/configurator';
import { exportSettings, importSettings } from '../../api/settings';

interface DebugTabProps {
    settings: AppSettings;
    setSettings: (settings: AppSettings) => void;
    showResetConfirm: boolean;
    setShowResetConfirm: (show: boolean) => void;
    resetOnboarding: () => void;
    saveDebugLogs: () => void;
    currentProvider?: string;
}

export function DebugTab({
    settings,
    setSettings,
    showResetConfirm,
    setShowResetConfirm,
    resetOnboarding,
    saveDebugLogs,
    currentProvider
}: DebugTabProps) {
    const [exportImportStatus, setExportImportStatus] = useState<string>('');

    const bridgeEnabled = settings.configurator?.editor_bridge_enabled ?? false;
    const rdpMode = settings.configurator?.rdp_mode ?? false;

    const updateConfigurator = (patch: Partial<AppSettings['configurator']>) => {
        setSettings({
            ...settings,
            configurator: {
                ...settings.configurator,
                ...patch
            }
        });
    };

    const handleRdpModeToggle = () => {
        const newValue = !rdpMode;
        updateConfigurator({ rdp_mode: newValue });
        setConfiguratorRdpMode(newValue).catch(() => {});
    };

    const handleExport = async () => {
        try {
            const json = await exportSettings();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date();
            const dateStr = date.getFullYear().toString() +
                String(date.getMonth() + 1).padStart(2, '0') +
                String(date.getDate()).padStart(2, '0');
            a.href = url;
            a.download = `mini-ai-1c-config-${dateStr}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setExportImportStatus('✓ Настройки экспортированы.');
        } catch (e) {
            setExportImportStatus(`Ошибка экспорта: ${e}`);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            JSON.parse(text); // валидация JSON
            const confirmed = window.confirm(
                'Импортировать настройки? Текущая конфигурация будет заменена (API-ключи сохранятся).'
            );
            if (!confirmed) {
                e.target.value = '';
                return;
            }
            await importSettings(text);
            setExportImportStatus('✓ Настройки импортированы. Перезагрузи приложение.');
        } catch (err) {
            setExportImportStatus(`Ошибка импорта: ${err}`);
        }
        e.target.value = '';
    };

    return (
        <div className="h-full w-full overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-2xl space-y-6 sm:space-y-8">
                <section>
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-zinc-100">
                        <FlaskConical className="h-5 w-5 text-blue-400" />
                        Экспериментальные функции
                    </h3>

                    <p className="mb-4 text-sm text-zinc-400">
                        Здесь включаются функции, которые ещё доводятся на живом Конфигураторе.
                    </p>

                    <div className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-5">
                        <ToggleRow
                            label="Включить быстрые действия в 1С Конфигураторе"
                            description="Ctrl + ПКМ в редакторе показывает экспериментальное меню mini-ai."
                            checked={bridgeEnabled}
                            onChange={(value) => updateConfigurator({ editor_bridge_enabled: value })}
                        />

                        <div className="border-t border-zinc-700" />

                        <ToggleRow
                            label="Режим RDP"
                            description="Увеличенные задержки и совместимость для удалённых подключений."
                            checked={rdpMode}
                            onChange={handleRdpModeToggle}
                        />
                    </div>
                </section>

                <section>
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-zinc-100">
                        <Bug className="h-5 w-5 text-red-500" />
                        Отладка и обслуживание
                    </h3>

                    <div className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-5">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm font-medium text-zinc-200">Сбросить onboarding</div>
                                <div className="text-xs text-zinc-500">
                                    Сбросить флаг первого запуска и снова показать мастер при следующем старте.
                                </div>
                            </div>

                            <div className="flex gap-2">
                                {!showResetConfirm ? (
                                    <button
                                        onClick={() => setShowResetConfirm(true)}
                                        className="rounded-lg border border-red-800/50 bg-red-900/40 px-3 py-1 text-xs text-red-300 transition-colors hover:bg-red-800/60"
                                    >
                                        Сбросить onboarding
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/40 p-1">
                                        <span className="px-2 text-[10px] font-bold uppercase text-red-400">Вы уверены?</span>
                                        <button
                                            onClick={resetOnboarding}
                                            className="rounded-md bg-red-600 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-red-500"
                                        >
                                            Да, сбросить
                                        </button>
                                        <button
                                            onClick={() => setShowResetConfirm(false)}
                                            className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
                                        >
                                            Нет
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={() => window.location.reload()}
                                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
                                >
                                    Перезагрузить приложение
                                </button>
                            </div>
                        </div>

                        {currentProvider !== 'QwenCli' && (
                            <>
                                <div className="border-t border-zinc-700" />

                                <div className="flex flex-col space-y-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-medium text-zinc-200">Лимит шагов агента</div>
                                            <div className="text-xs text-zinc-500">
                                                Ограничение количества вызовов инструментов ИИ в рамках одного запроса.
                                            </div>
                                        </div>

                                        <ToggleRowButton
                                            checked={settings.max_agent_iterations != null}
                                            onClick={() => setSettings({
                                                ...settings,
                                                max_agent_iterations: settings.max_agent_iterations != null ? null : 7
                                            })}
                                        />
                                    </div>

                                    {settings.max_agent_iterations != null && (
                                        <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                                            <input
                                                type="range"
                                                min="1"
                                                max="25"
                                                value={settings.max_agent_iterations}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    max_agent_iterations: parseInt(e.target.value, 10)
                                                })}
                                                className="flex-1 accent-blue-500"
                                            />
                                            <span className="w-8 rounded bg-zinc-800 px-2 py-1 text-right font-mono text-sm text-zinc-300">
                                                {settings.max_agent_iterations}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        <div className="border-t border-zinc-700" />

                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm font-medium text-zinc-200">Режим отладки</div>
                                <div className="text-xs text-zinc-500">
                                    Подробное журналирование работы приложения и MCP-серверов в терминал.
                                </div>
                            </div>

                            <ToggleRowButton
                                checked={settings.debug_mode}
                                onClick={() => setSettings({ ...settings, debug_mode: !settings.debug_mode })}
                            />
                        </div>

                        <div className="border-t border-zinc-700" />

                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm font-medium text-zinc-200">Системные логи</div>
                                <div className="text-xs text-zinc-500">
                                    Экспорт всех логов приложения и серверов в текстовый файл.
                                </div>
                            </div>

                            <button
                                onClick={saveDebugLogs}
                                className="flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-1 text-xs text-zinc-200 transition-colors hover:bg-zinc-600"
                            >
                                <Save className="h-4 w-4" />
                                Сохранить логи
                            </button>
                        </div>
                    </div>
                </section>

                <section>
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-zinc-100">
                        Сжатие контекста
                    </h3>

                    <div className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-5">
                        <p className="text-sm text-zinc-400">
                            Что делать, когда история чата становится слишком длинной.
                        </p>

                        <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs font-medium">
                            {(['disabled', 'sliding_window', 'summarize'] as const).map((opt, i) => {
                                const labels = { disabled: 'Выкл', sliding_window: 'Скользящее окно', summarize: 'Суммаризация' };
                                const hints = {
                                    disabled: 'Без сжатия',
                                    sliding_window: 'Сохраняет первое сообщение + последние N, удаляет середину',
                                    summarize: 'LLM создаёт конспект диалога (не работает с QwenCLI / Напарником)',
                                };
                                const active = (settings.context_compress_strategy || 'disabled') === opt;
                                return (
                                    <button
                                        key={opt}
                                        type="button"
                                        title={hints[opt]}
                                        onClick={() => setSettings({ ...settings, context_compress_strategy: opt })}
                                        className={`flex-1 py-2 transition-colors ${i > 0 ? 'border-l border-zinc-700' : ''} ${active ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}
                                    >
                                        {labels[opt]}
                                    </button>
                                );
                            })}
                        </div>

                        {(settings.context_compress_strategy === 'sliding_window' || settings.context_compress_strategy === 'summarize') && (
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium text-zinc-200">Порог сжатия</div>
                                    <div className="text-xs text-zinc-500">Сжимать когда диалог превышает N сообщений</div>
                                </div>
                                <input
                                    type="number"
                                    min={10}
                                    max={200}
                                    value={settings.max_context_messages ?? 40}
                                    onChange={e => setSettings({ ...settings, max_context_messages: parseInt(e.target.value) || 40 })}
                                    className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-right focus:outline-none focus:border-zinc-500"
                                />
                            </div>
                        )}

                        {settings.context_compress_strategy === 'summarize' && (
                            <p className="text-[11px] text-zinc-600">
                                ⚠ Суммаризация недоступна для QwenCLI и 1С:Напарника — будет использован fallback без сжатия.
                            </p>
                        )}
                    </div>
                </section>

                <section>
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-zinc-100">
                        Экспорт / Импорт настроек
                    </h3>

                    <div className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-5">
                        <p className="text-sm text-zinc-400">
                            Перенос конфигурации между компьютерами. API-ключи и пароли в экспорт не включаются.
                        </p>

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleExport}
                                className="rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-600"
                            >
                                📦 Экспорт настроек
                            </button>
                            <label className="cursor-pointer rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-600">
                                📤 Импорт настроек
                                <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                            </label>
                        </div>

                        {exportImportStatus && (
                            <p className={`text-xs ${exportImportStatus.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                                {exportImportStatus}
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

function ToggleRow({
    label,
    description,
    checked,
    onChange,
    disabled = false
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
            <div>
                <div className="text-sm text-zinc-200">{label}</div>
                {description && <div className="mt-0.5 text-xs text-zinc-500">{description}</div>}
            </div>

            <ToggleRowButton
                checked={checked}
                disabled={disabled}
                onClick={() => !disabled && onChange(!checked)}
            />
        </div>
    );
}

function ToggleRowButton({
    checked,
    onClick,
    disabled = false
}: {
    checked: boolean;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={onClick}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ${
                checked
                    ? 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]'
                    : 'bg-zinc-700'
            } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    checked ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    );
}
