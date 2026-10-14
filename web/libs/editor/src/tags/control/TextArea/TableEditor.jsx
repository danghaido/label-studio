import { Alert, Button, Input, InputNumber, Select } from "antd";
import { observer } from "mobx-react";
import { cn } from "../../../utils/bem";
import { parseTableColumns, parseTableValues } from "./tableData";
import "./TableEditor.prefix.css";

const block = cn("ocr-table-editor");

/** All edits go through the TextArea result model, including draft/undo/prediction handling. */
export const TableEditor = observer(({ item }) => {
  let columns;
  let rows;
  try {
    if (item._value?.trim())
      throw new Error(
        "Có dòng văn bản chưa Add trong draft cũ. Nhấn Add để đưa dòng này vào dữ liệu trước khi nhập bảng.",
      );
    columns = parseTableColumns(item.tablecolumns);
    rows = parseTableValues(item.selectedValues(), columns);
  } catch (error) {
    return (
      <div className={block.toClassName()}>
        <Alert type="error" showIcon message="Không thể mở bảng" description={error.message} />
        <p>Dữ liệu gốc được giữ nguyên. Sửa dữ liệu trong các ô văn bản bên dưới.</p>
      </div>
    );
  }
  const disabled = item.isReadOnly() || !item.annotation.editable;
  const setCell = (index, key, value) => {
    const next = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row));
    item.setTableRows(next);
  };
  return (
    <div
      className={block.toClassName()}
      data-testid="table-editor"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <div className={block.elem("scroll").toClassName()}>
        <table aria-label={item.name}>
          <thead>
            <tr>
              <th scope="col">Dòng</th>
              {columns.map((column) => (
                <th scope="col" key={column.field_key}>
                  {column.field_name || column.field_key}
                </th>
              ))}
              {!disabled && <th scope="col">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              // Rows have no domain identifier; indices are stable for cell edits and all inputs are controlled.
              <tr key={index}>
                <th scope="row">{index + 1}</th>
                {columns.map((column) => {
                  const key = column.field_key;
                  const label = `Dòng ${index + 1}: ${column.field_name || key}`;
                  return (
                    <td key={key}>
                      {column.data_type === "boolean" ? (
                        <Select
                          aria-label={label}
                          disabled={disabled}
                          value={row[key] == null ? "null" : String(row[key])}
                          options={[
                            { value: "null", label: "—" },
                            { value: "true", label: "Có" },
                            { value: "false", label: "Không" },
                          ]}
                          onChange={(value) => setCell(index, key, value === "null" ? null : value === "true")}
                        />
                      ) : column.data_type === "number" ? (
                        <InputNumber
                          aria-label={label}
                          disabled={disabled}
                          value={row[key]}
                          onChange={(value) => setCell(index, key, value)}
                        />
                      ) : (
                        <Input
                          aria-label={label}
                          disabled={disabled}
                          value={row[key] ?? ""}
                          onChange={(event) => setCell(index, key, event.target.value)}
                        />
                      )}
                    </td>
                  );
                })}
                {!disabled && (
                  <td>
                    <Button
                      danger
                      aria-label={`Xóa dòng ${index + 1}`}
                      onClick={() => item.setTableRows(rows.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      Xóa
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={block.elem("toolbar").toClassName()}>
        {!disabled && <Button onClick={() => item.setTableRows([...rows, {}])}>Thêm dòng</Button>}
        <span>{rows.length} dòng · Ô trống được lưu thành null</span>
      </div>
    </div>
  );
});
