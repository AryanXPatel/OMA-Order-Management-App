import { assertRequiredHeaders, fetchSheetObjects } from "../fetchSheetObjects";

describe("fetchSheetObjects", () => {
  it("maps sheet rows to header keyed objects", () => {
    const values = [
      [" Product NAME ", "Rate", "Category"],
      ["Widget", "12.50", "Paint"],
      ["Primer", "", "Coating"],
    ];

    expect(fetchSheetObjects(values)).toEqual([
      {
        "Product NAME": "Widget",
        Rate: "12.50",
        Category: "Paint",
      },
      {
        "Product NAME": "Primer",
        Rate: "",
        Category: "Coating",
      },
    ]);
  });

  it("returns an empty array when no data rows exist", () => {
    expect(fetchSheetObjects([])).toEqual([]);
    expect(fetchSheetObjects([["Product NAME", "Rate"]])).toEqual([]);
  });

  it("accepts required headers when present", () => {
    expect(() =>
      assertRequiredHeaders([" Product NAME ", "Rate"], ["Product NAME", "Rate"])
    ).not.toThrow();
  });

  it("throws when required headers are missing", () => {
    expect(() => assertRequiredHeaders(["Product NAME"], ["Product NAME", "Rate"])).toThrow(
      "Missing required headers: Rate"
    );
  });
});
