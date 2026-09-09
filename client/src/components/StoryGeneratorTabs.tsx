import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StoryForm from "@/components/StoryForm";
import { StoryRequest } from "@shared/schema";

interface StoryGeneratorTabsProps {
  onSubmit: (data: StoryRequest) => void;
  loading?: boolean;
  /** Cast carried over from a story being continued. */
  inheritedCharacterIds?: string[];
  /** Title of the story being continued, for the confirm-to-remove copy. */
  parentStoryTitle?: string;
  /** This story continues another. */
  isContinuation?: boolean;
}

export default function StoryGeneratorTabs({
  onSubmit,
  loading = false,
  inheritedCharacterIds,
  parentStoryTitle,
  isContinuation,
}: StoryGeneratorTabsProps) {
  const [activeTab, setActiveTab] = useState<string>("children");

  return (
    <div>
      <Tabs defaultValue="children" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 mb-6 gap-1 p-1">
          <TabsTrigger 
            value="children" 
            className="text-sm sm:text-base lg:text-lg py-2 sm:py-3 whitespace-normal h-auto data-[state=active]:shadow-sm data-[state=active]:font-semibold data-[state=active]:ring-1 transition-colors data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:ring-primary/30"
          >
            <span className="block sm:hidden">Children's</span>
            <span className="hidden sm:block">Children's Stories</span>
          </TabsTrigger>
          <TabsTrigger 
            value="historical" 
            className="text-sm sm:text-base lg:text-lg py-2 sm:py-3 whitespace-normal h-auto data-[state=active]:shadow-sm data-[state=active]:font-semibold data-[state=active]:ring-1 transition-colors data-[state=active]:bg-warning-surface data-[state=active]:text-warning data-[state=active]:ring-warning/40"
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
          <div className="absolute inset-0 bg-primary/5 rounded-xl"></div>
          <div className="relative z-10">
            <div className="mb-4 text-center">
              <h3 className="text-xl font-heading font-bold text-secondary">Personalized Children's Stories</h3>
              <p className="text-sm text-muted-foreground">Invented stories, with characters you choose</p>
            </div>
            
            <StoryForm 
              onSubmit={onSubmit} 
              loading={loading} 
              inheritedCharacterIds={inheritedCharacterIds}
              parentStoryTitle={parentStoryTitle}
              isContinuation={isContinuation}
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
          <div className="absolute inset-0 bg-warning-surface rounded-xl"></div>
          <div className="relative z-10">
            <div className="mb-4 text-center">
              <h3 className="text-xl font-heading font-bold text-secondary">Historical & Biblical Stories</h3>
              <p className="text-sm text-muted-foreground">Explore educational stories based on Biblical events and historical figures</p>
            </div>
            
            <StoryForm 
              onSubmit={onSubmit} 
              loading={loading} 
              inheritedCharacterIds={inheritedCharacterIds}
              parentStoryTitle={parentStoryTitle}
              isContinuation={isContinuation}
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