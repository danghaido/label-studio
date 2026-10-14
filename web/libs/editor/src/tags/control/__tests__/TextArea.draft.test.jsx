/**
 * UTC-945: uncommitted TextArea input must survive draft autosave / reload.
 *
 * Uses Image (not RichText/Text) as the toName target so AppStore.create stays
 * stable in the full unit suite — MST reference unions are frozen at first
 * AppStore import and RichTextModel may be absent when earlier files load the store.
 */
if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

mockModule("keymaster", () => {
  let scope = "all";
  const keymaster = () => {};
  keymaster.unbind = () => {};
  keymaster.setScope = (nextScope) => {
    scope = nextScope ?? scope;
  };
  keymaster.getScope = () => scope;
  return { __esModule: true, default: keymaster };
});

import "../../../tags/visual/View";
import "../../../tags/object/Image/Image.js";
import { HtxTextArea } from "../../../tags/control/TextArea/TextArea";
import { cleanup, fireEvent, render } from "@testing-library/react";
import "../../../tags/control/Label";
import "../../../tags/control/Labels/Labels";
import "../../../regions/RectRegion";
import AppStore from "../../../stores/AppStore";

const TEXTAREA_CONFIG =
  '<View><Image name="img" value="$img"/><TextArea name="notes" toName="img" rows="3" showSubmitButton="true"/></View>';

const PER_REGION_TEXTAREA_CONFIG = `<View>
  <Image name="img" value="$img"/>
  <Labels name="labels" toName="img"><Label value="Typo"/></Labels>
  <TextArea name="notes" toName="img" perRegion="true" maxSubmissions="1"/>
</View>`;

const createTestEnv = () => ({
  events: {
    hasEvent: mock((name) => name === "submitDraft"),
    invoke: mock(),
    invokeFirst: mock(),
  },
  messages: {},
  settings: {},
});

function createStoreWithTextArea(config = TEXTAREA_CONFIG) {
  const env = createTestEnv();
  const store = AppStore.create(
    {
      config,
      task: { id: 1, data: JSON.stringify({ img: "https://example.com/test.jpg" }) },
      interfaces: ["basic"],
    },
    env,
  );
  store.initializeStore({});
  const annotation = store.annotationStore.addAnnotation({ result: [] });
  store.annotationStore.selectAnnotation(annotation.id);
  const notes = annotation.names.get("notes");
  const img = annotation.names.get("img");
  return { store, annotation, notes, img, env };
}

describe("TextArea draft persistence (UTC-945)", () => {
  it("includes pending input in draft serialization without committing to regions", async () => {
    const { annotation, notes, store } = createStoreWithTextArea();
    store.submitDraft = mock().mockResolvedValue({ id: 1 });

    notes.setValue("uncommitted draft text", { skipDraftSave: true });
    await annotation.saveDraft();

    expect(notes.regions).toHaveLength(0);
    expect(notes._value).toBe("uncommitted draft text");

    const serialized = annotation.serializeAnnotation({ fast: true });
    const textareaResult = serialized.find((r) => r.from_name === "notes");

    expect(textareaResult).toBeDefined();
    expect(textareaResult.meta?.textAreaPendingInput).toBe("uncommitted draft text");
    expect(textareaResult.value?.text).toEqual([]);
  });

  it("does not create draft noise for whitespace-only pending input", async () => {
    const { annotation, notes, store } = createStoreWithTextArea();
    store.submitDraft = mock().mockResolvedValue({ id: 1 });

    notes.setValue("   ", { skipDraftSave: true });
    await annotation.saveDraft();

    const serialized = annotation.serializeAnnotation({ fast: true });
    expect(serialized.find((r) => r.from_name === "notes")).toBeUndefined();
  });

  it("restores pending input from draft meta on needsUpdate", () => {
    const { annotation, notes, img } = createStoreWithTextArea();

    annotation.createResult({}, { text: ["committed line"] }, notes, img);
    notes.result.setMetaValue("textAreaPendingInput", "restored pending");

    notes.needsUpdate();

    expect(notes.regions.map((r) => r._value)).toEqual(["committed line"]);
    expect(notes._value).toBe("restored pending");
  });

  it("clears pending draft meta when text is committed via addText", () => {
    const { annotation, notes, img } = createStoreWithTextArea();

    annotation.createResult({}, { text: [] }, notes, img);
    notes.setValue("will commit", { skipDraftSave: true });
    notes.syncPendingDraftState();

    expect(notes.result.meta?.textAreaPendingInput).toBe("will commit");

    notes.addText("will commit");

    expect(notes.result.meta?.textAreaPendingInput).toBeUndefined();
    expect(notes.regions.map((r) => r._value)).toEqual(["will commit"]);
  });
});

describe("per-region TextArea draft autosave (FIT-2829)", () => {
  it("does not create an empty per-object result for uncommitted per-region input", async () => {
    const { annotation, notes, img, store } = createStoreWithTextArea(PER_REGION_TEXTAREA_CONFIG);
    store.submitDraft = mock().mockResolvedValue({ id: 1 });
    const labels = annotation.names.get("labels");

    const area = annotation.createResult(
      { x: 10, y: 10, width: 20, height: 20, rotation: 0 },
      { labels: ["Typo"] },
      labels,
      img,
    );
    annotation.selectArea(area);

    notes.setValue("rectext", { skipDraftSave: true });
    await annotation.saveDraft();

    const textareaResultsBeforeCommit = annotation
      .serializeAnnotation({ fast: true })
      .filter((r) => r.from_name === "notes");
    expect(textareaResultsBeforeCommit).toEqual([]);

    notes.addText(notes._value);

    const textareaResults = annotation.serializeAnnotation({ fast: true }).filter((r) => r.from_name === "notes");
    expect(textareaResults).toHaveLength(1);
    expect(textareaResults[0].id).toBe(area.cleanId);
    expect(textareaResults[0].value.text).toEqual(["rectext"]);
  });
});

