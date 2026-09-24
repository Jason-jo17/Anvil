import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { initialValue } from "../../schema/defaults";
import { asObject, type Schema, type SchemaObject } from "../../schema/types";
import { SchemaForm } from "./SchemaForm";

function Harness({ schema, onSubmit }: { schema: Schema; onSubmit: (value: unknown) => void }) {
  const [value, setValue] = useState<unknown>(() => initialValue(asObject(schema), schema));
  return <SchemaForm schema={schema} value={value} onChange={setValue} onSubmit={onSubmit} />;
}

function setup(schema: Schema) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<Harness schema={schema} onSubmit={onSubmit} />);
  return { onSubmit, user };
}

const ticket: SchemaObject = {
  type: "object",
  $defs: {
    Address: {
      type: "object",
      title: "Address",
      properties: { city: { type: "string", title: "City" }, zip: { type: "string" } },
      required: ["city"],
    },
  },
  properties: {
    title: { type: "string", description: "Short summary" },
    priority: { enum: ["low", "high"] },
    count: { type: "integer", minimum: 1 },
    urgent: { type: "boolean" },
    tags: { type: "array", items: { type: "string" } },
    address: { $ref: "#/$defs/Address" },
    note: { anyOf: [{ type: "string" }, { type: "null" }], default: null, title: "Note" },
  },
  required: ["title", "priority", "address"],
};

describe("SchemaForm", () => {
  it("renders every field kind, including $ref targets and Optional[str]", () => {
    setup(ticket);
    expect(screen.getByLabelText(/^title/)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/^priority/)).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText(/^count/)).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText(/^urgent/)).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole("button", { name: "Add tags item" })).toBeInTheDocument();
    const address = screen.getByRole("group", { name: /Address/ });
    expect(within(address).getByLabelText(/^City/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Note/)).toHaveAttribute("type", "text");
  });

  it("blocks submit, shows inline errors and focuses the first invalid field", async () => {
    const { onSubmit, user } = setup(ticket);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText("Required")).toHaveLength(3);
    expect(screen.getByRole("alert")).toHaveTextContent("Fix the highlighted fields before running.");
    expect(screen.getByLabelText(/^title/)).toHaveFocus();
  });

  it("submits only what the user set", async () => {
    const { onSubmit, user } = setup(ticket);
    await user.type(screen.getByLabelText(/^title/), "Printer on fire");
    await user.selectOptions(screen.getByLabelText(/^priority/), "high");
    await user.type(screen.getByLabelText(/^City/), "Oslo");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith({ title: "Printer on fire", priority: "high", address: { city: "Oslo" } });
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({
      title: "Printer on fire",
      priority: "high",
      address: { city: "Oslo" },
    });
  });

  it("rejects non-numeric and fractional input in integer fields", async () => {
    const { onSubmit, user } = setup(ticket);
    await user.type(screen.getByLabelText(/^title/), "T");
    await user.selectOptions(screen.getByLabelText(/^priority/), "low");
    await user.type(screen.getByLabelText(/^City/), "Oslo");
    const count = screen.getByLabelText(/^count/);

    await user.type(count, "abc");
    expect(screen.getByText("Enter a number")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(count);
    await user.type(count, "1.5");
    expect(screen.getByText("Enter a whole number")).toBeInTheDocument();

    await user.clear(count);
    await user.type(count, "3");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }));
  });

  it("omits an optional object again once its fields are cleared", async () => {
    const { onSubmit, user } = setup({
      type: "object",
      properties: { filters: { type: "object", properties: { city: { type: "string" } } } },
    });
    await user.type(screen.getByLabelText(/^city/), "Oslo");
    await user.clear(screen.getByLabelText(/^city/));
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({});
  });

  it("adds and removes array items", async () => {
    const { onSubmit, user } = setup({ type: "object", properties: { tags: { type: "array", items: { type: "string" } } } });
    await user.click(screen.getByRole("button", { name: "Add tags item" }));
    await user.type(screen.getByLabelText(/^Item 1/), "a");
    await user.click(screen.getByRole("button", { name: "Add tags item" }));
    await user.type(screen.getByLabelText(/^Item 2/), "b");
    await user.click(screen.getByRole("button", { name: "Remove tags item 1" }));
    expect(screen.getByLabelText(/^Item 1/)).toHaveValue("b");
    expect(screen.queryByLabelText(/^Item 2/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith({ tags: ["b"] });
  });

  it("switches anyOf variants", async () => {
    const { onSubmit, user } = setup({
      type: "object",
      properties: {
        target: {
          anyOf: [
            { title: "By id", type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
            { title: "By name", type: "object", properties: { name: { type: "string" } }, required: ["name"] },
          ],
        },
      },
      required: ["target"],
    });
    expect(screen.getByLabelText(/^id/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Variant"), "By name");
    expect(screen.queryByLabelText(/^id/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name/), "alice");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith({ target: { name: "alice" } });
  });

  it("round-trips through the raw JSON view", async () => {
    const { user } = setup(ticket);
    await user.type(screen.getByLabelText(/^title/), "Printer");
    await user.selectOptions(screen.getByLabelText(/^priority/), "low");
    await user.type(screen.getByLabelText(/^City/), "Oslo");

    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    const raw = screen.getByLabelText("Arguments (JSON)");
    expect(JSON.parse((raw as HTMLTextAreaElement).value)).toStrictEqual({
      title: "Printer",
      priority: "low",
      address: { city: "Oslo" },
    });

    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    expect(screen.getByLabelText(/^title/)).toHaveValue("Printer");

    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    await user.clear(screen.getByLabelText("Arguments (JSON)"));
    await user.click(screen.getByLabelText("Arguments (JSON)"));
    await user.paste('{"title":"Changed","priority":"high","address":{"city":"Bergen"}}');
    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    expect(screen.getByLabelText(/^title/)).toHaveValue("Changed");
    expect(screen.getByLabelText(/^City/)).toHaveValue("Bergen");
  });

  it("refuses to leave raw JSON while it is invalid", async () => {
    const { user } = setup(ticket);
    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    await user.clear(screen.getByLabelText("Arguments (JSON)"));
    await user.click(screen.getByLabelText("Arguments (JSON)"));
    await user.paste("{");
    await user.click(screen.getByRole("button", { name: "Raw JSON" }));
    expect(screen.getByLabelText("Arguments (JSON)")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Invalid JSON/);
  });

  it("renders recursive schemas without hanging, switching to JSON at the cycle", async () => {
    const { user } = setup({
      type: "object",
      $defs: {
        Node: {
          type: "object",
          properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/$defs/Node" } } },
        },
      },
      properties: { tree: { $ref: "#/$defs/Node" } },
    });
    expect(screen.getByLabelText(/^name/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add children item" }));
    expect(screen.getByText(/recursive/i)).toBeInTheDocument();
  });

  it("validates draft-07 schemas", async () => {
    const { onSubmit, user } = setup({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
    expect(screen.queryByText(/could not be compiled/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("falls back to raw JSON with a warning when the schema cannot be compiled", () => {
    setup({ type: "object", properties: { a: { type: 12 as unknown as string } } });
    expect(screen.getByText(/could not be compiled/)).toBeInTheDocument();
    expect(screen.getByLabelText("Arguments (JSON)")).toBeInTheDocument();
  });

  it("handles tools that take no arguments", async () => {
    const { onSubmit, user } = setup({ type: "object" });
    expect(screen.getByText(/declares no arguments/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onSubmit).toHaveBeenCalledWith({});
  });
});
