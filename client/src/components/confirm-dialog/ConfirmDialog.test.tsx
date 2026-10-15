import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

afterEach(cleanup);

function renderDialog(props: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfirmDialog
        open
        title="Delete run?"
        body="Its logs are removed too."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows title + body and confirms", () => {
    const { onConfirm, onCancel } = renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete run?");
    expect(dialog).toHaveTextContent("Its logs are removed too.");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels via the default common Cancel label and via Escape", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("danger variant focuses Cancel first and accepts a custom cancel label", () => {
    renderDialog({ danger: true, cancelLabel: "Keep it" });
    expect(screen.getByRole("button", { name: "Keep it" })).toHaveFocus();
  });
});
