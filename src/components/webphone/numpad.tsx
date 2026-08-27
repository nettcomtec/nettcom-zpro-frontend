"use client";

import { Button } from "@/components/ui/button";

const keys = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

interface NumpadProps {
  onPress: (key: string) => void;
}

export function Numpad({ onPress }: NumpadProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.flat().map((key) => (
        <Button
          key={key}
          variant="outline"
          className="h-12 w-12 text-lg font-semibold"
          onClick={() => onPress(key)}
        >
          {key}
        </Button>
      ))}
    </div>
  );
}
