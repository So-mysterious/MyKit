# MyKit - 个人工具箱

这是一个基于 Next.js 开发的个人工具箱项目，旨在提供便捷的日常管理功能。目前主要包含记账模块。

## 技术栈

- **框架**: Next.js (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **后端**: Supabase
- **组件库**: Radix UI (Headless) + 自定义 UI 组件

## 模块

### 1. 记账 (Bookkeeping)
核心功能：
- **账户管理**: 支持多账户类型（现金、储蓄卡、信用卡、投资等），安全删除机制自动清理相关划转数据。
- **流水记录**: 收入、支出、划转记录，支持编辑和删除，划转采用双向分录机制（transfer_group_id）。
- **预算管理**: 
    - 总支出预算和标签预算
    - 自动周期更新（周度/月度）
    - 柔性/刚性约束线
    - 预算重算功能（修正历史数据）
- **仪表盘**: 
    - 年度/月度热力图 (GitHub Style)
    - 交易趋势图 (SVG Line Chart)
    - 支出/收入构成图 (SVG Donut Chart)
    - 实时预算执行状态（12 个指示灯）
- **余额校准**: 周期性账户余额快照与校准。
- **数据导入导出**: 支持 Excel/CSV 导入导出，智能合并划转记录。

## 开发说明

- **前端优先**: 优先实现交互和 UI，逻辑内聚于前端。
- **自定义组件**: 核心图表组件采用 SVG/CSS 原生实现，不依赖第三方重型图表库。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```
