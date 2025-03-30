import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StoryForm from "@/components/StoryForm";
import { StoryRequest } from "@shared/schema";

interface StoryGeneratorTabsProps {
  onSubmit: (data: StoryRequest) => void;
  loading?: boolean;
}

export default function StoryGeneratorTabs({ onSubmit, loading = false }: StoryGeneratorTabsProps) {
  const [activeTab, setActiveTab] = useState<string>("children");

  return (
    <div className="content-container rounded-2xl shadow-lg p-4">
      <h2 className="text-3xl font-heading font-bold text-center text-secondary mb-6">Create a Story</h2>
      
      <Tabs defaultValue="children" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 mb-6 gap-1 p-1">
          <TabsTrigger 
            value="children" 
            className="text-sm sm:text-base lg:text-lg py-2 sm:py-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-100 data-[state=active]:to-purple-100 whitespace-normal h-auto"
          >
            <span className="block sm:hidden">Children's</span>
            <span className="hidden sm:block">Children's Stories</span>
          </TabsTrigger>
          <TabsTrigger 
            value="historical" 
            className="text-sm sm:text-base lg:text-lg py-2 sm:py-3 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-100 data-[state=active]:to-orange-100 whitespace-normal h-auto"
          >
            <span className="block sm:hidden">Historical</span>
            <span className="hidden sm:block">Historical & Biblical</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent 
          value="children"
          className="rounded-xl p-4"
          style={{ 
            backgroundImage: 'url("/assets/children-background.jpg")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-blue-50/80 to-purple-50/80 backdrop-blur-sm rounded-xl"></div>
          <div className="relative z-10">
            <div className="mb-4 text-center">
              <h3 className="text-xl font-heading font-bold text-secondary">Personalized Children's Stories</h3>
              <p className="text-sm text-gray-600">Create fictional stories with your child as the main character</p>
            </div>
            
            <StoryForm 
              onSubmit={onSubmit} 
              loading={loading} 
              formType="children"
              showChildFields={true}
              showTimeTravel={true}
              showAnimalToggle={true}
              showBiblicalEvent={false}
              showHeroOfFaith={true} // Heroes can be in children's stories too
              showBiblePassageField={true}
            />
          </div>
        </TabsContent>
        
        <TabsContent 
          value="historical"
          className="rounded-xl p-4"
          style={{ 
            backgroundImage: 'url("/assets/historical-background.jpg")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/80 to-orange-50/80 backdrop-blur-sm rounded-xl"></div>
          <div className="relative z-10">
            <div className="mb-4 text-center">
              <h3 className="text-xl font-heading font-bold text-secondary">Historical & Biblical Stories</h3>
              <p className="text-sm text-gray-600">Explore educational stories based on Biblical events and historical figures</p>
            </div>
            
            <StoryForm 
              onSubmit={onSubmit} 
              loading={loading} 
              formType="historical"
              showChildFields={false}
              showTimeTravel={false}
              showAnimalToggle={false}
              showBiblicalEvent={true}
              showHeroOfFaith={true}
              showBiblePassageField={true}
              showHistoricalAccuracyToggle={true}
              showLearningFocus={true}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}