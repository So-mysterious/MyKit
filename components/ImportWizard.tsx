'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Loader2, Download } from 'lucide-react';
import {
    parseStandardExcel,
    batchImportTransactions,
    exportProblemTransactions,
    ParseResult,
    ValidTransaction,
    ParsedRow,
    ValidationError,
} from '@/lib/bookkeeping/importers/standardParser';

// ============================================
// 子组件：Step 1 - 文件上传
// ============================================

interface FileUploadStepProps {
    onFileSelect: (file: File | null) => void;
    onNext: () => void;
    selectedFile: File | null;
    uploading: boolean;
    error: string | null;
}

function FileUploadStep({ onFileSelect, onNext, selectedFile, uploading, error }: FileUploadStepProps) {
    return (
        <div className="space-y-6">
            <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">上传Excel文件</h3>
                <p className="text-sm text-gray-600">
                    支持标准8列格式
                </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                    type="file"
                    id="excel-upload"
                    accept=".xlsx,.xls"
                    onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
                    className="hidden"
                />
                <label htmlFor="excel-upload" className="cursor-pointer">
                    <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    {selectedFile ? (
                        <div>
                            <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {(selectedFile.size / 1024).toFixed(2)} KB
                            </p>
                        </div>
                    ) : (
                        <div>
                            <p className="text-sm font-medium text-gray-900">点击选择文件</p>
                            <p className="text-xs text-gray-500 mt-1">或拖拽文件到此处</p>
                        </div>
                    )}
                </label>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                    <p className="font-medium">解析错误</p>
                    <p>{error}</p>
                </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">💡 标准格式要求</h4>
                <ul className="text-xs text-blue-800 space-y-1">
                    <li>• 8列：日期、类型、金额、账户、分类、备注、对方账户、对方金额</li>
                    <li>• 类型必须为：支出/收入/划转</li>
                    <li>• 账户和分类必须与系统中已有的完全匹配</li>
                    <li>• 划转类型必须填写对方账户</li>
                </ul>
            </div>

            <Button
                onClick={onNext}
                disabled={!selectedFile || uploading}
                className="w-full"
            >
                {uploading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        解析中...
                    </>
                ) : (
                    '下一步：开始解析'
                )}
            </Button>
        </div>
    );
}

// ============================================
// 子组件：Step 2 - 验证报告
// ============================================

interface ValidationReportStepProps {
    parseResult: ParseResult;
    selectedDuplicates: Set<number>;
    onToggleDuplicate: (row: number) => void;
    onBack: () => void;
    onNext: () => void;
    uploading: boolean;
}

