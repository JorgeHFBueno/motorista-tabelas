import { ReactNode } from "react";
import BottomNavigation from "./BottomNavigation";
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
      {/* Main content area; the side menu opens from the header's ☰ button. min-w-0 keeps wide rows (the
          Docs and Fotos filters) scrolling inside the page instead of widening it on phones. */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen lg:max-h-screen lg:overflow-hidden">
        {/* Top header for tablet/desktop */}
        <ResponsiveHeader 
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
