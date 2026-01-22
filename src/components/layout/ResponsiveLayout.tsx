import { ReactNode } from "react";
import BottomNavigation from "./BottomNavigation";
import Sidebar from "./Sidebar";
import ResponsiveHeader from "./ResponsiveHeader";

interface ResponsiveLayoutProps {
  children: ReactNode;
  showHeader?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
}

const ResponsiveLayout = ({ 
  children, 
  showHeader = false,
  headerTitle,
  headerSubtitle 
}: ResponsiveLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Sidebar for desktop */}
      <Sidebar />
      
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen lg:max-h-screen lg:overflow-hidden">
        {/* Top header for tablet/desktop */}
        <ResponsiveHeader 
          projectName="Residência Silva"
          pageTitle={headerTitle}
          pageSubtitle={headerSubtitle}
        />
        
        {/* Content area */}
        <main className="flex-1 overflow-y-auto pb-24 lg:pb-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      
      {/* Bottom navigation for mobile only - rendered inside nav */}
      <BottomNavigation />
    </div>
  );
};

export default ResponsiveLayout;
