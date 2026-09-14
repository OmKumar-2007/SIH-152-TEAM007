import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <div className="ml-60 min-h-screen flex flex-col">
        <Topbar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
