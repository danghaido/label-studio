import Papa from "papaparse";

export function parseTableColumns(value) {
  const columns = JSON.parse(value);
  if (!Array.isArray(columns) || !columns.length) throw new Error("Bảng cần ít nhất một cột.");
  const keys = new Set();
  for (const column of columns) {
    if (
      !column.field_key ||
      keys.has(column.field_key) ||
      !["string", "number", "boolean"].includes(column.data_type)
    ) {
      throw new Error("Cấu hình cột không hợp lệ hoặc trùng field_key.");
    }
    keys.add(column.field_key);
  }
  return columns;
}

export function normalizeTableRows(rows, columns) {
  if (!Array.isArray(rows)) throw new Error("Dữ liệu bảng phải là JSON Array.");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Dòng ${index + 1} phải là object.`);
    // Preserve unrecognized keys from existing predictions instead of silently deleting them.
    const normalized = { ...row };
    for (const column of columns) {
      const key = column.field_key;
      const value = row[key];
      const fail = () => {
        throw new Error(`Dòng ${index + 1}, ${column.field_name || key}: giá trị không đúng kiểu ${column.data_type}.`);
      };
      if (value == null || (typeof value === "string" && !value.trim())) {
        normalized[key] = null;
      } else if (column.data_type === "string") {
        if (!["string", "number", "boolean"].includes(typeof value)) fail();
        normalized[key] = String(value);
      } else if (column.data_type === "number") {
        if (typeof value !== "number" && typeof value !== "string") fail();
        if (typeof value === "string" && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) fail();
        const number = Number(value);
        if (!Number.isFinite(number)) fail();
        normalized[key] = number;
      } else {
        if (value === true || value === "true") normalized[key] = true;
        else if (value === false || value === "false") normalized[key] = false;
        else if (value === "null") normalized[key] = null;
        else fail();
      }
    }
    return normalized;
  });
}

/** Accept the existing one-CSV-row-per-text format and the new single JSON array. */
export function parseTableValues(values, columns) {
  if (!values?.length) return [];
  if (values.length === 1 && values[0].trimStart().startsWith("[")) {
    return normalizeTableRows(JSON.parse(values[0]), columns);
  }
  const rows = values.flatMap((text) => {
    if (text.trimStart().startsWith("{")) return [JSON.parse(text)];
    const parsed = Papa.parse(text, { delimiter: ",", skipEmptyLines: "greedy" });
    if (parsed.errors.length) throw new Error(`Không đọc được CSV: ${parsed.errors[0].message}`);
    return parsed.data.map((cells) => {
      if (cells.length > columns.length)
        throw new Error("Dòng CSV có nhiều ô hơn số cột. Kiểm tra dấu phẩy và dấu ngoặc kép.");
      return Object.fromEntries(columns.map((column, index) => [column.field_key, cells[index]?.trim() ?? null]));
    });
  });
  return normalizeTableRows(rows, columns);
}
