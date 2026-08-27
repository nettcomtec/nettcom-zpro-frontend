"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export interface PageHelpSection {
  title: string;
  items: string[];
}

export interface PageHelpProps {
  description: string;
  sections: PageHelpSection[];
}

export function PageHelp({ description, sections }: PageHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground"
          aria-label="Ajuda da página"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-96 text-sm p-0 flex flex-col"
        style={{ maxHeight: "min(32rem, calc(var(--radix-popover-content-available-height) - 1rem))" }}
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b shrink-0">
          <HelpCircle className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground">Como usar esta página</span>
        </div>
        <div className="overflow-y-auto min-h-0 flex-1 px-4 py-3">
          <p className="text-muted-foreground leading-relaxed">{description}</p>
          {sections.map((section, i) => (
            <div key={i}>
              <Separator className="my-3" />
              <p className="font-medium text-foreground mb-2">{section.title}</p>
              <ul className="space-y-1.5">
                {section.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-muted-foreground leading-snug">
                    <span className="text-primary shrink-0 mt-px">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
