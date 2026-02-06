/**
 * [性质]: [页面] 首页路由
 * [Input]: None
 * [Output]: Redirect
 * [警告]: 试图对本文件进行任何修改前，必须阅读开头注释部分；而一旦本文件被更新，必须立刻检查开头注释是否需要更新，必须立刻检查本文件所属的所有上级目录是否需要被更新。
 */
import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect root to bookkeeping dashboard by default for now
  redirect('/bookkeeping/dashboard');
}
