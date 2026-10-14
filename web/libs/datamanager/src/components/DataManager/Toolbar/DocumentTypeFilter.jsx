import { useState } from "react";
import { inject, observer } from "mobx-react";
import { Button, Dropdown } from "@humansignal/ui";
import { CaretDownIcon } from "@humansignal/icons";

const selection = (filter) => {
  const value = filter?.currentValue;
  return typeof value === "string" ? [value] : Array.from(value ?? []);
};

export const DocumentTypeOptions = observer(({ view, filterType }) => {
  const [search, setSearch] = useState("");
  const filter = view.filters.find((item) => item.filter.id === filterType.id);
  const selected = selection(filter);
  const [initialOperator, setInitialOperator] = useState("contains");
  const operator = filter?.operator ?? initialOperator;
  const options = filterType.schema.items.filter((item) =>
    item.title.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );
  const disabled = view.isLockedByManager;
  return (
    <div style={{ width: 330, padding: 12 }} aria-label="Lọc loại tài liệu" data-testid="document-type-options">
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        {[
          ["contains", "Bao gồm"],
          ["not_contains", "Loại trừ"],
        ].map(([value, label]) => (
          <label key={value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="document-type-operator"
              checked={operator === value}
              disabled={disabled}
              onChange={() => {
                setInitialOperator(value);
                if (selected.length) view.setDocumentTypeFilter(selected, value);
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <input
        type="search"
        aria-label="Tìm loại tài liệu"
        placeholder="Tìm loại tài liệu…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8, border: "1px solid #ccc", borderRadius: 4 }}
      />
      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        {options.map((option) => (
          <label
            key={option.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 4px",
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              disabled={disabled}
              onChange={(event) =>
                view.setDocumentTypeFilter(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((value) => value !== option.value),
                  operator,
                )
              }
            />
            {option.title}
          </label>
        ))}
        {!options.length && <p>Không tìm thấy loại tài liệu.</p>}
      </div>
      <Button
        size="small"
        look="outlined"
        disabled={disabled || !selected.length}
        onClick={() => view.setDocumentTypeFilter([])}
      >
        Xóa bộ lọc loại tài liệu
      </Button>
      <p style={{ fontSize: 11, margin: "8px 0 0", opacity: 0.7 }}>
        Số lượng trong toàn project · Nhấn Refresh để cập nhật.
      </p>
    </div>
  );
});

export const DocumentTypeFilter = inject(({ store }) => ({ view: store.currentView }))(
  observer(({ view, size }) => {
    const filterType = view?.availableFilters.find((type) => type.field.alias === "ocr_document_type");
    if (!filterType) return null;
    const active = view.filters.find((filter) => filter.filter.id === filterType.id);
    const count = selection(active).length;
    return (
      <Dropdown.Trigger
        content={<DocumentTypeOptions view={view} filterType={filterType} />}
        openUpwardForShortViewport={false}
      >
        <Button
          size={size ?? "small"}
          variant={count ? "primary" : "neutral"}
          look="outlined"
          trailing={<CaretDownIcon size={16} />}
          aria-label="Loại tài liệu"
        >
          Loại tài liệu{count ? ` (${count})` : ""}
        </Button>
      </Dropdown.Trigger>
    );
  }),
);
