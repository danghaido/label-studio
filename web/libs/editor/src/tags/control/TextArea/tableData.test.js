import { describe, expect, it } from "bun:test";
import { normalizeTableRows, parseTableColumns, parseTableValues } from "./tableData";

const columns = [
  { field_key: "name", data_type: "string" },
  { field_key: "amount", data_type: "number" },
  { field_key: "original", data_type: "boolean" },
];

describe("OCR table data", () => {
  it("reads quoted CSV rows, numeric zero, false and empty cells", () => {
    expect(parseTableValues(['"Thuốc, sáng tối",0,false', "001,,"], columns)).toEqual([
      { name: "Thuốc, sáng tối", amount: 0, original: false },
      { name: "001", amount: null, original: null },
    ]);
  });

  it("round trips JSON arrays with typed values, commas and unknown keys", () => {
    const rows = [{ name: "Thuốc, A", amount: 1.25, original: true, extra: "keep" }];
    expect(parseTableValues([JSON.stringify(rows)], columns)).toEqual(rows);
    expect(parseTableValues(["[]"], columns)).toEqual([]);
    expect(parseTableValues([], columns)).toEqual([]);
  });

  it("normalizes missing cells without losing zero, false or leading zeros", () => {
    expect(normalizeTableRows([{ name: "001", amount: "0", original: "false" }, {}], columns)).toEqual([
      { name: "001", amount: 0, original: false },
      { name: null, amount: null, original: null },
    ]);
  });

  it("rejects malformed JSON, ambiguous numeric values and extra CSV cells", () => {
    for (const text of ["[broken", "x,1.000.000,true", "x,1,yes", "x,1,true,extra"]) {
      expect(() => parseTableValues([text], columns)).toThrow();
    }
    expect(() => normalizeTableRows([{ amount: true }], columns)).toThrow();
    expect(() => normalizeTableRows([null], columns)).toThrow();
  });

  it("rejects duplicate keys and unsupported column types", () => {
    expect(parseTableColumns(JSON.stringify(columns))).toEqual(columns);
    expect(() => parseTableColumns(JSON.stringify([columns[0], columns[0]]))).toThrow();
    expect(() => parseTableColumns('[{"field_key":"nested","data_type":"array"}]')).toThrow();
  });
});
