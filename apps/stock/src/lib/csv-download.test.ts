import { describe, expect, it } from "vitest";
import { toCsv } from "../../../../packages/ui/src/csv-download";

describe("toCsv", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(toCsv(["a", "b"], [['x, "y"', "l1\nl2"]])).toBe('a,b\r\n"x, ""y""","l1\nl2"\r\n');
  });
  it("keeps numbers and blanks, and defuses formulas in text only", () => {
    expect(toCsv(["n"], [[-5], [null], ["=SUM(A1)"], ["-x"], ["ok"]])).toBe("n\r\n-5\r\n\r\n'=SUM(A1)\r\n'-x\r\nok\r\n");
  });
});
