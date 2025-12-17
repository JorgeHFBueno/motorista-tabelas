import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import ProjectStatusCard from "@/components/dashboard/ProjectStatusCard";
import FinancialSummaryCard from "@/components/dashboard/FinancialSummaryCard";
import StagesOverview from "@/components/dashboard/StagesOverview";
import QuickActions from "@/components/dashboard/QuickActions";

const Index = () => {
  return (
    <ResponsiveLayout>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        {/* Quick Actions */}
        <QuickActions />
        
        {/* Main Grid - 2 columns on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProjectStatusCard 
            progress={42}
            deliveryDate="Dez/2025"
            status="on-track"
          />
          
          <FinancialSummaryCard
            totalPaid={85420.50}
            totalValue={280650.00}
            nextPayment={{
              value: 4850.75,
              dueDate: "Venc. 20/12/2024",
              isOverdue: false,
            }}
          />
        </div>
        
        {/* Stages Overview - Full width */}
        <StagesOverview />
      </div>
    </ResponsiveLayout>
  );
};

export default Index;