function ValidationReportStep({ parseResult, selectedDuplicates, onToggleDuplicate, onBack, onNext, uploading }: ValidationReportStepProps) {
    const [activeTab, setActiveTab] = React.useState<'valid' | 'duplicates' | 'invalid'>('valid');

    const stats = {
        valid: parseResult.valid.length,
        duplicates: parseResult.duplicates.length,
        duplicatesSelected: selectedDuplicates.size,
        invalid: parseResult.invalid.length,
        totalUpload: parseResult.valid.length + selectedDuplicates.size,
    };

    return (
        <div className="space-y-6">
            {/* 统计卡片 */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-xs font-medium text-green-900">合规流水</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700">{stats.valid}</p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                        <span className="text-xs font-medium text-yellow-900">疑似重复</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-700">
                        {stats.duplicates}
                        {stats.duplicates > 0 && (
                            <span className="text-sm font-normal text-yellow-600 ml-2">
                                ({stats.duplicatesSelected}已选)
                            </span>
                        )}
                    </p>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span className="text-xs font-medium text-red-900">不合规流水</span>
                    </div>
                    <p className="text-2xl font-bold text-red-700">{stats.invalid}</p>
                </div>
            </div>

            {/* Tab切换 */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('valid')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'valid'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    合规流水 ({stats.valid})
                </button>
                <button
                    onClick={() => setActiveTab('duplicates')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'duplicates'
                        ? 'border-yellow-500 text-yellow-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    疑似重复 ({stats.duplicates})
                </button>
                <button
                    onClick={() => setActiveTab('invalid')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'invalid'
                        ? 'border-red-500 text-red-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    不合规流水 ({stats.invalid})
                </button>
            </div>

            {/* Tab内容 */}
            <div className="max-h-80 overflow-y-auto border rounded-lg">
                {activeTab === 'valid' && (
                    stats.valid === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">没有合规流水</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr className="text-left text-xs text-gray-600">
                                    <th className="px-3 py-2">行号</th>
                                    <th className="px-3 py-2">日期</th>
                                    <th className="px-3 py-2">类型</th>
                                    <th className="px-3 py-2">金额</th>
                                    <th className="px-3 py-2">账户</th>
                                    <th className="px-3 py-2">分类</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {parseResult.valid.map((tx) => (
                                    <tr key={tx.row} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-500">{tx.row}</td>
                                        <td className="px-3 py-2">{tx.date}</td>
                                        <td className="px-3 py-2">
                                            <span className={`px-2 py-0.5 rounded text-xs ${tx.type === 'income' ? 'bg-green-100 text-green-700' :
                                                tx.type === 'expense' ? 'bg-red-100 text-red-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                {tx.type === 'income' ? '收入' : tx.type === 'expense' ? '支出' : '划转'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 font-medium">{tx.amount}</td>
                                        <td className="px-3 py-2">{tx.accountName}</td>
                                        <td className="px-3 py-2 text-gray-600">{tx.category || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}

                {activeTab === 'duplicates' && (
                    stats.duplicates === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">没有疑似重复流水</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr className="text-left text-xs text-gray-600">
                                    <th className="px-3 py-2 w-12">上传</th>
                                    <th className="px-3 py-2">行号</th>
                                    <th className="px-3 py-2">日期</th>
                                    <th className="px-3 py-2">金额</th>
                                    <th className="px-3 py-2">账户</th>
                                    <th className="px-3 py-2">匹配</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {parseResult.duplicates.map((tx) => (
                                    <tr key={tx.row} className="hover:bg-yellow-50">
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedDuplicates.has(tx.row)}
                                                onChange={() => onToggleDuplicate(tx.row)}
                                                className="rounded border-gray-300"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-gray-500">{tx.row}</td>
                                        <td className="px-3 py-2">{tx.date}</td>
                                        <td className="px-3 py-2 font-medium">{tx.amount}</td>
                                        <td className="px-3 py-2">{tx.accountName}</td>
                                        <td className="px-3 py-2">
                                            <span className="text-xs text-yellow-700">
                                                {tx.matchedWith === 'database' ? '数据库已存在' : '文件内重复'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}

                {activeTab === 'invalid' && (
                    stats.invalid === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <XCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">没有不合规流水</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr className="text-left text-xs text-gray-600">
                                    <th className="px-3 py-2">行号</th>
                                    <th className="px-3 py-2">字段</th>
                                    <th className="px-3 py-2">值</th>
                                    <th className="px-3 py-2">错误原因</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {parseResult.errors.map((err, idx) => (
                                    <tr key={idx} className="hover:bg-red-50">
                                        <td className="px-3 py-2 text-gray-500">{err.row}</td>
                                        <td className="px-3 py-2 font-medium">{err.field}</td>
                                        <td className="px-3 py-2 text-gray-600">{err.value || '(空)'}</td>
                                        <td className="px-3 py-2 text-red-600">{err.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" onClick={onBack} disabled={uploading}>
                    返回
                </Button>
                <div className="text-sm text-gray-600">
                    将上传 <span className="font-semibold text-green-600">{stats.totalUpload}</span> 条流水
                </div>
                <Button onClick={onNext} disabled={stats.totalUpload === 0 || uploading}>
                    {uploading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            上传中...
                        </>
                    ) : (
                        '确认上传'
                    )}
                </Button>
            </div>
        </div>
    );
}

// ============================================
// 主组件：ImportWizard
// ============================================

interface ImportWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: () => void;
}

export function ImportWizard({ open, onOpenChange, onComplete }: ImportWizardProps) {
    const [step, setStep] = React.useState<1 | 2 | 3>(1);
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [uploading, setUploading] = React.useState(false);
    const [parseError, setParseError] = React.useState<string | null>(null);
    const [parseResult, setParseResult] = React.useState<ParseResult | null>(null);
    const [selectedDuplicates, setSelectedDuplicates] = React.useState<Set<number>>(new Set());
    const [uploadResult, setUploadResult] = React.useState<{ uploadedCount: number; hasProblemFile: boolean } | null>(null);
    const [problemBlob, setProblemBlob] = React.useState<Blob | null>(null);

    const handleFileSelect = (file: File | null) => {
        setSelectedFile(file);
        setParseError(null);
    };

    const handleParse = async () => {
        if (!selectedFile) return;

        setUploading(true);
        setParseError(null);

        try {
            const result = await parseStandardExcel(selectedFile);
            setParseResult(result);
            setStep(2);
        } catch (error: any) {
            setParseError(error.message || '解析失败');
        } finally {
            setUploading(false);
        }
    };

    const handleToggleDuplicate = (row: number) => {
        setSelectedDuplicates(prev => {
            const next = new Set(prev);
            if (next.has(row)) {
                next.delete(row);
            } else {
                next.add(row);
            }
            return next;
        });
    };

    const handleUpload = async () => {
        if (!parseResult || !selectedFile) return;

        setUploading(true);

        try {
            // 收集要上传的流水
            const toUpload: ValidTransaction[] = [
                ...parseResult.valid,
                ...parseResult.duplicates.filter(d => selectedDuplicates.has(d.row)),
            ];

            // 批量上传
            const result = await batchImportTransactions(
                toUpload,
                selectedFile.name,
                {
                    totalRows: parseResult.totalRows,
                    validCount: parseResult.valid.length,
                    duplicateCount: parseResult.duplicates.length,
                    invalidCount: parseResult.invalid.length,
                }
            );

            if (!result.success) {
                throw new Error(result.error || '上传失败');
            }

            // 生成问题文件
            const unselectedDuplicates = parseResult.duplicates.filter(d => !selectedDuplicates.has(d.row));
            const hasProblemFile = parseResult.invalid.length > 0 || unselectedDuplicates.length > 0;

            if (hasProblemFile) {
                const blob = exportProblemTransactions(
                    parseResult.invalid,
                    unselectedDuplicates,
                    parseResult.errors
                );
                setProblemBlob(blob);
            }

            setUploadResult({
                uploadedCount: result.uploadedCount,
                hasProblemFile,
            });
            setStep(3);
            onComplete?.();
        } catch (error: any) {
            alert('上传失败: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadProblemFile = () => {
        if (!problemBlob) return;

        const url = URL.createObjectURL(problemBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `问题流水集_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleClose = () => {
        setStep(1);
        setSelectedFile(null);
        setParseResult(null);
        setSelectedDuplicates(new Set());
        setParseError(null);
        setUploadResult(null);
        setProblemBlob(null);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        批量导入流水
                        <span className="ml-3 text-sm font-normal text-gray-500">
                            Step {step} of 3
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4">
                    {step === 1 && (
                        <FileUploadStep
                            selectedFile={selectedFile}
                            onFileSelect={handleFileSelect}
                            onNext={handleParse}
                            uploading={uploading}
                            error={parseError}
                        />
                    )}

                    {step === 2 && parseResult && (
                        <ValidationReportStep
                            parseResult={parseResult}
                            selectedDuplicates={selectedDuplicates}
                            onToggleDuplicate={handleToggleDuplicate}
                            onBack={() => setStep(1)}
                            onNext={handleUpload}
                            uploading={uploading}
                        />
                    )}

                    {step === 3 && uploadResult && (
                        <div className="text-center py-12">
                            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-10 h-10 text-green-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">上传完成！</h3>
                            <p className="text-sm text-gray-600 mb-6">
                                成功上传 {uploadResult.uploadedCount} 条流水
                            </p>
                            <div className="flex gap-3 justify-center">
                                <Button variant="outline" onClick={handleClose}>
                                    关闭
                                </Button>
                                {uploadResult.hasProblemFile && (
                                    <Button onClick={handleDownloadProblemFile}>
                                        <Download className="w-4 h-4 mr-2" />
                                        下载问题流水集
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
