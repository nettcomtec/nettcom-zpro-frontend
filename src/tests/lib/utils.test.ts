import { describe, it, expect } from "vitest";
import { cn, truncate, getInitials } from "@/lib/utils";

describe("cn (className merge)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges tailwind classes correctly", () => {
    const result = cn("px-2 py-1", "px-4");
    expect(result).toContain("px-4");
    expect(result).not.toContain("px-2");
  });
});

describe("truncate", () => {
  it("truncates long strings", () => {
    expect(truncate("Hello World", 5)).toBe("Hello...");
  });

  it("returns original if shorter than max", () => {
    expect(truncate("Hi", 10)).toBe("Hi");
  });
});

describe("getInitials", () => {
  it("returns initials from full name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("returns single initial", () => {
    expect(getInitials("John")).toBe("J");
  });

  it("handles empty string", () => {
    expect(getInitials("")).toBe("");
  });
});
