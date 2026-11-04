import { ReactNode } from "react";
import BottomNavigation from "./BottomNavigation";

interface MobileLayoutProps {
  children: ReactNode;
}

const MobileLayout = ({ children }: MobileLayoutProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      <main className="flex-1 overflow-y-auto pb-24">
        {children}
      </main>
      <BottomNavigation />
    </div>
  );
};

export default MobileLayout;
