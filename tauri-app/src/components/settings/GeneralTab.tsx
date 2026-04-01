import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Download, RefreshCw, Upload } from 'lucide-react';

import {
    exportSettings,
    importSettingsFromFile,
    validateImportSettingsFile,
} from '../../api/settings';

interface GeneralTabProps {
    onConfigurationImported: () => Promise<void>;
}

type StatusTone = 'success' | 'error';

export function GeneralTab({ onConfigurationImported }: GeneralTabProps) {
    const [transferStatus, setTransferStatus] = useState<string>('');
    const [statusTone, setStatusTone] = useState<StatusTone>('success');
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);

    const handleExport = async () => {
        setExporting(true);
        try {
            const result = await exportSettings();
            if (result.status === 'cancelled') {
                setTransferStatus('');
                return;
            }

            setStatusTone('success');
            setTransferStatus('✓ Настройки экспортированы.');
        } catch (error) {
            setStatusTone('error');
            setTransferStatus(`Ошибка экспорта: ${error}`);
        } finally {
            setExporting(false);
        }
    };

    const handleImport = async () => {
        setImporting(true);
        try {
            const selectedFile = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });

            if (!selectedFile || typeof selectedFile !== 'string') {
                setTransferStatus('');
                return;
            }

            await validateImportSettingsFile(selectedFile);

            const confirmed = window.confirm(
                'Импортировать настройки и LLM-профили? Текущая конфигурация будет заменена, а локальные API-ключи, токены и пароли сохранятся.'
            );

            if (!confirmed) {
                setTransferStatus('');
                return;
            }

            await importSettingsFromFile(selectedFile);
            await onConfigurationImported();

            setStatusTone('success');
            setTransferStatus('✓ Настройки импортированы и применены.');
        } catch (error) {
            setStatusTone('error');
            setTransferStatus(`Ошибка импорта: ${error}`);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="h-full w-full overflow-y-auto p-4 sm:p-8">
            <div className="mx-auto max-w-2xl space-y-6 sm:space-y-8">
                <section>
                    <h3 className="mb-4 text-lg font-medium text-zinc-100">Общие</h3>

                    <div className="space-y-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-5">
                        <div>
                            <div className="text-sm font-medium text-zinc-200">Экспорт / Импорт настроек</div>
                            <div className="mt-1 text-xs text-zinc-500">
                                Перенос конфигурации приложения и LLM-профилей между компьютерами. API-ключи, токены и пароли в экспорт не включаются.
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleExport}
                                disabled={exporting || importing}
                                className="flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {exporting ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="h-4 w-4" />
                                )}
                                Экспорт настроек
                            </button>

                            <button
                                type="button"
                                onClick={handleImport}
                                disabled={exporting || importing}
                                className="flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {importing ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Upload className="h-4 w-4" />
                                )}
                                Импорт настроек
                            </button>
                        </div>

                        {transferStatus && (
                            <p className={`text-xs ${statusTone === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                {transferStatus}
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
