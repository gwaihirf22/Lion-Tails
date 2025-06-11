import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Search, Sparkles } from 'lucide-react';
import { searchAnimals, getPopularAnimals, isLikelyAnimal } from '@shared/animalData';

interface AnimalAutocompleteProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowNone?: boolean;
}

const AnimalAutocomplete: React.FC<AnimalAutocompleteProps> = ({
  value,
  onChange,
  placeholder = "Type any animal name...",
  className = "",
  allowNone = true
}) => {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showPopular, setShowPopular] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Initialize with popular animals when empty
  useEffect(() => {
    if (!inputValue && showPopular) {
      setSuggestions(getPopularAnimals());
    } else if (inputValue.length >= 1) {
      const results = searchAnimals(inputValue, 15);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  }, [inputValue, showPopular]);

  // Update input value when external value changes
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setShowSuggestions(true);
    setShowPopular(false);
    setFocusedIndex(-1);
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
    if (!inputValue) {
      setShowPopular(true);
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) {
        setShowSuggestions(false);
        setShowPopular(false);
        setFocusedIndex(-1);
      }
    }, 150);
  };

  const handleSuggestionClick = (animal: string) => {
    setInputValue(animal);
    onChange(animal);
    setShowSuggestions(false);
    setShowPopular(false);
    setFocusedIndex(-1);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && suggestions[focusedIndex]) {
          handleSuggestionClick(suggestions[focusedIndex]);
        } else if (inputValue) {
          // Allow custom animal names
          onChange(inputValue);
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setShowPopular(false);
        setFocusedIndex(-1);
        break;
    }
  };

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onChange(inputValue.trim());
      setShowSuggestions(false);
      setShowPopular(false);
    }
  };

  const handleClear = () => {
    setInputValue('');
    onChange(allowNone ? 'none' : '');
    setShowSuggestions(false);
    setShowPopular(false);
    inputRef.current?.focus();
  };

  const capitalizeWords = (str: string): string => {
    return str.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const isValidAnimal = inputValue && (
    suggestions.includes(inputValue.toLowerCase()) || 
    isLikelyAnimal(inputValue)
  );

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 text-muted-foreground transform -translate-y-1/2 z-10" />
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          className="pl-10 pr-20"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {inputValue && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 w-6 p-0 hover:bg-secondary/80"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {inputValue && !suggestions.includes(inputValue.toLowerCase()) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSubmit}
              className="h-6 px-2 text-xs"
              title="Use this custom animal name"
            >
              ✓
            </Button>
          )}
        </div>
      </div>

      {/* Validation indicator */}
      {inputValue && (
        <div className="mt-1 flex items-center gap-2">
          {isValidAnimal ? (
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              Great choice!
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Custom animal name
            </Badge>
          )}
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {showPopular && (
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 border-b">
              Popular choices
            </div>
          )}
          {suggestions.map((animal, index) => (
            <button
              key={`${animal}-${index}`}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary/80 transition-colors ${
                index === focusedIndex ? 'bg-secondary/80' : ''
              }`}
              onClick={() => handleSuggestionClick(animal)}
              onMouseEnter={() => setFocusedIndex(index)}
            >
              {capitalizeWords(animal)}
            </button>
          ))}
          {!showPopular && inputValue && !suggestions.includes(inputValue.toLowerCase()) && (
            <div className="border-t">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/50 transition-colors italic"
                onClick={handleSubmit}
              >
                Use "{capitalizeWords(inputValue)}" (custom)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Helper text */}
      <div className="mt-1 text-xs text-muted-foreground">
        {allowNone && (
          <span>Type any animal name or leave empty for none. </span>
        )}
        <span>Use arrow keys to navigate suggestions.</span>
      </div>
    </div>
  );
};

export default AnimalAutocomplete;