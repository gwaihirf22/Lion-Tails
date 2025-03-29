import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Palette } from "lucide-react";

// More diverse theme options
type BookTheme = "classic" | "royal" | "fantasy" | "minimal" | "victorian" | "biblical" | "floral" | "modern";

// Background color options
type BgColor = "cream" | "white" | "blue" | "pink" | "green" | "brown" | "gray" | "yellow";

interface BookPageProps {
  title: string;
  content: string;
  verseText?: string;
  verseReference?: string;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  currentPage?: number;
  totalPages?: number;
}

export function BookPage({
  title,
  content,
  verseText,
  verseReference,
  onNextPage,
  onPrevPage,
  hasNextPage = false,
  hasPrevPage = false,
  currentPage = 1,
  totalPages = 1,
}: BookPageProps) {
  const [theme, setTheme] = useState<BookTheme>("classic");
  const [bgColor, setBgColor] = useState<BgColor>("cream");
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  
  // Split content into paragraphs for better formatting
  useEffect(() => {
    if (content) {
      setParagraphs(content.split("\n\n").filter(p => p.trim() !== ""));
    }
  }, [content]);

  // Get background color styles
  const getBgColorClass = () => {
    switch (bgColor) {
      case "cream": return "bg-[#fff8e6]";
      case "white": return "bg-white";
      case "blue": return "bg-blue-50";
      case "pink": return "bg-pink-50";
      case "green": return "bg-green-50";
      case "brown": return "bg-amber-100";
      case "gray": return "bg-gray-100";
      case "yellow": return "bg-yellow-50";
      default: return "bg-[#fff8e6]";
    }
  };

  // Theme-specific styles
  const getThemeStyles = () => {
    switch (theme) {
      case "classic":
        return {
          borderClass: `border-amber-800/60 ${getBgColorClass()}/95`,
          cornerClass: "text-amber-700",
          headerClass: "text-amber-900 font-serif",
          textClass: "text-amber-950 font-serif",
          verseClass: "text-amber-900 italic border-amber-300",
          ornateLevel: "medium",
        };
      case "royal":
        return {
          borderClass: `border-purple-800/70 ${getBgColorClass()}/95`,
          cornerClass: "text-purple-800",
          headerClass: "text-purple-900 font-serif",
          textClass: "text-purple-950 font-serif",
          verseClass: "text-purple-900 italic border-purple-300",
          ornateLevel: "high",
        };
      case "fantasy":
        return {
          borderClass: `border-teal-700/50 ${getBgColorClass()}/95`,
          cornerClass: "text-teal-700",
          headerClass: "text-teal-900 font-serif",
          textClass: "text-teal-950 font-serif",
          verseClass: "text-teal-900 italic border-teal-300",
          ornateLevel: "high",
        };
      case "minimal":
        return {
          borderClass: `border-gray-300/50 ${getBgColorClass()}/95`,
          cornerClass: "text-gray-400",
          headerClass: "text-gray-700 font-sans",
          textClass: "text-gray-800 font-sans",
          verseClass: "text-gray-700 italic border-gray-200",
          ornateLevel: "low",
        };
      case "victorian":
        return {
          borderClass: `border-amber-900/60 ${getBgColorClass()}/95`,
          cornerClass: "text-amber-800",
          headerClass: "text-amber-950 font-serif",
          textClass: "text-amber-950 font-serif",
          verseClass: "text-amber-900 italic border-amber-400",
          ornateLevel: "high",
        };
      case "biblical":
        return {
          borderClass: `border-indigo-700/40 ${getBgColorClass()}/95`,
          cornerClass: "text-indigo-700",
          headerClass: "text-indigo-900 font-serif",
          textClass: "text-indigo-950 font-serif",
          verseClass: "text-indigo-900 italic border-indigo-300",
          ornateLevel: "medium",
        };
      case "floral":
        return {
          borderClass: `border-emerald-700/40 ${getBgColorClass()}/95`,
          cornerClass: "text-emerald-700",
          headerClass: "text-emerald-800 font-serif",
          textClass: "text-emerald-950 font-serif",
          verseClass: "text-emerald-900 italic border-emerald-300",
          ornateLevel: "high",
        };
      case "modern":
        return {
          borderClass: `border-slate-500/40 ${getBgColorClass()}/95`,
          cornerClass: "text-slate-500",
          headerClass: "text-slate-800 font-sans",
          textClass: "text-slate-900 font-sans",
          verseClass: "text-slate-800 italic border-slate-300",
          ornateLevel: "low",
        };
      default:
        return {
          borderClass: `border-gray-300 ${getBgColorClass()}/95`,
          cornerClass: "text-gray-500",
          headerClass: "text-gray-900",
          textClass: "text-gray-800",
          verseClass: "text-gray-800 italic border-gray-300",
          ornateLevel: "medium",
        };
    }
  };

  const styles = getThemeStyles();

  return (
    <div className="w-full max-w-4xl mx-auto my-6 px-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex-1">
          {hasPrevPage && (
            <Button 
              variant="ghost" 
              onClick={onPrevPage}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous Page
            </Button>
          )}
        </div>
        
        <div className="flex-1 text-center flex gap-2 justify-center">
          <Select value={theme} onValueChange={(value: BookTheme) => setTheme(value)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select Theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">Classic</SelectItem>
              <SelectItem value="royal">Royal</SelectItem>
              <SelectItem value="fantasy">Fantasy</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="victorian">Victorian</SelectItem>
              <SelectItem value="biblical">Biblical</SelectItem>
              <SelectItem value="floral">Garden</SelectItem>
              <SelectItem value="modern">Modern</SelectItem>
            </SelectContent>
          </Select>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10">
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Background Color</h4>
                <div className="grid grid-cols-4 gap-2">
                  {["cream", "white", "blue", "pink", "green", "brown", "gray", "yellow"].map((color) => (
                    <button
                      key={color}
                      onClick={() => setBgColor(color as BgColor)}
                      className={cn(
                        "h-8 w-full rounded-md border border-gray-200",
                        {
                          "cream": "bg-[#fff8e6]",
                          "white": "bg-white",
                          "blue": "bg-blue-50",
                          "pink": "bg-pink-50",
                          "green": "bg-green-50", 
                          "brown": "bg-amber-100",
                          "gray": "bg-gray-100",
                          "yellow": "bg-yellow-50"
                        }[color],
                        bgColor === color ? "ring-2 ring-offset-2 ring-primary" : ""
                      )}
                      aria-label={`Set background to ${color}`}
                    />
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="flex-1 text-right">
          {hasNextPage && (
            <Button 
              variant="ghost" 
              onClick={onNextPage}
              className="flex items-center gap-1"
            >
              Next Page
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Book page with decorative border */}
      <Card className={cn(
        "relative p-8 md:p-12 min-h-[70vh] shadow-lg overflow-hidden",
        styles.borderClass,
        "border-[3px]"
      )}>
        {/* Ornate background patterns for high ornate level */}
        {styles.ornateLevel === "high" && (
          <>
            <div className="absolute top-0 left-0 right-0 h-12 opacity-10">
              <svg width="100%" height="48" viewBox="0 0 800 48" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                <path d="M0,0 C75,20 150,30 225,30 C300,30 375,20 450,10 C525,0 600,0 675,10 C750,20 825,30 900,30" stroke="currentColor" strokeWidth="2" fill="transparent"/>
                <path d="M0,40 C75,30 150,20 225,20 C300,20 375,30 450,40 C525,40 600,30 675,20 C750,10 825,10 900,20" stroke="currentColor" strokeWidth="2" fill="transparent"/>
              </svg>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-12 opacity-10 transform rotate-180">
              <svg width="100%" height="48" viewBox="0 0 800 48" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                <path d="M0,0 C75,20 150,30 225,30 C300,30 375,20 450,10 C525,0 600,0 675,10 C750,20 825,30 900,30" stroke="currentColor" strokeWidth="2" fill="transparent"/>
                <path d="M0,40 C75,30 150,20 225,20 C300,20 375,30 450,40 C525,40 600,30 675,20 C750,10 825,10 900,20" stroke="currentColor" strokeWidth="2" fill="transparent"/>
              </svg>
            </div>
          </>
        )}
        
        {/* Theme-specific border decorations */}
        {theme === "royal" && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-3 left-3 right-3 bottom-3 border-2 border-purple-400/20 rounded-sm"></div>
            <div className="absolute top-6 left-6 right-6 bottom-6 border border-purple-300/15 rounded-sm"></div>
          </div>
        )}
        
        {theme === "victorian" && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-4 left-4 right-4 bottom-4 border border-amber-500/20"></div>
            <div className="absolute top-5 left-5 right-5 bottom-5 border border-amber-600/10"></div>
          </div>
        )}
        
        {theme === "fantasy" && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-3 right-3 w-24 h-24 opacity-10">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M50,2 C60,15 70,25 80,30 C90,35 95,35 98,30 C90,50 75,65 50,75 C25,65 10,50 2,30 C5,35 10,35 20,30 C30,25 40,15 50,2 Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="absolute bottom-3 left-3 w-24 h-24 opacity-10 transform rotate-180">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M50,2 C60,15 70,25 80,30 C90,35 95,35 98,30 C90,50 75,65 50,75 C25,65 10,50 2,30 C5,35 10,35 20,30 C30,25 40,15 50,2 Z" fill="currentColor"/>
              </svg>
            </div>
          </div>
        )}
        
        {/* For minimal design, no corner decorations */}
        {styles.ornateLevel !== "low" && (
          <>
            {/* Corner decorations */}
            <div className={cn("absolute top-0 left-0 w-16 h-16", styles.cornerClass)}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M64 0H0V24C0 24 8 24 16 32C24 40 24 64 24 64H64V0Z" fill="transparent"/>
                <path d="M1 1V23C1 23 9 23 17 31C25 39 25 63 25 63H63V1H1Z" stroke="currentColor" strokeOpacity="0.3" fill="transparent"/>
                <path d="M8 8L8 20C8 20 14 20 20 26C26 32 26 50 26 50" stroke="currentColor" strokeOpacity="0.2" fill="transparent"/>
              </svg>
            </div>
            <div className={cn("absolute top-0 right-0 w-16 h-16", styles.cornerClass)}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 0H64V24C64 24 56 24 48 32C40 40 40 64 40 64H0V0Z" fill="transparent"/>
                <path d="M63 1V23C63 23 55 23 47 31C39 39 39 63 39 63H1V1H63Z" stroke="currentColor" strokeOpacity="0.3" fill="transparent"/>
                <path d="M56 8L56 20C56 20 50 20 44 26C38 32 38 50 38 50" stroke="currentColor" strokeOpacity="0.2" fill="transparent"/>
              </svg>
            </div>
            <div className={cn("absolute bottom-0 left-0 w-16 h-16", styles.cornerClass)}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M64 64H0V40C0 40 8 40 16 32C24 24 24 0 24 0H64V64Z" fill="transparent"/>
                <path d="M1 63V41C1 41 9 41 17 33C25 25 25 1 25 1H63V63H1Z" stroke="currentColor" strokeOpacity="0.3" fill="transparent"/>
                <path d="M8 56L8 44C8 44 14 44 20 38C26 32 26 14 26 14" stroke="currentColor" strokeOpacity="0.2" fill="transparent"/>
              </svg>
            </div>
            <div className={cn("absolute bottom-0 right-0 w-16 h-16", styles.cornerClass)}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 64H64V40C64 40 56 40 48 32C40 24 40 0 40 0H0V64Z" fill="transparent"/>
                <path d="M63 63V41C63 41 55 41 47 33C39 25 39 1 39 1H1V63H63Z" stroke="currentColor" strokeOpacity="0.3" fill="transparent"/>
                <path d="M56 56L56 44C56 44 50 44 44 38C38 32 38 14 38 14" stroke="currentColor" strokeOpacity="0.2" fill="transparent"/>
              </svg>
            </div>
          </>
        )}
        
        {/* Decorative header */}
        <div className="text-center mb-8 relative">
          <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-current opacity-20"></div>
          
          {/* Decorative flourish before title */}
          <div className="flex items-center justify-center mb-2">
            <svg width="120" height="20" viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M60 0C53.5 0 50 5 45 10C40 15 35 20 27.5 20C20 20 10 15 0 15V17.5C10 17.5 20 22.5 27.5 22.5C35 22.5 40 17.5 45 12.5C50 7.5 53.5 2.5 60 2.5C66.5 2.5 70 7.5 75 12.5C80 17.5 85 22.5 92.5 22.5C100 22.5 110 17.5 120 17.5V15C110 15 100 20 92.5 20C85 20 80 15 75 10C70 5 66.5 0 60 0Z" fill="currentColor" fillOpacity="0.3"/>
            </svg>
          </div>
          
          <h1 className={cn("text-2xl md:text-3xl font-bold relative inline-block px-6", styles.headerClass)}>
            {title}
          </h1>
          
          {/* Decorative flourish after title */}
          <div className="flex items-center justify-center mt-2">
            <svg width="120" height="20" viewBox="0 0 120 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform rotate-180">
              <path d="M60 0C53.5 0 50 5 45 10C40 15 35 20 27.5 20C20 20 10 15 0 15V17.5C10 17.5 20 22.5 27.5 22.5C35 22.5 40 17.5 45 12.5C50 7.5 53.5 2.5 60 2.5C66.5 2.5 70 7.5 75 12.5C80 17.5 85 22.5 92.5 22.5C100 22.5 110 17.5 120 17.5V15C110 15 100 20 92.5 20C85 20 80 15 75 10C70 5 66.5 0 60 0Z" fill="currentColor" fillOpacity="0.3"/>
            </svg>
          </div>
        </div>
        
        {/* Content */}
        <div className={cn("prose max-w-none", styles.textClass)}>
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="mb-4 leading-relaxed text-base md:text-lg">
              {paragraph}
            </p>
          ))}
          
          {/* Bible verse with floral decoration */}
          {verseText && (
            <div className={cn("mt-8 p-4 border-t border-b relative", styles.verseClass)}>
              {/* Decorative flowers left */}
              <div className="absolute left-0 -top-5 w-32 h-10 overflow-hidden opacity-70">
                <svg width="120" height="40" viewBox="0 0 210 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M210 0C189 0 170 15 160 30C150 15 130 0 105 0C80 0 60 15 50 30C40 15 20 0 0 0V4C20 4 40 19 50 34C60 19 80 4 105 4C130 4 150 19 160 34C170 19 190 4 210 4V0Z" fill="currentColor" fillOpacity="0.3"/>
                </svg>
              </div>
              
              {/* Verse content */}
              <div className="py-4">
                <p className="text-center mb-4 italic">{verseText}</p>
                {verseReference && (
                  <p className="text-center text-sm font-semibold">— {verseReference}</p>
                )}
              </div>
              
              {/* Decorative flowers right */}
              <div className="absolute right-0 -bottom-5 w-32 h-10 overflow-hidden opacity-70 transform rotate-180">
                <svg width="120" height="40" viewBox="0 0 210 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M210 0C189 0 170 15 160 30C150 15 130 0 105 0C80 0 60 15 50 30C40 15 20 0 0 0V4C20 4 40 19 50 34C60 19 80 4 105 4C130 4 150 19 160 34C170 19 190 4 210 4V0Z" fill="currentColor" fillOpacity="0.3"/>
                </svg>
              </div>
            </div>
          )}
        </div>
        
        {/* Page number */}
        <div className="mt-8 text-center text-sm opacity-70">
          {currentPage} of {totalPages}
        </div>
      </Card>
    </div>
  );
}