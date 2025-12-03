'use client';

import { useState } from 'react';
import { importTransactionsFromXLS, importTransactionsFromText } from '@/lib/bookkeeping/actions';
import { ImportResult } from '@/lib/bookkeeping/importers/types';
import ImportPreview from './ImportPreview';

export default function ImportSection() {
    const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
    const [file, setFile] = useState<File | null>(null);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleFileImport = async () => {
        if (!file) return;

        setLoading(true);
        setResult(null);

        try {
            const importResult = await importTransactionsFromXLS(file);
            setResult(importResult);

            if (importResult.success) {
                // 清空文件选择
                setFile(null);
                const fileInput = document.getElementById('file-upload') as HTMLInputElement;
                if (fileInput) fileInput.value = '';
            }
        } catch (error: any) {
            setResult({
                success: false,
                errors: [{
                    line: 0,
                    field: '系统',
                    value: '',
                    reason: error.message || '导入失败'
                }]
            });
        } finally {
            setLoading(false);
        }
    };

    const handleTextImport = async () => {
        if (!text.trim()) return;

        setLoading(true);
        setResult(null);

        try {
            const importResult = await importTransactionsFromText(text);
            setResult(importResult);

            if (importResult.success) {
                setText('');
            }
        } catch (error: any) {
            setResult({
                success: false,
                errors: [{
                    line: 0,
                    field: '系统',
                    value: '',
                    reason: error.message || '导入失败'
                }]
            });
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setResult(null);
        setFile(null);
        setText('');
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">📥 数据导入</h3>
                <p className="text-sm text-gray-600">
                    支持 Excel 文件导入或自然语言文本导入。系统会自动验证数据，创建不存在的标签，并检测疑似重复交易。
                </p>
            </div>

            {/* Tab 切换 */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('file')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'file'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    文件导入
                </button>
                <button
                    onClick={() => setActiveTab('text')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'text'
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    文本导入
                </button>
            </div>

            {/* 文件导入 */}
            {activeTab === 'file' && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            上传 Excel 文件 (.xls, .xlsx)
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                id="file-upload"
                                type="file"
                                accept=".xls,.xlsx"
                                onChange={handleFileChange}
                                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  cursor-pointer"
                            />
                        </div>
                        {file && (
                            <div className="mt-2 text-sm text-gray-600">
                                已选择: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
                        <h4 className="font-medium mb-2">💡 支持的格式：</h4>
                        <ul className="space-y-1 list-disc list-inside">
                            <li>微信支付账单（自动识别表头）</li>
                            <li>支付宝账单（自动识别表头）</li>
                            <li>标准格式：日期、类型、账户、金额、分类、备注等字段</li>
                        </ul>
                        <div className="mt-3 text-xs text-gray-600">
                            注意：账户名称必须与系统中已有账户完全匹配，不存在的标签会自动创建。
                        </div>
                    </div>

                    <button
                        onClick={handleFileImport}
                        disabled={!file || loading}
                        className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {loading ? '正在导入...' : '开始导入'}
                    </button>
                </div>
            )}

            {/* 文本导入 */}
            {activeTab === 'text' && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            输入交易记录（每行一条）
                        </label>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="格式: 日期 时间; 类型; 账户; 金额; 分类; 备注&#10;示例: 2025-12-01 10:30; 支出; 招商银行; 45.5; 餐饮; 午餐"
                            rows={8}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        />
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
                        <h4 className="font-medium mb-2">💡 格式说明：</h4>
                        <div className="space-y-2">
                            <div>
                                <code className="bg-white px-2 py-1 rounded text-xs">
                                    日期 时间; 类型; 账户; 金额; 分类; 备注
                                </code>
                            </div>
                            <div className="text-xs text-gray-600">
                                • 类型：收入、支出、划转<br />
                                • 多行输入，每行一条交易<br />
                                • 分号分隔各字段
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleTextImport}
                        disabled={!text.trim() || loading}
                        className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        {loading ? '正在导入...' : '开始导入'}
                    </button>
                </div>
            )}

            {/* 导入结果预览 */}
            {result && (
                <ImportPreview
                    report={result.success ? result.report : undefined}
                    errors={result.success ? undefined : result.errors}
                    onConfirm={handleReset}
                    onCancel={handleReset}
                    loading={loading}
                />
            )}
        </div>
    );
}
