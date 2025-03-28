import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StoryRequest, storyRequestSchema, type Character } from "@shared/schema";

interface StoryFormProps {
  onSubmit: (data: StoryRequest) => void;
  loading?: boolean;
}

export default function StoryForm({ onSubmit, loading = false }: StoryFormProps) {
  const [useTimeTravel, setUseTimeTravel] = useState(false);
  
  // Fetch characters for selection
  const { data: characters = [], isLoading: charactersLoading } = useQuery<Character[]>({
    queryKey: ['/api/characters'],
    queryFn: getQueryFn<Character[]>({
      on401: "throw"
    }),
    // Only fetch when time travel is enabled
    enabled: useTimeTravel,
  });
  
  const form = useForm<StoryRequest>({
    resolver: zodResolver(storyRequestSchema),
    defaultValues: {
      childName: "",
      gender: "boy",
      animal: "lion", // Default to lion (our app's mascot)
      theme: "courage", // Default theme
      biblicalEvent: "noahs-ark", // Default to Noah's Ark since it's fully available
      storyType: "regular", // Default to regular bedtime story
      useTimeTravel: false,
      characterId: undefined,
    },
  });
  
  // Update the form when the time travel checkbox changes
  useEffect(() => {
    form.setValue("useTimeTravel", useTimeTravel);
    
    if (useTimeTravel) {
      // In time travel mode, child's name, gender, and animal are optional
      // (they will be handled by the character's details)
      form.clearErrors(['childName', 'gender', 'animal']);
    } else {
      // Clear character selection when time travel is disabled
      form.setValue("characterId", undefined);
    }
  }, [useTimeTravel, form]);

  return (
    <Card className="bg-white/95 rounded-2xl shadow-xl">
      <CardContent className="p-6">
        <h3 className="text-2xl font-heading font-bold mb-4 text-textDark">Create Your Story</h3>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Only show child fields when time travel is disabled */}
            {!useTimeTravel && (
              <>
                <FormField
                  control={form.control}
                  name="childName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Child's Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-round">
                              <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 1 0-16 0" />
                            </svg>
                          </span>
                          <Input 
                            placeholder="Enter child's name" 
                            className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary"
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Child's Gender</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-heart">
                              <path d="M7 3C4.239 3 2 5.216 2 7.95c0 2.207.875 7.445 9.488 12.74a.985.985 0 0 0 1.024 0C21.125 15.395 22 10.157 22 7.95 22 5.216 19.761 3 17 3s-5 3-5 3-2.239-3-5-3z" />
                            </svg>
                          </span>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="boy">Boy</SelectItem>
                              <SelectItem value="girl">Girl</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="animal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Favorite Animal</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-dog">
                              <path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5" /><path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5" /><path d="M8 14v.5" /><path d="M16 14v.5" /><path d="M11.25 16.25h1.5L12 17l-.75-.75Z" /><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 17.59 7 20 12 20s8-2.41 8-5.444c0-1.135-.134-2.252-.396-3.309" />
                            </svg>
                          </span>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                              <SelectValue placeholder="Select an animal" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lion">Lion</SelectItem>
                              <SelectItem value="lamb">Lamb</SelectItem>
                              <SelectItem value="dove">Dove</SelectItem>
                              <SelectItem value="fish">Fish</SelectItem>
                              <SelectItem value="sheep">Sheep</SelectItem>
                              <SelectItem value="camel">Camel</SelectItem>
                              <SelectItem value="dog">Dog</SelectItem>
                              <SelectItem value="cat">Cat</SelectItem>
                              <SelectItem value="elephant">Elephant</SelectItem>
                              <SelectItem value="giraffe">Giraffe</SelectItem>
                              <SelectItem value="tiger">Tiger</SelectItem>
                              <SelectItem value="bear">Bear</SelectItem>
                              <SelectItem value="donkey">Donkey</SelectItem>
                              <SelectItem value="fox">Fox</SelectItem>
                              <SelectItem value="whale">Whale</SelectItem>
                              <SelectItem value="rabbit">Rabbit</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            
            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Theme/Message</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-heart">
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                        </svg>
                      </span>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                          <SelectValue placeholder="Select a theme" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kindness">Kindness</SelectItem>
                          <SelectItem value="courage">Courage</SelectItem>
                          <SelectItem value="obedience">Obedience</SelectItem>
                          <SelectItem value="forgiveness">Forgiveness</SelectItem>
                          <SelectItem value="gratitude">Gratitude</SelectItem>
                          <SelectItem value="patience">Patience</SelectItem>
                          <SelectItem value="faith">Faith</SelectItem>
                          <SelectItem value="honesty">Honesty</SelectItem>
                          <SelectItem value="humility">Humility</SelectItem>
                          <SelectItem value="love">Love</SelectItem>
                          <SelectItem value="joy">Joy</SelectItem>
                          <SelectItem value="peace">Peace</SelectItem>
                          <SelectItem value="trust">Trust</SelectItem>
                          <SelectItem value="wisdom">Wisdom</SelectItem>
                          <SelectItem value="prayer">Prayer</SelectItem>
                          <SelectItem value="gentleness">Gentleness</SelectItem>
                          <SelectItem value="self-control">Self-Control</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="storyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Story Type</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book">
                          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                        </svg>
                      </span>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                          <SelectValue placeholder="Select a story type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regular">Regular Bedtime Story</SelectItem>
                          <SelectItem value="poem">Bedtime Poem</SelectItem>
                          <SelectItem value="moral">Moral Bedtime Story</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormControl>
                  <div className="text-xs text-secondary/70 mt-1">
                    Choose what type of bedtime story you'd like to create.
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="biblicalEvent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Biblical Event</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-book-open">
                          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                        </svg>
                      </span>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                          <SelectValue placeholder="Select a Biblical event" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="noahs-ark">Noah's Ark</SelectItem>
                          <SelectItem value="david-goliath">David and Goliath</SelectItem>
                          <SelectItem value="good-samaritan">The Good Samaritan (coming soon)</SelectItem>
                          <SelectItem value="prodigal-son">The Prodigal Son (coming soon)</SelectItem>
                          <SelectItem value="jonah">Jonah and the Whale (coming soon)</SelectItem>
                          <SelectItem value="creation">Creation Story (coming soon)</SelectItem>
                          <SelectItem value="daniel-lions">Daniel in the Lion's Den (coming soon)</SelectItem>
                          <SelectItem value="moses">Moses and the Red Sea (coming soon)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormControl>
                  <div className="text-xs text-secondary/70 mt-1">
                    Currently, only Noah's Ark and David & Goliath stories are fully available. 
                    More biblical stories will be added soon!
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="p-4 bg-secondary/10 rounded-lg border border-secondary/20">
              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="useTimeTravel" 
                  checked={useTimeTravel} 
                  onCheckedChange={(checked) => setUseTimeTravel(!!checked)} 
                  className="mt-1"
                />
                <div className="space-y-1">
                  <label
                    htmlFor="useTimeTravel"
                    className="font-medium text-sm cursor-pointer"
                  >
                    Enable Time Travel Mode
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Use one of your saved characters to travel back in time and witness biblical events
                  </p>
                </div>
              </div>

              {useTimeTravel && (
                <FormField
                  control={form.control}
                  name="characterId"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel className="text-sm font-medium">Choose a Time Traveler</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-secondary z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-rocket">
                              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                            </svg>
                          </span>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={charactersLoading || characters.length === 0}
                          >
                            <SelectTrigger className="pl-10 pr-4 py-2 border border-secondary/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:border-secondary">
                              <SelectValue placeholder={charactersLoading 
                                ? "Loading characters..." 
                                : characters.length === 0 
                                  ? "No characters found" 
                                  : "Select a character"} 
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {characters.length > 0 ? (
                                characters.map((character) => (
                                  <SelectItem key={character.id} value={character.id}>
                                    {character.name} ({character.gender === "boy" ? "Boy" : "Girl"}, {character.age} yrs)
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>
                                  No characters found
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </FormControl>
                      {characters.length === 0 && !charactersLoading && (
                        <FormDescription className="mt-2">
                          <a href="/characters" className="text-primary underline underline-offset-2">
                            Create your first time traveler
                          </a>
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            
            <Button 
              type="submit" 
              className="w-full py-3 px-4 bg-secondary hover:bg-secondary/90 text-white font-medium rounded-lg transition duration-200 flex items-center justify-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Your Story...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-wand-sparkles mr-2">
                    <path d="m6 17-5-5 5-5" /><path d="m19 17-5-5 5-5" /><path d="M12 12v9" /><path d="M12 3v9" /><path d="M12 12h9" /><path d="M3 12h9" /><path d="m17 12 5 5-5 5" /><path d="m7 12 5 5-5 5" />
                  </svg> 
                  {form.watch("storyType") === "poem" ? "Create Bedtime Poem" : 
                  form.watch("storyType") === "moral" ? "Create Moral Bedtime Story" : 
                  "Create Bedtime Story"}
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
