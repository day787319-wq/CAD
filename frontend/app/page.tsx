"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { OverviewSection } from "@/components/dashboard/sections/overview";
import { TemplateLibraryStarter } from "@/components/dashboard/template-library-starter";
import { TemplateLiveCheckSection } from "@/components/dashboard/sections/market-check";
import { PipelineSection } from "@/components/dashboard/sections/pipeline";
import { DealsSection } from "@/components/dashboard/sections/deals";
import { CustomersSection } from "@/components/dashboard/sections/customers";
import { TeamSection } from "@/components/dashboard/sections/team";
import { ForecastingSection } from "@/components/dashboard/sections/forecasting";
import { ReportsSection } from "@/components/dashboard/sections/reports";
import { SettingsSection } from "@/components/dashboard/sections/settings";

export type Section = "overview" | "templates" | "marketCheck" | "pipeline" | "deals" | "customers" | "team" | "forecasting" | "reports" | "settings";

function isSection(value: string | null): value is Section {
  return [
    "overview",
    "templates",
    "marketCheck",
    "pipeline",
    "deals",
    "customers",
    "team",
    "forecasting",
    "reports",
    "settings",
  ].includes(value ?? "");
}

export default function Dashboard() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const requestedSection = searchParams.get("section");
    if (isSection(requestedSection)) {
      setActiveSection(requestedSection);
    }
  }, [searchParams]);

  const renderSection = () => {
    switch (activeSection) {
      case "overview":
        return <OverviewSection />;
      case "templates":
        return (
          <TemplateLibraryStarter
            selectedTemplateId={selectedTemplateId}
            onSelectedTemplateChange={setSelectedTemplateId}
            onOpenLiveCheck={(templateId) => {
              setSelectedTemplateId(templateId);
              setActiveSection("marketCheck");
            }}
          />
        );
      case "marketCheck":
        return (
          <TemplateLiveCheckSection
            selectedTemplateId={selectedTemplateId}
            onSelectedTemplateChange={setSelectedTemplateId}
            onOpenTemplateLibrary={() => setActiveSection("templates")}
          />
        );
      case "pipeline":
        return <PipelineSection />;
      case "deals":
        return <DealsSection />;
      case "customers":
        return <CustomersSection />;
      case "team":
        return <TeamSection />;
      case "forecasting":
        return <ForecastingSection />;
      case "reports":
        return <ReportsSection />;
      case "settings":
        return <SettingsSection />;
      default:
        return <OverviewSection />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-out ${
          sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"
        }`}
      >
        <Header activeSection={activeSection} />
        <main className="flex-1 p-6 overflow-auto">
          <div
            key={activeSection}
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  );
}
