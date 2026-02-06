/**
 * [性质]: [页面] 导入报告打印页
 * [Input]: URL Params (logId)
 * [Output]: Printable A4 Page
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loader2, Printer } from 'lucide-react';

// A4 Dimensions (mm)
const A4_HEIGHT_MM = 297;
const A4_WIDTH_MM = 210; // Not used for calculation but for style
const PADDING_MM = 15; // Padding inside A4
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - (PADDING_MM * 2);

// Estimation Constants (in mm, approximate)
// These should be tuned based on CSS styling
const HEADER_HEIGHT = 45; // Title + Metadata
const FOOTER_HEIGHT = 15;
const SECTION_TITLE_HEIGHT = 15;
const TABLE_HEADER_HEIGHT = 10;
const ROW_HEIGHT = 8; // Dense row

// Pagination Engine
interface PageContent {
    pageIndex: number;
    items: PageItem[];
}

type PageItem =
    | { type: 'header', log: any }
    | { type: 'section_title', title: string, count: number, color: string }
    | { type: 'table_header' }
    | { type: 'row', data: any };

function paginateContent(log: any): PageContent[] {
    if (!log) return [];

    const pages: PageContent[] = [];
    let currentPage: PageItem[] = [];
    let currentHeight = 0;

    const startNewPage = () => {
        if (currentPage.length > 0) {
            pages.push({ pageIndex: pages.length + 1, items: currentPage });
        }
        currentPage = [];
        currentHeight = 0;
    };

    const addContent = (item: PageItem, height: number) => {
        // If it overlaps footer, break page
        if (currentHeight + height > CONTENT_HEIGHT_MM - FOOTER_HEIGHT) { // Reserve footer space
            startNewPage();
            // If new page, re-add section title or table header if we are inside a table?
            // For simplicity, just continue rows. But ideally table header should repeat.
            // Let's keep it simple: just rows continue. 
            // Wait, if breaking inside a table, we should add table header again.
            if (item.type === 'row') {
                currentPage.push({ type: 'table_header' });
                currentHeight += TABLE_HEADER_HEIGHT;
            }
        }
        currentPage.push(item);
        currentHeight += height;
    };

    // 1. Header (Only on 1st page)
    addContent({ type: 'header', log }, HEADER_HEIGHT);

    // 2. Sections
    const sections = [
        { title: "1. 合规且已上传", rows: log.rows_valid_uploaded, color: "text-green-700" },
        { title: "2. 合规但未上传", rows: log.rows_valid_skipped, color: "text-gray-500" },
        { title: "3. 疑似重复但已上传", rows: log.rows_duplicate_uploaded, color: "text-yellow-700" },
        { title: "4. 疑似重复且未上传", rows: log.rows_duplicate_skipped, color: "text-yellow-600" },
        { title: "5. 解析错误/不合规", rows: log.rows_error, color: "text-red-700" },
    ];

    sections.forEach(section => {
        if (!section.rows || section.rows.length === 0) return;

        // Section Title
        addContent({ type: 'section_title', title: section.title, count: section.rows.length, color: section.color }, SECTION_TITLE_HEIGHT);

        // Table Header
        addContent({ type: 'table_header' }, TABLE_HEADER_HEIGHT);

        // Rows
        section.rows.forEach((row: any) => {
            addContent({ type: 'row', data: row }, ROW_HEIGHT);
        });
    });

    // Push last page
    if (currentPage.length > 0) {
        pages.push({ pageIndex: pages.length + 1, items: currentPage });
    }

    return pages;
}

function PrintReportContent() {
    const searchParams = useSearchParams();
    const logId = searchParams.get('id');
    const [log, setLog] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        async function fetchLog() {
            if (!logId) return;
            const { data } = await supabase
                .from('operation_logs')
                .select('*')
                .eq('id', logId)
                .single();

            if (data) setLog(data);
            setLoading(false);
        }
        fetchLog();
    }, [logId]);

    if (!logId) return <div className="p-8 text-center text-gray-500">无效的日志ID</div>;
    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin mr-2" /> 生成报告中...</div>;
    if (!log) return <div className="p-8 text-center text-red-500">未找到相关日志记录</div>;

    const pages = paginateContent(log);

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8 print:bg-white print:p-0 print:block">
            {/* Control Bar (Screen Only) */}
            <div className="w-[210mm] mb-6 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm print:hidden">
                <div>
                    <h1 className="font-bold text-gray-900">打印预览</h1>
                    <p className="text-xs text-gray-500">共 {pages.length} 页 | A4 标准尺寸</p>
                </div>
                <Button onClick={() => window.print()} className="bg-gray-900 text-white hover:bg-black">
                    <Printer className="w-4 h-4 mr-2" />
                    打印 / 另存为PDF
                </Button>
            </div>

            {/* Pages */}
            {pages.map((page, idx) => (
                <div
                    key={idx}
                    className="bg-white shadow-lg mb-8 print:shadow-none print:mb-0 relative overflow-hidden"
                    style={{
                        width: '210mm',
                        height: '297mm',
                        padding: `${PADDING_MM}mm`,
                        pageBreakAfter: 'always',
                        breakAfter: 'page'
                    }}
                >
                    {/* Page Content */}
                    <div className="h-full flex flex-col relative">
                        {page.items.map((item, i) => {
                            switch (item.type) {
                                case 'header':
                                    return (
                                        <div key={i} className="" style={{ height: `${HEADER_HEIGHT}mm` }}>
                                            <div className="border-b-2 border-black pb-2 mb-2">
                                                <h1 className="text-2xl font-bold text-gray-900">数据导入报告</h1>
                                                <div className="flex justify-between items-end mt-2">
                                                    <div className="text-xs text-gray-600 space-y-1">
                                                        <p><span className="font-semibold">文件名:</span> {item.log.filename}</p>
                                                        <p><span className="font-semibold">流水ID:</span> <span className="font-mono">{item.log.id}</span></p>
                                                    </div>
                                                    <div className="text-right text-xs text-gray-600 space-y-1">
                                                        <p><span className="font-semibold">导入时间:</span> {new Date(item.log.created_at).toLocaleString()}</p>
                                                        <p><span className="font-semibold">总条数:</span> {item.log.total_rows} (成功: {item.log.uploaded_count})</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                case 'section_title':
                                    return (
                                        <div key={i} className="flex items-end border-b pb-1 mb-1 mt-2" style={{ height: `${SECTION_TITLE_HEIGHT - 3}mm` }}>
                                            <h3 className={`text-base font-bold ${item.color}`}>
                                                {item.title}
                                                <span className="ml-2 text-xs font-normal text-gray-400">({item.count}条)</span>
                                            </h3>
                                        </div>
                                    );
                                case 'table_header':
                                    return (
                                        <div key={i} className="flex text-xs font-bold text-gray-700 bg-gray-50 border-y border-gray-200" style={{ height: `${TABLE_HEADER_HEIGHT}mm`, alignItems: 'center' }}>
                                            <div className="w-[15%] pl-2">日期</div>
                                            <div className="w-[10%]">类型</div>
                                            <div className="w-[15%] text-right pr-2">金额</div>
                                            <div className="w-[30%] pl-2">账户/说明</div>
                                            <div className="w-[30%] pl-2">备注/错误</div>
                                        </div>
                                    );
                                case 'row':
                                    const r = item.data;
                                    return (
                                        <div key={i} className="flex text-[10px] text-gray-600 border-b border-gray-100 items-center" style={{ height: `${ROW_HEIGHT}mm` }}>
                                            <div className="w-[15%] pl-2 font-mono">{r.date?.split('T')[0]}</div>
                                            <div className="w-[10%]">
                                                <span className={`px-1 rounded ${r.type === 'income' ? 'bg-green-50 text-green-700' : r.type === 'expense' ? 'bg-red-50 text-red-700' : 'bg-gray-50'}`}>
                                                    {r.type === 'expense' ? '支出' : r.type === 'income' ? '收入' : '划转'}
                                                </span>
                                            </div>
                                            <div className="w-[15%] text-right pr-2 font-mono font-medium text-gray-800">{r.amount}</div>
                                            <div className="w-[30%] pl-2 truncate pr-2">
                                                {r.accountName} {r.relatedName ? `→ ${r.relatedName}` : ''}
                                                {r.field && <span className="text-red-500 font-bold">{r.field}: {r.value}</span>}
                                            </div>
                                            <div className="w-[30%] pl-2 truncate pr-2 text-gray-400">
                                                {r.description || r.reason || '-'}
                                            </div>
                                        </div>
                                    );
                                default:
                                    return null;
                            }
                        })}

                        {/* Pagination Footer */}
                        <div className="absolute bottom-0 w-full text-center border-t border-gray-200 pt-2" style={{ height: `${FOOTER_HEIGHT}mm` }}>
                            <p className="text-[10px] text-gray-400">
                                第 {page.pageIndex} 页 / 共 {pages.length} 页 — Generated by MyKit
                            </p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ImportReportPrintPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PrintReportContent />
        </Suspense>
    );
}
