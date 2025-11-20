import { Sidebar } from "@/components/Sidebar";
import { CalendarDays, ListTodo } from "lucide-react";

const calendarNavItems = [
  { icon: CalendarDays, href: "/calendar", label: "月视图" },
  { icon: ListTodo, href: "/calendar/tasks", label: "任务列表" },
];

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar items={calendarNavItems} />
      <div className="flex-1 p-6 bg-gray-50/50">
        {children}
      </div>
    </div>
  );
}

