import { describe, expect, it, mock, afterEach } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { DocumentTypeOptions } from "./DocumentTypeFilter";

afterEach(cleanup);

const filterType = {
  id: "filter:tasks:ocr_document_type",
  schema: {
    items: [
      { value: "__unclassified__", title: "Chưa phân loại (2)" },
      { value: "prescription", title: "Đơn thuốc (3)" },
      { value: "vat_invoice", title: "Hóa đơn giá trị gia tăng (1)" },
    ],
  },
};

describe("Vietnamese document type filter", () => {
  it("shows predefined labels and submits codes instead of display labels", () => {
    const update = mock();
    const view = render(
      <DocumentTypeOptions filterType={filterType} view={{ filters: [], setDocumentTypeFilter: update }} />,
    );
    fireEvent.click(view.getByLabelText("Đơn thuốc (3)"));
    expect(update).toHaveBeenCalledWith(["prescription"], "contains");
    expect(view.queryByText("prescription")).toBeNull();
  });

  it("searches labels and supports exclusion and unclassified tasks", () => {
    const update = mock();
    const view = render(
      <DocumentTypeOptions filterType={filterType} view={{ filters: [], setDocumentTypeFilter: update }} />,
    );
    fireEvent.click(view.getByLabelText("Loại trừ"));
    fireEvent.change(view.getByLabelText("Tìm loại tài liệu"), { target: { value: "chưa phân" } });
    expect(view.queryByLabelText("Đơn thuốc (3)")).toBeNull();
    fireEvent.click(view.getByLabelText("Chưa phân loại (2)"));
    expect(update).toHaveBeenCalledWith(["__unclassified__"], "not_contains");
  });

  it("restores the view selection, allows multiple values and clears only this filter", () => {
    const update = mock();
    const filters = [{ filter: filterType, operator: "contains", currentValue: ["prescription"] }];
    const view = render(
      <DocumentTypeOptions filterType={filterType} view={{ filters, setDocumentTypeFilter: update }} />,
    );
    expect(view.getByLabelText("Đơn thuốc (3)").checked).toBe(true);
    fireEvent.click(view.getByLabelText("Hóa đơn giá trị gia tăng (1)"));
    expect(update).toHaveBeenCalledWith(["prescription", "vat_invoice"], "contains");
    fireEvent.click(view.getByText("Xóa bộ lọc loại tài liệu"));
    expect(update).toHaveBeenLastCalledWith([]);
  });

  it("respects locked views", () => {
    const update = mock();
    const view = render(
      <DocumentTypeOptions
        filterType={filterType}
        view={{ filters: [], isLockedByManager: true, setDocumentTypeFilter: update }}
      />,
    );
    expect(view.getByLabelText("Đơn thuốc (3)").disabled).toBe(true);
    expect(view.getByLabelText("Loại trừ").disabled).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});
