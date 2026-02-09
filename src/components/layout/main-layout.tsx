"use client";

import { useState } from "react";
import Sidebar from "./sidebar";
import Header from "./header";
import { ToastProvider } from "@/components/ui/toast";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content area (offset by sidebar width on desktop) */}
        <div className="lg:pl-64">
          {/* Header */}
          <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

          {/* Page content */}
          <main className="p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
