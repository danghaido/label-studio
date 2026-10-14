import { afterEach, describe, expect, it } from "bun:test";
import { destroy, types, unprotect } from "mobx-state-tree";
import { TabStore } from "./store";

const Root = types
  .model({
    viewsStore: types.optional(
      TabStore.actions(() => ({ saveView: () => Promise.resolve() })),
      {},
    ),
    apiVersion: 2,
    SDK: types.optional(types.frozen(), { hasInterface: () => false, invoke: () => {} }),
  })
  .actions(() => ({ unsetSelection() {} }));

let root;
afterEach(() => {
  if (root) destroy(root);
});

function createView() {
  root = Root.create({
    viewsStore: {
      columnsRaw: [
        { id: "id", title: "ID", type: "Number", target: "tasks" },
        {
          id: "ocr_document_type",
          title: "Loại tài liệu",
          type: "List",
          target: "tasks",
          hidden: true,
          schema: { multiple: true, items: [{ value: "prescription", title: "Đơn thuốc" }] },
        },
      ],
    },
  });
  root.viewsStore.fetchColumns();
  unprotect(root);
  root.viewsStore.views.push({
    id: 1,
    saved: true,
    filters: [{ filter: "filter:tasks:id", operator: "greater", value: 0 }],
  });
  root.viewsStore.selected = 1;
  return root.viewsStore.selected;
}

describe("Document type saved-view action", () => {
  it("persists document codes, updates the same filter and leaves other filters intact", async () => {
    const view = createView();
    await view.setDocumentTypeFilter(["prescription"]);
    expect(view.filters).toHaveLength(2);
    await view.setDocumentTypeFilter(["prescription", "__unclassified__"], "not_contains");
    expect(view.filters).toHaveLength(2);
    expect(view.serialize().data.filters.items).toEqual([
      expect.objectContaining({ filter: "filter:tasks:id", operator: "greater", value: 0 }),
      expect.objectContaining({
        filter: "filter:tasks:ocr_document_type",
        operator: "not_contains",
        value: ["prescription", "__unclassified__"],
      }),
    ]);
    view.setDocumentTypeFilter([]);
    expect(view.filters).toHaveLength(1);
    expect(view.filters[0].filter.id).toBe("filter:tasks:id");
  });

  it("does not mutate a locked saved view", () => {
    const view = createView();
    view.setLockState(true);
    view.setDocumentTypeFilter(["prescription"]);
    expect(view.filters).toHaveLength(1);
  });
});
