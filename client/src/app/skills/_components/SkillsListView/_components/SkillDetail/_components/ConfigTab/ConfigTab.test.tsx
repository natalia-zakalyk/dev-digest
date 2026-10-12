import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import common from "../../../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const deleteMutate = vi.fn();
const updateMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

const skill = (over: Partial<Skill> = {}): Skill => ({
  id: "s1",
  name: "uncovered-branches",
  description: "Use on every PR.",
  type: "rubric",
  source: "manual",
  body: "# b",
  enabled: true,
  version: 1,
  ...over,
});

afterEach(() => {
  cleanup();
  deleteMutate.mockReset();
  updateMutate.mockReset();
});

function renderTab(s: Skill, cb: { onDeleted?: () => void; onToggle?: (e: boolean) => void } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <ToastProvider>
        <ConfigTab skill={s} onDeleted={cb.onDeleted ?? vi.fn()} onToggle={cb.onToggle ?? vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("shows the untrusted badge and notice for an imported skill", () => {
    renderTab(skill({ source: "imported_url" }));
    expect(screen.getByText(messages.preview.untrustedBadge)).toBeInTheDocument();
    expect(screen.getByText(messages.preview.untrustedNotice)).toBeInTheDocument();
  });

  it("shows neither for a manual skill", () => {
    renderTab(skill());
    expect(screen.queryByText(messages.preview.untrustedBadge)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.preview.untrustedNotice)).not.toBeInTheDocument();
  });

  it("delete asks for confirmation, then deletes and reports onDeleted", () => {
    const onDeleted = vi.fn();
    deleteMutate.mockImplementation((_id: string, opts: { onSuccess: () => void; onSettled: () => void }) => {
      opts.onSuccess();
      opts.onSettled();
    });
    renderTab(skill(), { onDeleted });
    fireEvent.click(screen.getByRole("button", { name: messages.preview.delete }));
    expect(deleteMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText('Delete skill "uncovered-branches"?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: messages.preview.deleteConfirm }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.any(Object));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("toggle reports the new enabled state", () => {
    const onToggle = vi.fn();
    renderTab(skill({ enabled: true }), { onToggle });
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("shows the inline editor: version, fields, filename, token count", () => {
    renderTab(skill({ version: 5, body: "# b\nline" }));
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("v5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("uncovered-branches")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Use on every PR.")).toBeInTheDocument();
    expect(screen.getByText("uncovered-branches.md")).toBeInTheDocument();
    expect(screen.getByText("2 tokens")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
  });

  it("editing the body shows 'unsaved' and Save sends the patch", () => {
    renderTab(skill());
    fireEvent.change(screen.getByRole("textbox", { name: "Skill body" }), { target: { value: "# b\nmore" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(updateMutate.mock.calls[0]![0]).toEqual({
      id: "s1",
      patch: { name: "uncovered-branches", description: "Use on every PR.", type: "rubric", body: "# b\nmore" },
    });
  });

  it("Save is blocked while the name is blank", () => {
    renderTab(skill());
    fireEvent.change(screen.getByDisplayValue("uncovered-branches"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Save skill" })).toBeDisabled();
    expect(screen.getByText("Name and body are required.")).toBeInTheDocument();
  });
});
