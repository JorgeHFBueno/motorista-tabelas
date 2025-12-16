import MobileLayout from "@/components/layout/MobileLayout";
import Header from "@/components/layout/Header";
import ProjectStatusCard from "@/components/dashboard/ProjectStatusCard";
import FinancialSummaryCard from "@/components/dashboard/FinancialSummaryCard";
import StagesOverview from "@/components/dashboard/StagesOverview";
import QuickActions from "@/components/dashboard/QuickActions";

const Index = () => {
  return (
    <MobileLayout>
      <Header projectName="Residência Silva" />
      
      <div className="px-4 -mt-4 space-y-4">
        <QuickActions />
        
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
        
        <StagesOverview />
      </div>
    </MobileLayout>
  );
};

export default Index;