describe("schema-driven TextArea table persistence", () => {
  const columns = [
    { field_key: "name", data_type: "string" },
    { field_key: "quantity", data_type: "number" },
    { field_key: "original", data_type: "boolean" },
  ];
  const config = `<View><Image name="img" value="$img"/><TextArea name="notes" toName="img"
    tableColumns='${JSON.stringify(columns)}'/><TextArea name="other" toName="img"/></View>`;

  it("saves typed table edits and restores them through annotation deserialization", () => {
    const { notes, annotation, store } = createStoreWithTextArea(config);
    const rows = [{ name: "Thuốc, sáng tối", quantity: 0, original: false }, {}];
    annotation.names.get("other").addText("unchanged");
    notes.setTableRows(rows);
    notes.beforeSend();
    const result = annotation.serializeAnnotation({ fast: true });
    const table = result.find((entry) => entry.from_name === "notes");
    expect(table.type).toBe("textarea");
    expect(JSON.parse(table.value.text[0])).toEqual([
      { name: "Thuốc, sáng tối", quantity: 0, original: false },
      { name: null, quantity: null, original: null },
    ]);
    expect(result.find((entry) => entry.from_name === "other").value.text).toEqual(["unchanged"]);
    const restored = store.annotationStore.addAnnotation({ result });
    restored.deserializeResults(result);
    store.annotationStore.selectAnnotation(restored.id);
    restored.updateObjects();
    expect(restored.names.get("notes").selectedValues()).toEqual(table.value.text);
  });

  it("reads legacy prediction results and can delete every row", () => {
    const { notes, annotation, img } = createStoreWithTextArea(config);
    annotation.createResult({}, { text: ['"Thuốc, A",14,false'] }, notes, img);
    notes.needsUpdate();
    expect(notes.validateValue(notes.selectedValues())).toBe(true);
    notes.setTableRows([]);
    expect(annotation.serializeAnnotation({ fast: true }).find((r) => r.from_name === "notes").value.text).toEqual([
      "[]",
    ]);
  });

  it("persists table data in drafts and updates the same result", async () => {
    const { notes, annotation, store } = createStoreWithTextArea(config);
    store.submitDraft = mock().mockResolvedValue({ id: 1 });
    notes.setTableRows([{ name: "first", quantity: 1, original: true }]);
    notes.setTableRows([{ name: "updated", quantity: 0, original: false }]);
    await annotation.saveDraft();
    const results = annotation.serializeAnnotation({ fast: true }).filter((r) => r.from_name === "notes");
    expect(results).toHaveLength(1);
    expect(JSON.parse(results[0].value.text[0])).toEqual([{ name: "updated", quantity: 0, original: false }]);
    expect(results[0].meta?.textAreaPendingInput).toBeUndefined();
  });

  it("does not edit results when annotation is read-only", () => {
    const { notes, annotation } = createStoreWithTextArea(config);
    notes.setTableRows([{ name: "keep", quantity: 1, original: true }]);
    const previous = notes.selectedValues();
    annotation.setEditable(false);
    notes.setTableRows([]);
    expect(notes.selectedValues()).toEqual(previous);
  });

  it("adds, edits and deletes rows through the rendered editor", () => {
    const { notes, annotation } = createStoreWithTextArea(config);
    const view = render(<HtxTextArea item={notes} />);
    try {
      fireEvent.click(view.getByText("Thêm dòng"));
      fireEvent.change(view.getByLabelText("Dòng 1: name"), { target: { value: "Thuốc, A" } });
      expect(JSON.parse(notes.selectedValues()[0])[0].name).toBe("Thuốc, A");
      fireEvent.change(view.getByLabelText("Dòng 1: quantity"), { target: { value: "14" } });
      fireEvent.blur(view.getByLabelText("Dòng 1: quantity"));
      expect(JSON.parse(notes.selectedValues()[0])[0].quantity).toBe(14);
      fireEvent.click(view.getByText("Thêm dòng"));
      expect(JSON.parse(notes.selectedValues()[0])).toHaveLength(2);
      fireEvent.click(view.getByLabelText("Xóa dòng 1"));
      const result = annotation.serializeAnnotation({ fast: true }).find((r) => r.from_name === "notes");
      expect(JSON.parse(result.value.text[0])).toEqual([{ name: null, quantity: null, original: null }]);
    } finally {
      cleanup();
    }
  });

  it("keeps pending legacy draft input available instead of replacing it with an empty table", () => {
    const { notes } = createStoreWithTextArea(config);
    notes.setValue("legacy,14,false", { skipDraftSave: true });
    const view = render(<HtxTextArea item={notes} />);
    try {
      expect(view.queryByTestId("table-editor")).toBeNull();
      expect(view.getByTestId("textarea-input").value).toBe("legacy,14,false");
      expect(notes._value).toBe("legacy,14,false");
    } finally {
      cleanup();
    }
  });

  it("can delete malformed legacy rows and return to the table editor", () => {
    const editableConfig = config.replace("tableColumns=", 'editable="true" transcription="true" tableColumns=');
    const { notes } = createStoreWithTextArea(editableConfig);
    notes.addText("bad,not-a-number,false");
    const view = render(<HtxTextArea item={notes} />);
    try {
      expect(view.queryByTestId("table-editor")).toBeNull();
      fireEvent.click(view.getByTestId("htx-textbox-delete-button"));
      expect(notes.selectedValues()).toEqual([]);
      expect(view.getByTestId("table-editor")).toBeDefined();
    } finally {
      cleanup();
    }
  });
});
