import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { characterSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import AnimalAutocomplete from "./AnimalAutocomplete";

// Create a form schema based on the Character schema, but make specific fields required
const formSchema = characterSchema
  .omit({ id: true, createdAt: true }) // These will be generated on the server
  .extend({
    name: z.string().min(1, "Character name is required"),
    gender: z.enum(["boy", "girl"], {
      required_error: "Please select a gender",
    }),
  });

// Define the colors and animals for the form
const hairColors = ["brown", "black", "blonde", "red", "white", "gray", "purple", "blue", "green"];
const eyeColors = ["brown", "blue", "green", "hazel", "gray", "amber"];
const favoriteColors = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "teal", "gold", "silver"];
const favoriteAnimals = [
  // Domestic Animals
  "dog", "cat", "rabbit", "hamster", "guinea pig", "bird", "fish", "turtle", "ferret", "chinchilla",
  
  // Farm Animals  
  "horse", "cow", "pig", "sheep", "goat", "chicken", "duck", "goose", "donkey", "llama", "alpaca",
  
  // Wild Animals - African
  "lion", "elephant", "giraffe", "zebra", "rhinoceros", "hippopotamus", "cheetah", "leopard", "hyena", "meerkat",
  
  // Wild Animals - Forest
  "bear", "wolf", "fox", "deer", "moose", "elk", "raccoon", "squirrel", "chipmunk", "beaver", "otter",
  
  // Wild Animals - Jungle/Tropical
  "tiger", "jaguar", "panther", "monkey", "orangutan", "gorilla", "chimpanzee", "sloth", "toucan", "parrot",
  
  // Ocean Animals
  "dolphin", "whale", "shark", "seal", "sea lion", "octopus", "jellyfish", "starfish", "seahorse", "turtle",
  
  // Birds
  "eagle", "hawk", "owl", "cardinal", "robin", "blue jay", "hummingbird", "penguin", "flamingo", "peacock",
  
  // Small Creatures
  "butterfly", "ladybug", "bee", "dragonfly", "grasshopper", "cricket", "spider", "snail", "frog", "lizard",
  
  // Unique/Exotic
  "panda", "koala", "kangaroo", "platypus", "armadillo", "anteater", "hedgehog", "skunk", "porcupine", "badger",
  
  // Biblical Animals
  "lamb", "dove", "camel", "locust", "raven", "sparrow", "quail", "ox", "colt", "serpent"
];
const hobbies = [
  "reading", "drawing", "singing", "dancing", "sports", "cooking", 
  "hiking", "gardening", "collecting", "writing", "music", "astronomy"
];
const personalityTraits = [
  "brave", "kind", "curious", "shy", "energetic", "patient", 
  "creative", "thoughtful", "joyful", "determined", "gentle", "adventurous"
];
const specialPowers = [
  "healing touch", "understanding animals", "seeing angels", 
  "dream interpreter", "finding lost things", "knowing when someone needs help",
  "telling the perfect Bible story", "singing that makes plants grow", 
  "remembering every Bible verse", "making rainbows appear"
];

// Random name generator
const boyNames = [
  "Noah", "Elijah", "Daniel", "Matthew", "David", "Joseph", "Benjamin", 
  "Samuel", "John", "Isaac", "Jacob", "Ethan", "James", "Joshua", "Luke"
];

const girlNames = [
  "Sarah", "Hannah", "Ruth", "Esther", "Mary", "Naomi", "Rachel", 
  "Deborah", "Elizabeth", "Grace", "Faith", "Anna", "Leah", "Abigail", "Rebecca"
];

type CharacterFormProps = {
  onSubmit: (data: z.infer<typeof formSchema>) => void;
  loading?: boolean;
  initialCharacter?: Partial<z.infer<typeof formSchema>>;
};

export default function CharacterForm({ 
  onSubmit, 
  loading = false, 
  initialCharacter 
}: CharacterFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialCharacter?.name || "",
      gender: initialCharacter?.gender || "boy",
      age: initialCharacter?.age || 8,
      hair: initialCharacter?.hair || "brown",
      eyes: initialCharacter?.eyes || "brown",
      favoriteColor: initialCharacter?.favoriteColor || "blue",
      favoriteAnimal: initialCharacter?.favoriteAnimal || "lion",
      hobby: initialCharacter?.hobby || "reading",
      specialPower: initialCharacter?.specialPower || "healing touch",
      timeTravelExperience: initialCharacter?.timeTravelExperience || 0,
      personality: initialCharacter?.personality || "kind",
    },
  });

  const generateRandomName = () => {
    const gender = form.getValues("gender");
    const names = gender === "boy" ? boyNames : girlNames;
    const randomName = names[Math.floor(Math.random() * names.length)];
    form.setValue("name", randomName);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Your Time Traveler</CardTitle>
            <CardDescription>
              Design a character who can travel back in time to witness biblical events!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Character Name</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input placeholder="Enter a name" {...field} />
                      </FormControl>
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={generateRandomName}
                        className="whitespace-nowrap"
                      >
                        Random Name
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="boy">Boy</SelectItem>
                        <SelectItem value="girl">Girl</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="age"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Age: {field.value}</FormLabel>
                  <FormControl>
                    <Slider
                      min={5}
                      max={12}
                      step={1}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                    />
                  </FormControl>
                  <FormDescription>Choose an age between 5 and 12</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="hair"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hair Color</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select hair color" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {hairColors.map((color) => (
                          <SelectItem key={color} value={color}>
                            {color.charAt(0).toUpperCase() + color.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="eyes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Eye Color</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select eye color" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {eyeColors.map((color) => (
                          <SelectItem key={color} value={color}>
                            {color.charAt(0).toUpperCase() + color.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="favoriteColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Favorite Color</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select favorite color" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {favoriteColors.map((color) => (
                          <SelectItem key={color} value={color}>
                            {color.charAt(0).toUpperCase() + color.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="favoriteAnimal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Favorite Animal</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select favorite animal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {favoriteAnimals.map((animal) => (
                          <SelectItem key={animal} value={animal}>
                            {animal.charAt(0).toUpperCase() + animal.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="hobby"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Favorite Hobby</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select hobby" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {hobbies.map((hobby) => (
                          <SelectItem key={hobby} value={hobby}>
                            {hobby.charAt(0).toUpperCase() + hobby.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="personality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personality</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select personality trait" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {personalityTraits.map((trait) => (
                          <SelectItem key={trait} value={trait}>
                            {trait.charAt(0).toUpperCase() + trait.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="specialPower"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Special Power</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select special power" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {specialPowers.map((power) => (
                        <SelectItem key={power} value={power}>
                          {power.charAt(0).toUpperCase() + power.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    A special gift that helps your character during adventures
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timeTravelExperience"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time Travel Experience: {field.value}</FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={10}
                      step={1}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                    />
                  </FormControl>
                  <FormDescription>
                    How many time travel adventures your character has been on (0 for beginners)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating..." : "Create Character"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}